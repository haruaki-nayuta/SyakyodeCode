import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_PROVIDERS,
  findProvider,
  getDefaultProvider,
  fetchModels,
} from '../../src/lib/providers.js';

// プロバイダー定義とモデル一覧取得 (lib/providers.ts) のテスト。
// fetch は global を一時的に差し替えてモックする。
describe('BUILT_IN_PROVIDERS', () => {
  test('id が重複していない', () => {
    const ids = BUILT_IN_PROVIDERS.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('全プロバイダーが必要なフィールドを持つ', () => {
    for (const p of BUILT_IN_PROVIDERS) {
      assert.ok(p.id, 'id がある');
      assert.ok(p.name, 'name がある');
      assert.ok(p.baseURL.startsWith('http'), 'baseURL が http(s) で始まる');
      assert.equal(typeof p.requiresApiKey, 'boolean');
    }
  });

  test('LM Studio はローカル接続なので API キー不要', () => {
    const lm = BUILT_IN_PROVIDERS.find((p) => p.id === 'lmstudio');
    assert.ok(lm);
    assert.equal(lm!.requiresApiKey, false);
  });

  test('OpenAI 互換クラウドプロバイダーはすべて API キー必須', () => {
    const cloud = BUILT_IN_PROVIDERS.filter((p) => p.id !== 'lmstudio');
    for (const p of cloud) {
      assert.equal(p.requiresApiKey, true, `${p.id} は API キー必須のはず`);
    }
  });
});

describe('findProvider / getDefaultProvider', () => {
  test('存在する id を渡すと該当プロバイダーを返す', () => {
    const p = findProvider('openai');
    assert.ok(p);
    assert.equal(p!.id, 'openai');
  });

  test('存在しない id では undefined', () => {
    assert.equal(findProvider('nonexistent'), undefined);
  });

  test('undefined を渡しても落ちずに undefined を返す', () => {
    assert.equal(findProvider(undefined), undefined);
  });

  test('getDefaultProvider はリストの先頭 (lmstudio)', () => {
    const def = getDefaultProvider();
    assert.equal(def.id, 'lmstudio');
  });
});

describe('fetchModels', () => {
  // 元の fetch を退避して、テストごとにモックを差し替えるための変数。
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // テストでよく使うダミー Provider。
  const provider = {
    id: 'test',
    name: 'Test',
    baseURL: 'https://example.test/v1',
    requiresApiKey: true,
    modelsPath: '/models',
  } as const;

  test('{ data: [...] } 形式の OpenAI 互換レスポンスをパースする', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof globalThis.fetch;

    const models = await fetchModels(provider, 'sk-test');
    // ソート済みで返ってくる。
    assert.deepEqual(
      models.map((m) => m.id),
      ['gpt-4o', 'gpt-4o-mini'],
    );
  });

  test('トップレベルが配列の形式もパースする', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify([{ id: 'b' }, { id: 'a' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof globalThis.fetch;

    const models = await fetchModels(provider, undefined);
    // アルファベット順にソートされる。
    assert.deepEqual(
      models.map((m) => m.id),
      ['a', 'b'],
    );
  });

  test('重複 id は 1 件だけ残す', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: [{ id: 'x' }, { id: 'x' }, { id: 'y' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof globalThis.fetch;

    const models = await fetchModels(provider, 'sk');
    assert.deepEqual(
      models.map((m) => m.id),
      ['x', 'y'],
    );
  });

  test('id が文字列でない / 空のエントリは無視する', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 'ok' },
            { id: '' }, // 空文字列は無視
            { id: 123 }, // 数値は無視
            { foo: 'bar' }, // id が無いものは無視
            null,
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof globalThis.fetch;

    const models = await fetchModels(provider, 'sk');
    assert.deepEqual(
      models.map((m) => m.id),
      ['ok'],
    );
  });

  test('apiKey が与えられたら Authorization ヘッダーが付く', async () => {
    let capturedHeaders: Record<string, string> | undefined;
    globalThis.fetch = (async (_url: any, init: any) => {
      capturedHeaders = init?.headers ?? {};
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof globalThis.fetch;

    await fetchModels(provider, 'sk-xyz');
    assert.equal(capturedHeaders!.Authorization, 'Bearer sk-xyz');
    assert.equal(capturedHeaders!.Accept, 'application/json');
  });

  test('apiKey が無いと Authorization ヘッダーは付かない', async () => {
    let capturedHeaders: Record<string, string> | undefined;
    globalThis.fetch = (async (_url: any, init: any) => {
      capturedHeaders = init?.headers ?? {};
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof globalThis.fetch;

    await fetchModels(provider, undefined);
    assert.equal(capturedHeaders!.Authorization, undefined);
  });

  test('extraHeaders が指定されているとマージされる（OpenRouter の HTTP-Referer など）', async () => {
    let capturedHeaders: Record<string, string> | undefined;
    globalThis.fetch = (async (_url: any, init: any) => {
      capturedHeaders = init?.headers ?? {};
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof globalThis.fetch;

    await fetchModels(
      {
        id: 'orouter',
        name: 'OpenRouter',
        baseURL: 'https://openrouter.ai/api/v1',
        requiresApiKey: true,
        modelsPath: '/models',
        extraHeaders: { 'HTTP-Referer': 'https://example.com', 'X-Title': 'Test' },
      },
      'sk-or',
    );
    assert.equal(capturedHeaders!['HTTP-Referer'], 'https://example.com');
    assert.equal(capturedHeaders!['X-Title'], 'Test');
    // 通常のヘッダーも残る。
    assert.equal(capturedHeaders!.Authorization, 'Bearer sk-or');
  });

  test('baseURL の末尾スラッシュは削られ、modelsPath が連結される', async () => {
    let capturedUrl: string | undefined;
    globalThis.fetch = (async (url: any) => {
      capturedUrl = typeof url === 'string' ? url : url.toString();
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof globalThis.fetch;

    await fetchModels(
      { id: 't', name: 'T', baseURL: 'https://example.test/v1///', requiresApiKey: false },
      undefined,
    );
    // modelsPath 未指定なら "/models" がデフォルト。末尾スラッシュは除去。
    assert.equal(capturedUrl, 'https://example.test/v1/models');
  });

  test('非 2xx 応答ではエラーを投げる（ステータス文字列を含む）', async () => {
    globalThis.fetch = (async () =>
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })) as typeof globalThis.fetch;

    await assert.rejects(
      () => fetchModels(provider, 'sk-bad'),
      (err: Error) => /401/.test(err.message),
    );
  });

  test('AbortSignal を fetch に渡せる', async () => {
    let capturedSignal: AbortSignal | undefined;
    globalThis.fetch = (async (_url: any, init: any) => {
      capturedSignal = init?.signal;
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof globalThis.fetch;

    const controller = new AbortController();
    await fetchModels(provider, 'sk', controller.signal);
    assert.equal(capturedSignal, controller.signal);
  });
});
