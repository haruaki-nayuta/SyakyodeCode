import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadAuthAll,
  getAuth,
  getApiKey,
  setApiKey,
  removeAuth,
  maskApiKey,
} from '../../src/lib/auth.js';
import { setupIsolatedEnv, type IsolatedEnv } from '../helpers/env.js';

// API キー永続化 (lib/auth.ts) のテスト。
// 実ホームの auth.json を絶対に汚さないように XDG_DATA_HOME を差し替える。
describe('maskApiKey', () => {
  // ファイル I/O を伴わない純粋関数。
  test('空文字列は "" を返す', () => {
    assert.equal(maskApiKey(''), '');
  });

  test('8 文字以下のキーは "****" にマスクされる', () => {
    assert.equal(maskApiKey('short'), '****');
    assert.equal(maskApiKey('12345678'), '****');
  });

  test('9 文字以上のキーは前 4 文字 + … + 後ろ 4 文字', () => {
    assert.equal(maskApiKey('sk-abcdefghijklmnop'), 'sk-a…mnop');
  });
});

describe('auth ファイルストア', () => {
  let env: IsolatedEnv;
  beforeEach(() => {
    env = setupIsolatedEnv();
  });
  afterEach(() => {
    env.cleanup();
  });

  test('ファイル不在のときは空ストアを返す', () => {
    assert.deepEqual(loadAuthAll(), {});
    assert.equal(getApiKey('openai'), undefined);
    assert.equal(getAuth('openai'), undefined);
  });

  test('setApiKey → getApiKey でラウンドトリップ', () => {
    setApiKey('openai', 'sk-test-1234567890');
    assert.equal(getApiKey('openai'), 'sk-test-1234567890');
    assert.deepEqual(getAuth('openai'), { type: 'api', key: 'sk-test-1234567890' });
  });

  test('複数プロバイダーのキーを独立して保持できる', () => {
    setApiKey('openai', 'sk-openai-xxxx');
    setApiKey('groq', 'gsk-groq-xxxx');
    assert.equal(getApiKey('openai'), 'sk-openai-xxxx');
    assert.equal(getApiKey('groq'), 'gsk-groq-xxxx');
    assert.equal(getApiKey('openrouter'), undefined);
  });

  test('removeAuth で該当プロバイダーだけ削除される', () => {
    setApiKey('openai', 'sk-openai');
    setApiKey('groq', 'gsk-groq');
    removeAuth('openai');
    assert.equal(getApiKey('openai'), undefined);
    assert.equal(getApiKey('groq'), 'gsk-groq');
  });

  test('保存ファイルが 0600 パーミッションで書かれる（ユーザーのみ読み書き可）', () => {
    setApiKey('openai', 'sk-secret');
    const authPath = path.join(env.dir, 'syakyode-code', 'auth.json');
    assert.equal(fs.existsSync(authPath), true);
    const stat = fs.statSync(authPath);
    // パーミッションの下位 9bit を比較する。
    const mode = stat.mode & 0o777;
    assert.equal(mode, 0o600);
  });
});

describe('SYAKYODE_AUTH_CONTENT 環境変数オーバーライド', () => {
  let env: IsolatedEnv;
  beforeEach(() => {
    env = setupIsolatedEnv();
  });
  afterEach(() => {
    env.cleanup();
  });

  test('環境変数が設定されているとファイルではなく環境変数の内容が使われる', () => {
    // ファイル側には別のキーを書いておく。
    setApiKey('openai', 'sk-from-file');
    // 環境変数の方が優先されるはず。
    process.env.SYAKYODE_AUTH_CONTENT = JSON.stringify({
      openai: { type: 'api', key: 'sk-from-env' },
    });
    assert.equal(getApiKey('openai'), 'sk-from-env');
  });

  test('環境変数が壊れた JSON のときはファイルにフォールバックする', () => {
    setApiKey('openai', 'sk-from-file');
    process.env.SYAKYODE_AUTH_CONTENT = '{ not json';
    assert.equal(getApiKey('openai'), 'sk-from-file');
  });

  test('環境変数が空文字列のときはファイルを使う', () => {
    setApiKey('openai', 'sk-from-file');
    process.env.SYAKYODE_AUTH_CONTENT = '';
    assert.equal(getApiKey('openai'), 'sk-from-file');
  });
});
