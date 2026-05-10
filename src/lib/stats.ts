import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface StatsRecord {
  ts: string;
  language: string;
  providerId: string;
  providerName: string;
  model: string;
  totalChars: number;
  correct: number;
  mistakes: number;
  accuracy: number;
  durationMs: number;
  wpm: number;
}

export function getStatsPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const baseDir = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config');
  return path.join(baseDir, 'syakyode-code', 'stats.jsonl');
}

export interface BuildRecordInput {
  language: string;
  providerId: string;
  providerName: string;
  model: string;
  totalChars: number;
  typed: number;
  correct: number;
  mistakes: number;
  durationMs: number;
  ts?: Date;
}

export function buildRecord(input: BuildRecordInput): StatsRecord {
  const accuracy = input.typed === 0 ? 1.0 : input.correct / input.typed;
  const wpm =
    input.durationMs > 0
      ? input.totalChars / 5 / (input.durationMs / 60000)
      : 0;
  return {
    ts: (input.ts ?? new Date()).toISOString(),
    language: input.language,
    providerId: input.providerId,
    providerName: input.providerName,
    model: input.model,
    totalChars: input.totalChars,
    correct: input.correct,
    mistakes: input.mistakes,
    accuracy: round(accuracy, 4),
    durationMs: input.durationMs,
    wpm: round(wpm, 2),
  };
}

export function appendRecord(record: StatsRecord): void {
  const filePath = getStatsPath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
  } catch {
    // 永続化に失敗してもアプリは続行
  }
}

export function loadAllRecords(): StatsRecord[] {
  const filePath = getStatsPath();
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const out: StatsRecord[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (isStatsRecord(parsed)) out.push(parsed);
    } catch {
      // 壊れた行はスキップ
    }
  }
  return out;
}

function isStatsRecord(value: unknown): value is StatsRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.ts === 'string' &&
    typeof v.language === 'string' &&
    typeof v.providerId === 'string' &&
    typeof v.providerName === 'string' &&
    typeof v.model === 'string' &&
    typeof v.totalChars === 'number' &&
    typeof v.correct === 'number' &&
    typeof v.mistakes === 'number' &&
    typeof v.accuracy === 'number' &&
    typeof v.durationMs === 'number' &&
    typeof v.wpm === 'number'
  );
}

export interface OverallSummary {
  sessions: number;
  totalChars: number;
  totalDurationMs: number;
  avgAccuracy: number;
  avgWpm: number;
  bestWpm: number;
}

export interface LanguageSummary {
  language: string;
  sessions: number;
  avgWpm: number;
  avgAccuracy: number;
}

export function summarizeOverall(records: StatsRecord[]): OverallSummary {
  if (records.length === 0) {
    return {
      sessions: 0,
      totalChars: 0,
      totalDurationMs: 0,
      avgAccuracy: 0,
      avgWpm: 0,
      bestWpm: 0,
    };
  }
  let totalChars = 0;
  let totalDurationMs = 0;
  let accSum = 0;
  let wpmSum = 0;
  let bestWpm = 0;
  for (const r of records) {
    totalChars += r.totalChars;
    totalDurationMs += r.durationMs;
    accSum += r.accuracy;
    wpmSum += r.wpm;
    if (r.wpm > bestWpm) bestWpm = r.wpm;
  }
  return {
    sessions: records.length,
    totalChars,
    totalDurationMs,
    avgAccuracy: accSum / records.length,
    avgWpm: wpmSum / records.length,
    bestWpm,
  };
}

export function summarizeByLanguage(records: StatsRecord[]): LanguageSummary[] {
  const groups = new Map<string, StatsRecord[]>();
  for (const r of records) {
    const list = groups.get(r.language) ?? [];
    list.push(r);
    groups.set(r.language, list);
  }
  const out: LanguageSummary[] = [];
  for (const [language, list] of groups) {
    const wpmSum = list.reduce((s, r) => s + r.wpm, 0);
    const accSum = list.reduce((s, r) => s + r.accuracy, 0);
    out.push({
      language,
      sessions: list.length,
      avgWpm: wpmSum / list.length,
      avgAccuracy: accSum / list.length,
    });
  }
  out.sort((a, b) => b.sessions - a.sessions);
  return out;
}

export function recentRecords(records: StatsRecord[], n: number): StatsRecord[] {
  const sorted = records.slice().sort((a, b) => b.ts.localeCompare(a.ts));
  return sorted.slice(0, n);
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h${m}m${s}s`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}

function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
