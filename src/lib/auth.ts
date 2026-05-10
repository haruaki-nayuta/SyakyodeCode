import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ApiKeyAuth {
  type: 'api';
  key: string;
}

export type AuthInfo = ApiKeyAuth;

export type AuthStore = Record<string, AuthInfo>;

function getAuthPath(): string {
  const xdg = process.env.XDG_DATA_HOME;
  const baseDir = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.local', 'share');
  return path.join(baseDir, 'syakyode-code', 'auth.json');
}

export function loadAuthAll(): AuthStore {
  const envOverride = process.env.SYAKYODE_AUTH_CONTENT;
  if (envOverride && envOverride.length > 0) {
    try {
      const parsed = JSON.parse(envOverride);
      if (parsed && typeof parsed === 'object') return parsed as AuthStore;
    } catch {
      // fall through to file
    }
  }
  try {
    const raw = fs.readFileSync(getAuthPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as AuthStore;
  } catch {
    // missing or unreadable: empty store
  }
  return {};
}

export function getAuth(providerId: string): AuthInfo | undefined {
  return loadAuthAll()[providerId];
}

export function getApiKey(providerId: string): string | undefined {
  const info = getAuth(providerId);
  return info && info.type === 'api' ? info.key : undefined;
}

export function setApiKey(providerId: string, key: string): void {
  const store = loadAuthAll();
  store[providerId] = { type: 'api', key };
  saveAuthStore(store);
}

export function removeAuth(providerId: string): void {
  const store = loadAuthAll();
  delete store[providerId];
  saveAuthStore(store);
}

function saveAuthStore(store: AuthStore): void {
  const filePath = getAuthPath();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // best-effort
  }
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // best-effort
  }
}

export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '…' + key.slice(-4);
}
