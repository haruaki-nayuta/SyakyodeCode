import OpenAI from 'openai';
import { Provider, findProvider, getDefaultProvider } from './providers.js';
import { getApiKey } from './auth.js';
import { loadSettings } from './settings.js';

const SYSTEM_PROMPT = `あなたは「写経 (programming transcription practice)」用のサンプルコードを生成するアシスタントです。
ユーザーから渡される問題文や学習トピックに対して、写経しやすい短いコードスニペット**だけ**を出力してください。

厳守ルール:
- 出力は「写経対象のコード本体」のみ。挨拶・前置き・解説・後書きは禁止。
- Markdownの \`\`\` フェンスや言語タグも出力しない。
- コメントは最小限に。コードがすぐ動くこと（構文的に閉じていること）を優先する。
- 行数の目安は 8〜30 行。長すぎず短すぎず。
- インデントはスペース2か4で統一。タブ文字は使わない。
- ASCII主体で書く。日本語コメントを入れる場合でも全角スペースは使わない。`;

export interface ResolvedConfig {
  provider: Provider;
  model: string;
  hasApiKey: boolean;
}

export function resolveActiveConfig(): ResolvedConfig {
  const settings = loadSettings();
  const provider =
    findProvider(settings.providerId) ??
    findProvider(process.env.SYAKYODE_PROVIDER) ??
    getDefaultProvider();
  const model =
    settings.model ?? process.env.SYAKYODE_MODEL ?? provider.defaultModel ?? '';
  const apiKey = getApiKey(provider.id) ?? readEnvApiKey(provider.id);
  return {
    provider,
    model,
    hasApiKey: !!apiKey || !provider.requiresApiKey,
  };
}

function readEnvApiKey(providerId: string): string | undefined {
  const envKey = `SYAKYODE_${providerId.toUpperCase()}_API_KEY`;
  return process.env[envKey];
}

export interface PreviousContext {
  prompt: string;
  code: string;
}

export interface GenerateOptions {
  prompt: string;
  language?: string;
  signal?: AbortSignal;
  previous?: PreviousContext;
  withExplanation?: boolean;
}

const RELATED_SYSTEM_NOTE = `

追加指示（auto モード）:
- ユーザーが直前に写経したお題とコードが提示されます。
- 同じ言語・同じ難易度帯で、関連するが異なるトピックを 1 つだけ選び、その写経用コードを返してください。
- 直前のコードと同じ内容や見た目をほぼ繰り返してはいけません。`;

const EXPLANATION_FORMAT_NOTE = `

出力フォーマット（厳守）:
- 以下の2つのタグで出力を区切ってください。タグ以外の前置き・後書きは禁止。
- <CODE> と </CODE> の間には写経対象のコード本体のみを入れる。
- <EXPLANATION> と </EXPLANATION> の間には日本語のコード解説を入れる。100〜300字を目安。短いコードならそれより短くてOK。

<CODE>
（ここに写経対象のコード本体）
</CODE>
<EXPLANATION>
（ここに日本語の解説）
</EXPLANATION>`;

export interface GeneratedSnippet {
  code: string;
  explanation: string | null;
}

export async function generateSnippet({
  prompt,
  language,
  signal,
  previous,
  withExplanation,
}: GenerateOptions): Promise<GeneratedSnippet> {
  const { provider, model } = resolveActiveConfig();
  if (!model) {
    throw new Error('モデルが未設定です。/model から選択してください。');
  }
  const apiKey = getApiKey(provider.id) ?? readEnvApiKey(provider.id);
  if (provider.requiresApiKey && !apiKey) {
    throw new Error(`${provider.name} のAPIキーが未設定です。/model から登録してください。`);
  }

  const client = new OpenAI({
    baseURL: provider.baseURL,
    apiKey: apiKey ?? 'no-key',
    defaultHeaders: provider.extraHeaders,
  });

  let systemContent = SYSTEM_PROMPT;
  if (previous) systemContent += RELATED_SYSTEM_NOTE;
  if (withExplanation) systemContent += EXPLANATION_FORMAT_NOTE;
  const userContent = buildUserContent({ prompt, language, previous });

  const response = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      temperature: previous ? 0.6 : 0.4,
    },
    { signal },
  );

  const choice = response.choices[0];
  const raw = choice?.message?.content ?? '';
  const parsed = parseResponse(raw);
  if (parsed.code.length > 0) return parsed;

  const finish = choice?.finish_reason;
  const reasoning =
    (choice?.message as any)?.reasoning ??
    (choice?.message as any)?.reasoning_content ??
    '';
  const detail =
    finish === 'length'
      ? '応答がトークン上限で切れた可能性があります'
      : reasoning
        ? '思考過程のみ返り、本文が空でした (reasoning モデルの挙動)'
        : `finish_reason=${finish ?? 'unknown'}`;
  throw new Error(`LLMからの出力が空でした: ${detail}`);
}

function buildUserContent({
  prompt,
  language,
  previous,
}: {
  prompt: string;
  language?: string;
  previous?: PreviousContext;
}): string {
  const langLine = language && language !== 'auto' ? `使用言語: ${language}\n` : '';
  if (previous) {
    return (
      `${langLine}直前のお題: ${previous.prompt}\n\n` +
      `直前のコード:\n${previous.code}\n\n` +
      `上記と関連するが異なるトピックを 1 つ選び、同じ言語・同じ難易度帯で写経用コードを返してください。`
    );
  }
  return langLine
    ? `${langLine}お題: ${prompt}\n\n上記の言語で写経用コードを出力してください。`
    : prompt;
}

function stripThinkBlocks(text: string): string {
  // Strip reasoning-model think blocks that some providers embed in content
  // (DeepSeek-R1 / QwQ on direct endpoints; OpenRouter splits these out itself).
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  out = out.replace(/<\|begin_of_thought\|>[\s\S]*?<\|end_of_thought\|>/gi, '');
  return out;
}

function normalizeCode(raw: string): string {
  let text = raw.trim();

  const fenceMatch = text.match(/```[a-zA-Z0-9_+-]*\n([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1];
  }

  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\t/g, '  ');
  text = text.replace(/[ \t]+$/gm, '');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

function normalizeExplanation(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function parseResponse(raw: string): GeneratedSnippet {
  const stripped = stripThinkBlocks(raw);

  const codeMatch = stripped.match(/<CODE>\s*([\s\S]*?)\s*<\/CODE>/i);
  const explMatch = stripped.match(/<EXPLANATION>\s*([\s\S]*?)\s*<\/EXPLANATION>/i);

  if (codeMatch) {
    const code = normalizeCode(codeMatch[1]);
    const explanation = explMatch ? normalizeExplanation(explMatch[1]) : null;
    return { code, explanation: explanation && explanation.length > 0 ? explanation : null };
  }

  // Fallback: no tags — treat the whole response as code.
  return { code: normalizeCode(stripped), explanation: null };
}

export function getModelInfo() {
  const cfg = resolveActiveConfig();
  return {
    baseURL: cfg.provider.baseURL,
    model: cfg.model || '(未設定)',
    providerId: cfg.provider.id,
    providerName: cfg.provider.name,
    hasApiKey: cfg.hasApiKey,
  };
}

const SNIPPET_CHAT_SYSTEM = `あなたはプログラミング写経学習を支援するアシスタントです。
ユーザーは写経用のコードスニペットと（任意で）日本語の解説を見ながら学習しています。
そのコードや解説について日本語で質問されるので、簡潔・正確に答えてください。

ルール:
- 質問にだけ答える。前置きや過剰な定型句は避ける。
- 引用するコード片は短くする。長いコードを丸ごと貼り直さない。
- Markdownの見出しや太字、コードフェンスは使わず、素のテキストで答える。
- 1〜5文程度の手短な回答を目安にする。`;

export interface SnippetChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SnippetChatOptions {
  code: string;
  explanation: string | null;
  language?: string;
  prompt?: string | null;
  history: SnippetChatMessage[];
  question: string;
  signal?: AbortSignal;
}

export async function chatAboutSnippet({
  code,
  explanation,
  language,
  prompt,
  history,
  question,
  signal,
}: SnippetChatOptions): Promise<string> {
  const { provider, model } = resolveActiveConfig();
  if (!model) {
    throw new Error('モデルが未設定です。/model から選択してください。');
  }
  const apiKey = getApiKey(provider.id) ?? readEnvApiKey(provider.id);
  if (provider.requiresApiKey && !apiKey) {
    throw new Error(`${provider.name} のAPIキーが未設定です。/model から登録してください。`);
  }

  const client = new OpenAI({
    baseURL: provider.baseURL,
    apiKey: apiKey ?? 'no-key',
    defaultHeaders: provider.extraHeaders,
  });

  const contextLines: string[] = [];
  if (language && language !== 'auto') contextLines.push(`言語: ${language}`);
  if (prompt) contextLines.push(`お題: ${prompt}`);
  contextLines.push('', 'コード:', code);
  if (explanation) {
    contextLines.push('', '解説:', explanation);
  }

  const systemContent =
    SNIPPET_CHAT_SYSTEM + '\n\n--- 学習中のスニペット ---\n' + contextLines.join('\n');

  const messages = [
    { role: 'system' as const, content: systemContent },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: question },
  ];

  const response = await client.chat.completions.create(
    {
      model,
      messages,
      temperature: 0.4,
    },
    { signal },
  );

  const choice = response.choices[0];
  const raw = choice?.message?.content ?? '';
  const text = stripThinkBlocks(raw).trim();
  if (!text) {
    const finish = choice?.finish_reason;
    throw new Error(`LLMからの応答が空でした: finish_reason=${finish ?? 'unknown'}`);
  }
  return text;
}
