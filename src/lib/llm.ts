import OpenAI from 'openai';

const DEFAULT_BASE_URL = process.env.LMSTUDIO_BASE_URL ?? 'http://localhost:1234/v1';
const DEFAULT_MODEL = process.env.LMSTUDIO_MODEL ?? 'openai/gpt-oss-20b';

const client = new OpenAI({
  baseURL: DEFAULT_BASE_URL,
  apiKey: 'lm-studio',
});

const SYSTEM_PROMPT = `あなたは「写経 (programming transcription practice)」用のサンプルコードを生成するアシスタントです。
ユーザーから渡される問題文や学習トピックに対して、写経しやすい短いコードスニペット**だけ**を出力してください。

厳守ルール:
- 出力は「写経対象のコード本体」のみ。挨拶・前置き・解説・後書きは禁止。
- Markdownの \`\`\` フェンスや言語タグも出力しない。
- コメントは最小限に。コードがすぐ動くこと（構文的に閉じていること）を優先する。
- 行数の目安は 8〜30 行。長すぎず短すぎず。
- インデントはスペース2か4で統一。タブ文字は使わない。
- ASCII主体で書く。日本語コメントを入れる場合でも全角スペースは使わない。`;

export interface GenerateOptions {
  prompt: string;
  language?: string;
  signal?: AbortSignal;
}

export async function generateSnippet({ prompt, language, signal }: GenerateOptions): Promise<string> {
  const userContent =
    language && language !== 'auto'
      ? `使用言語: ${language}\nお題: ${prompt}\n\n上記の言語で写経用コードを出力してください。`
      : prompt;

  const response = await client.chat.completions.create(
    {
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.4,
      max_tokens: 800,
    },
    { signal },
  );

  const raw = response.choices[0]?.message?.content ?? '';
  return sanitize(raw);
}

function sanitize(raw: string): string {
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

export function getModelInfo() {
  return { baseURL: DEFAULT_BASE_URL, model: DEFAULT_MODEL };
}
