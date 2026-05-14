import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadSettings, saveSettings } from '../../src/lib/settings.js';
import { setupIsolatedEnv, type IsolatedEnv } from '../helpers/env.js';

// 設定の永続化 (lib/settings.ts) のテスト。
// 既存のユーザー設定を上書きしないように、XDG_CONFIG_HOME を一時ディレクトリへ差し替える。
describe('settings', () => {
  let env: IsolatedEnv;
  beforeEach(() => {
    env = setupIsolatedEnv();
  });
  afterEach(() => {
    env.cleanup();
  });

  test('設定ファイルが存在しない場合は空オブジェクトを返す', () => {
    const s = loadSettings();
    assert.deepEqual(s, {});
  });

  test('saveSettings → loadSettings でラウンドトリップできる', () => {
    saveSettings({
      language: 'Python',
      providerId: 'openai',
      model: 'gpt-4o-mini',
      auto: true,
      explanation: false,
      autoIndent: true,
    });
    const loaded = loadSettings();
    assert.deepEqual(loaded, {
      language: 'Python',
      providerId: 'openai',
      model: 'gpt-4o-mini',
      auto: true,
      explanation: false,
      autoIndent: true,
    });
  });

  test('上書き保存ができる', () => {
    saveSettings({ language: 'Python', auto: false });
    saveSettings({ language: 'Go', auto: true });
    const loaded = loadSettings();
    assert.deepEqual(loaded, { language: 'Go', auto: true });
  });

  test('保存先は XDG_CONFIG_HOME/syakyode-code/settings.json', () => {
    saveSettings({ language: 'Rust' });
    const expected = path.join(env.dir, 'syakyode-code', 'settings.json');
    assert.equal(fs.existsSync(expected), true);
    const raw = fs.readFileSync(expected, 'utf8');
    // 末尾に改行が付き、整形済み JSON で書かれている。
    assert.ok(raw.endsWith('\n'));
    assert.deepEqual(JSON.parse(raw), { language: 'Rust' });
  });

  test('壊れた JSON が書かれていても空オブジェクトを返す（クラッシュしない）', () => {
    const p = path.join(env.dir, 'syakyode-code', 'settings.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '{ broken json', 'utf8');
    assert.deepEqual(loadSettings(), {});
  });

  test('JSON だが非オブジェクト（配列・null など）の場合も空オブジェクトを返す', () => {
    const p = path.join(env.dir, 'syakyode-code', 'settings.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });

    fs.writeFileSync(p, 'null', 'utf8');
    assert.deepEqual(loadSettings(), {});

    fs.writeFileSync(p, '"a string"', 'utf8');
    assert.deepEqual(loadSettings(), {});
  });
});
