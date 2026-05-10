export interface Provider {
  id: string;
  name: string;
  baseURL: string;
  requiresApiKey: boolean;
  defaultModel?: string;
  modelsPath?: string;
  extraHeaders?: Record<string, string>;
}

export const BUILT_IN_PROVIDERS: Provider[] = [
  {
    id: 'lmstudio',
    name: 'LM Studio (local)',
    baseURL: 'http://localhost:1234/v1',
    requiresApiKey: false,
    defaultModel: 'openai/gpt-oss-20b',
    modelsPath: '/models',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    requiresApiKey: true,
    defaultModel: 'gpt-4o-mini',
    modelsPath: '/models',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    requiresApiKey: true,
    defaultModel: 'anthropic/claude-3.5-sonnet',
    modelsPath: '/models',
    extraHeaders: {
      'HTTP-Referer': 'https://github.com/haruaki-nayuta/SyakyodeCode',
      'X-Title': 'SyakyodeCode',
    },
  },
  {
    id: 'groq',
    name: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    requiresApiKey: true,
    defaultModel: 'llama-3.3-70b-versatile',
    modelsPath: '/models',
  },
  {
    id: 'together',
    name: 'Together AI',
    baseURL: 'https://api.together.xyz/v1',
    requiresApiKey: true,
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    modelsPath: '/models',
  },
];

export function findProvider(id: string | undefined): Provider | undefined {
  if (!id) return undefined;
  return BUILT_IN_PROVIDERS.find((p) => p.id === id);
}

export function getDefaultProvider(): Provider {
  return BUILT_IN_PROVIDERS[0];
}

export interface FetchedModel {
  id: string;
}

export async function fetchModels(
  provider: Provider,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<FetchedModel[]> {
  const url = provider.baseURL.replace(/\/+$/, '') + (provider.modelsPath ?? '/models');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (provider.extraHeaders) Object.assign(headers, provider.extraHeaders);

  const res = await fetch(url, { headers, signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  const json: any = await res.json();
  const data: any[] = Array.isArray(json) ? json : json?.data ?? [];
  const seen = new Set<string>();
  const models: FetchedModel[] = [];
  for (const item of data) {
    const id: unknown = item?.id;
    if (typeof id !== 'string' || id.length === 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    models.push({ id });
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  return models;
}
