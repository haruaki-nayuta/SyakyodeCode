import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FILE_NAME = 'Syakyode.md';
const MAX_BYTES = 50 * 1024;

export type SyakyodeScope = 'global' | 'project';

export function getProjectPath(): string {
  return path.join(process.cwd(), FILE_NAME);
}

export function getGlobalPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const baseDir = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config');
  return path.join(baseDir, 'syakyode-code', FILE_NAME);
}

export function getPath(scope: SyakyodeScope): string {
  return scope === 'global' ? getGlobalPath() : getProjectPath();
}

function readSafely(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_BYTES) {
      const fd = fs.openSync(filePath, 'r');
      try {
        const buf = Buffer.alloc(MAX_BYTES);
        fs.readSync(fd, buf, 0, MAX_BYTES, 0);
        return buf.toString('utf8');
      } finally {
        fs.closeSync(fd);
      }
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function loadAddendum(): string {
  const sections: string[] = [];
  const global = readSafely(getGlobalPath());
  if (global && global.trim().length > 0) {
    sections.push(
      `ユーザー定義の追加ルール（グローバル ${FILE_NAME} より）:\n${global.trim()}`,
    );
  }
  const project = readSafely(getProjectPath());
  if (project && project.trim().length > 0) {
    sections.push(
      `ユーザー定義の追加ルール（プロジェクト ${FILE_NAME} より）:\n${project.trim()}`,
    );
  }
  if (sections.length === 0) return '';
  return '\n\n---\n' + sections.join('\n\n---\n');
}

export function appendLine(scope: SyakyodeScope, line: string): void {
  const target = getPath(scope);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let prefix = '';
  if (fs.existsSync(target)) {
    const current = fs.readFileSync(target, 'utf8');
    if (current.length > 0 && !current.endsWith('\n')) prefix = '\n';
  }
  fs.appendFileSync(target, prefix + line.trimEnd() + '\n', 'utf8');
}

export interface EditorResult {
  ok: boolean;
  path: string;
  message?: string;
}

export function openInEditor(scope: SyakyodeScope): EditorResult {
  const target = getPath(scope);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, '', 'utf8');
    }
  } catch (e: any) {
    return { ok: false, path: target, message: e?.message ?? String(e) };
  }

  const editor =
    process.env.VISUAL || process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'vi');

  const result = spawnSync(editor, [target], { stdio: 'inherit', shell: false });
  if (result.error) {
    return { ok: false, path: target, message: result.error.message };
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    return { ok: false, path: target, message: `editor exited with code ${result.status}` };
  }
  return { ok: true, path: target };
}
