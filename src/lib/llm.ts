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
}

const RELATED_SYSTEM_NOTE = `

追加指示（auto モード）:
- ユーザーが直前に写経したお題とコードが提示されます。
- 同じ言語・同じ難易度帯で、関連するが異なるトピックを 1 つだけ選び、その写経用コードを返してください。
- 直前のコードと同じ内容や見た目をほぼ繰り返してはいけません。`;

export async function generateSnippet({ prompt, language, signal, previous }: GenerateOptions): Promise<string> {
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

  const systemContent = previous ? `${SYSTEM_PROMPT}${RELATED_SYSTEM_NOTE}` : SYSTEM_PROMPT;
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
  const cleaned = sanitize(raw);
  if (cleaned.length > 0) return cleaned;

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

function sanitize(raw: string): string {
  let text = raw;

  // Strip reasoning-model think blocks that some providers embed in content
  // (DeepSeek-R1 / QwQ on direct endpoints; OpenRouter splits these out itself).
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<\|begin_of_thought\|>[\s\S]*?<\|end_of_thought\|>/gi, '');

  text = text.trim();

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
