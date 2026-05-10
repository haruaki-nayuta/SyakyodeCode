import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface Settings {
  language?: string;
  providerId?: string;
  model?: string;
  auto?: boolean;
  explanation?: boolean;
}

function getSettingsPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const baseDir = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config');
  return path.join(baseDir, 'syakyode-code', 'settings.json');
}

export function loadSettings(): Settings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Settings;
    return {};
  } catch {
    return {};
  }
}

export function saveSettings(next: Settings): void {
  const filePath = getSettingsPath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  } catch {
    // 永続化に失敗してもアプリは続行
  }
}
