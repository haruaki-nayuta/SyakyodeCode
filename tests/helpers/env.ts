import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// テスト中に環境変数や一時ディレクトリを差し替えるためのユーティリティ。
// 本物のホームディレクトリにある設定/認証情報を絶対に書き換えないように、
// 各テストファイルから setupIsolatedEnv() を呼んで XDG_* を一時ディレクトリへ向ける。
export interface IsolatedEnv {
  /** 一時ディレクトリのパス。XDG_CONFIG_HOME / XDG_DATA_HOME の両方にセットされる。 */
  dir: string;
  /** 環境変数と一時ディレクトリを元に戻す。 */
  cleanup: () => void;
}

// 上書きしたい環境変数の一覧。テスト終了時に元の値（or 未設定）に戻す。
const TRACKED_ENV_VARS = [
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'SYAKYODE_AUTH_CONTENT',
  'SYAKYODE_PROVIDER',
  'SYAKYODE_MODEL',
  'SYAKYODE_LMSTUDIO_API_KEY',
  'SYAKYODE_OPENAI_API_KEY',
  'SYAKYODE_OPENROUTER_API_KEY',
  'SYAKYODE_GROQ_API_KEY',
  'SYAKYODE_TOGETHER_API_KEY',
] as const;

export function setupIsolatedEnv(): IsolatedEnv {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syakyode-test-'));

  // 現在の値をすべて退避してから上書きする。
  const previous = new Map<string, string | undefined>();
  for (const key of TRACKED_ENV_VARS) {
    previous.set(key, process.env[key]);
  }

  // テスト用の隔離ディレクトリへ向ける。
  process.env.XDG_CONFIG_HOME = dir;
  process.env.XDG_DATA_HOME = dir;
  // 残っていると設定ファイルより優先されてしまうので消す。
  delete process.env.SYAKYODE_AUTH_CONTENT;
  delete process.env.SYAKYODE_PROVIDER;
  delete process.env.SYAKYODE_MODEL;
  delete process.env.SYAKYODE_LMSTUDIO_API_KEY;
  delete process.env.SYAKYODE_OPENAI_API_KEY;
  delete process.env.SYAKYODE_OPENROUTER_API_KEY;
  delete process.env.SYAKYODE_GROQ_API_KEY;
  delete process.env.SYAKYODE_TOGETHER_API_KEY;

  return {
    dir,
    cleanup() {
      // 環境変数を退避前の状態に戻す。
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      // 一時ディレクトリは消す（失敗しても続行する）。
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}
