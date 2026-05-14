import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildRecord,
  appendRecord,
  loadAllRecords,
  summarizeOverall,
  summarizeByLanguage,
  recentRecords,
  formatDuration,
  getStatsPath,
  type StatsRecord,
} from '../../src/lib/stats.js';
import { setupIsolatedEnv, type IsolatedEnv } from '../helpers/env.js';

// 統計の集計・永続化ロジック (lib/stats.ts) のテスト。
// 永続化が絡むテストは XDG_CONFIG_HOME を一時ディレクトリに差し替えて、
// 本物のホームディレクトリを汚さないようにする。

// --- 純粋関数のテスト ---

describe('buildRecord', () => {
  test('正常系: 与えた入力から正しい StatsRecord を構築する', () => {
    const ts = new Date('2026-01-15T03:04:05.000Z');
    const rec = buildRecord({
      language: 'Python',
      providerId: 'openai',
      providerName: 'OpenAI',
      model: 'gpt-4o-mini',
      totalChars: 100,
      typed: 100,
      correct: 95,
      mistakes: 5,
      durationMs: 60_000, // 1 分
      ts,
    });
    assert.equal(rec.ts, '2026-01-15T03:04:05.000Z');
    assert.equal(rec.language, 'Python');
    assert.equal(rec.providerId, 'openai');
    assert.equal(rec.providerName, 'OpenAI');
    assert.equal(rec.model, 'gpt-4o-mini');
    assert.equal(rec.totalChars, 100);
    assert.equal(rec.correct, 95);
    assert.equal(rec.mistakes, 5);
    // accuracy = 95 / 100 = 0.95
    assert.equal(rec.accuracy, 0.95);
    assert.equal(rec.durationMs, 60_000);
    // WPM = totalChars / 5 / minutes = 100 / 5 / 1 = 20
    assert.equal(rec.wpm, 20);
  });

  test('typed=0 のときは accuracy=1.0 として扱う（0 除算回避）', () => {
    const rec = buildRecord({
      language: 'auto',
      providerId: 'lmstudio',
      providerName: 'LM Studio (local)',
      model: 'openai/gpt-oss-20b',
      totalChars: 50,
      typed: 0,
      correct: 0,
      mistakes: 0,
      durationMs: 0,
    });
    assert.equal(rec.accuracy, 1.0);
  });

  test('durationMs=0 のときは wpm=0 として扱う（0 除算回避）', () => {
    const rec = buildRecord({
      language: 'Go',
      providerId: 'openai',
      providerName: 'OpenAI',
      model: 'gpt-4o-mini',
      totalChars: 200,
      typed: 200,
      correct: 200,
      mistakes: 0,
      durationMs: 0,
    });
    assert.equal(rec.wpm, 0);
  });

  test('accuracy と wpm は小数点以下を丸める（accuracy: 4 桁 / wpm: 2 桁）', () => {
    const rec = buildRecord({
      language: 'Rust',
      providerId: 'openai',
      providerName: 'OpenAI',
      model: 'gpt-4o-mini',
      totalChars: 137,
      typed: 137,
      correct: 100, // 100/137 ≈ 0.72992700...
      mistakes: 37,
      durationMs: 73_000, // 73 秒
    });
    // accuracy は 4 桁丸め
    assert.equal(rec.accuracy, 0.7299);
    // wpm = 137 / 5 / (73000 / 60000) = 27.4 / 1.21666... ≈ 22.52
    // 2 桁丸めで 22.52 になるはず
    assert.equal(rec.wpm, Math.round((137 / 5 / (73_000 / 60_000)) * 100) / 100);
    // 小数第 2 位で止まっているか（×100 して整数になるか）でも検証する。
    assert.ok(Number.isInteger(rec.wpm * 100));
  });

  test('ts を省略すると現在時刻 (ISO 文字列) になる', () => {
    const before = Date.now();
    const rec = buildRecord({
      language: 'auto',
      providerId: 'openai',
      providerName: 'OpenAI',
      model: 'gpt-4o-mini',
      totalChars: 10,
      typed: 10,
      correct: 10,
      mistakes: 0,
      durationMs: 1000,
    });
    const after = Date.now();
    const parsed = Date.parse(rec.ts);
    assert.ok(parsed >= before && parsed <= after);
  });
});

describe('formatDuration', () => {
  test('0 以下や非有限値は "0s" を返す', () => {
    assert.equal(formatDuration(0), '0s');
    assert.equal(formatDuration(-1), '0s');
    assert.equal(formatDuration(NaN), '0s');
    assert.equal(formatDuration(Infinity), '0s');
  });

  test('秒単位だけのフォーマット', () => {
    assert.equal(formatDuration(1_000), '1s');
    assert.equal(formatDuration(59_000), '59s');
  });

  test('分・秒のフォーマット', () => {
    assert.equal(formatDuration(60_000), '1m0s');
    assert.equal(formatDuration(125_000), '2m5s');
  });

  test('時・分・秒のフォーマット', () => {
    // 3661 秒 = 1h1m1s
    assert.equal(formatDuration(3_661_000), '1h1m1s');
  });
});

describe('summarizeOverall', () => {
  test('空配列なら全フィールド 0 のサマリを返す', () => {
    const s = summarizeOverall([]);
    assert.deepEqual(s, {
      sessions: 0,
      totalChars: 0,
      totalDurationMs: 0,
      avgAccuracy: 0,
      avgWpm: 0,
      bestWpm: 0,
    });
  });

  test('複数レコードから合計・平均・ベストを計算する', () => {
    const records: StatsRecord[] = [
      makeRec({ totalChars: 100, durationMs: 60_000, accuracy: 0.9, wpm: 20 }),
      makeRec({ totalChars: 200, durationMs: 120_000, accuracy: 1.0, wpm: 30 }),
      makeRec({ totalChars: 50, durationMs: 30_000, accuracy: 0.8, wpm: 25 }),
    ];
    const s = summarizeOverall(records);
    assert.equal(s.sessions, 3);
    assert.equal(s.totalChars, 350);
    assert.equal(s.totalDurationMs, 210_000);
    // 平均 accuracy = (0.9 + 1.0 + 0.8) / 3 = 0.9
    assert.ok(Math.abs(s.avgAccuracy - 0.9) < 1e-9);
    // 平均 wpm = (20 + 30 + 25) / 3 = 25
    assert.ok(Math.abs(s.avgWpm - 25) < 1e-9);
    // 最高は 30
    assert.equal(s.bestWpm, 30);
  });
});

describe('summarizeByLanguage', () => {
  test('言語ごとにグループ化し、セッション数の降順で返す', () => {
    const records: StatsRecord[] = [
      makeRec({ language: 'Python', totalChars: 100, accuracy: 0.9, wpm: 20 }),
      makeRec({ language: 'Python', totalChars: 200, accuracy: 1.0, wpm: 30 }),
      makeRec({ language: 'Python', totalChars: 50, accuracy: 0.8, wpm: 10 }),
      makeRec({ language: 'Go', totalChars: 80, accuracy: 0.95, wpm: 25 }),
      makeRec({ language: 'Rust', totalChars: 40, accuracy: 0.85, wpm: 18 }),
      makeRec({ language: 'Rust', totalChars: 60, accuracy: 0.9, wpm: 22 }),
    ];
    const result = summarizeByLanguage(records);
    // セッション数: Python=3, Rust=2, Go=1
    assert.deepEqual(
      result.map((r) => r.language),
      ['Python', 'Rust', 'Go'],
    );

    const python = result[0];
    assert.equal(python.sessions, 3);
    assert.equal(python.totalChars, 350);
    // 平均 wpm = (20 + 30 + 10) / 3 = 20
    assert.ok(Math.abs(python.avgWpm - 20) < 1e-9);
    // 平均 accuracy = (0.9 + 1.0 + 0.8) / 3 = 0.9
    assert.ok(Math.abs(python.avgAccuracy - 0.9) < 1e-9);
  });

  test('空配列なら空配列を返す', () => {
    assert.deepEqual(summarizeByLanguage([]), []);
  });
});

describe('recentRecords', () => {
  test('ts の降順で n 件返す', () => {
    const records: StatsRecord[] = [
      makeRec({ ts: '2026-01-01T00:00:00.000Z', language: 'A' }),
      makeRec({ ts: '2026-03-01T00:00:00.000Z', language: 'C' }),
      makeRec({ ts: '2026-02-01T00:00:00.000Z', language: 'B' }),
    ];
    const out = recentRecords(records, 2);
    assert.equal(out.length, 2);
    assert.equal(out[0].language, 'C');
    assert.equal(out[1].language, 'B');
  });

  test('n が件数より大きい場合は全件返す', () => {
    const records: StatsRecord[] = [
      makeRec({ ts: '2026-01-01T00:00:00.000Z' }),
      makeRec({ ts: '2026-02-01T00:00:00.000Z' }),
    ];
    const out = recentRecords(records, 100);
    assert.equal(out.length, 2);
  });

  test('元配列を変更しない（破壊しない）', () => {
    const records: StatsRecord[] = [
      makeRec({ ts: '2026-01-01T00:00:00.000Z', language: 'A' }),
      makeRec({ ts: '2026-02-01T00:00:00.000Z', language: 'B' }),
    ];
    const snapshot = records.map((r) => r.language).join(',');
    recentRecords(records, 2);
    assert.equal(records.map((r) => r.language).join(','), snapshot);
  });
});

// --- 永続化を伴うテスト ---

describe('appendRecord / loadAllRecords / getStatsPath', () => {
  let env: IsolatedEnv;
  beforeEach(() => {
    env = setupIsolatedEnv();
  });
  afterEach(() => {
    env.cleanup();
  });

  test('getStatsPath は XDG_CONFIG_HOME 配下の所定パスを返す', () => {
    const p = getStatsPath();
    assert.equal(p, path.join(env.dir, 'syakyode-code', 'stats.jsonl'));
  });

  test('ファイル不在のときは空配列を返す（壊れない）', () => {
    assert.deepEqual(loadAllRecords(), []);
  });

  test('appendRecord したものを loadAllRecords でラウンドトリップできる', () => {
    const rec = buildRecord({
      language: 'TypeScript',
      providerId: 'openai',
      providerName: 'OpenAI',
      model: 'gpt-4o-mini',
      totalChars: 200,
      typed: 200,
      correct: 199,
      mistakes: 1,
      durationMs: 60_000,
      ts: new Date('2026-02-01T00:00:00.000Z'),
    });
    appendRecord(rec);
    appendRecord(rec);

    const loaded = loadAllRecords();
    assert.equal(loaded.length, 2);
    assert.deepEqual(loaded[0], rec);
    assert.deepEqual(loaded[1], rec);

    // ファイルが JSONL 形式（1 行 = 1 オブジェクト）で書かれていることを確認。
    const raw = fs.readFileSync(getStatsPath(), 'utf8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).language, 'TypeScript');
  });

  test('壊れた行はスキップして読み続ける', () => {
    const valid = buildRecord({
      language: 'Go',
      providerId: 'lmstudio',
      providerName: 'LM Studio (local)',
      model: 'openai/gpt-oss-20b',
      totalChars: 10,
      typed: 10,
      correct: 10,
      mistakes: 0,
      durationMs: 5_000,
    });
    const p = getStatsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    // 1 行目: 有効 JSON、2 行目: 壊れた JSON、3 行目: 形は正しいがスキーマ不一致、
    // 4 行目: 空行、5 行目: 有効 JSON。
    fs.writeFileSync(
      p,
      [
        JSON.stringify(valid),
        '{ this is not json',
        JSON.stringify({ foo: 'bar' }), // StatsRecord ではない
        '',
        JSON.stringify(valid),
      ].join('\n'),
      'utf8',
    );
    const loaded = loadAllRecords();
    // 有効な 2 件のみ読まれる。
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].language, 'Go');
    assert.equal(loaded[1].language, 'Go');
  });

  test('ディレクトリが無くても appendRecord で自動的に作られる', () => {
    const rec = buildRecord({
      language: 'C',
      providerId: 'openai',
      providerName: 'OpenAI',
      model: 'gpt-4o-mini',
      totalChars: 10,
      typed: 10,
      correct: 10,
      mistakes: 0,
      durationMs: 1_000,
    });
    // setupIsolatedEnv が作るのは一時ディレクトリのみで、
    // syakyode-code サブディレクトリは存在しない状態から始める。
    const subdir = path.join(env.dir, 'syakyode-code');
    assert.equal(fs.existsSync(subdir), false);

    appendRecord(rec);

    assert.equal(fs.existsSync(subdir), true);
    assert.equal(loadAllRecords().length, 1);
  });
});

// --- テスト用ヘルパ ---

interface MakeRecOverrides {
  ts?: string;
  language?: string;
  totalChars?: number;
  durationMs?: number;
  accuracy?: number;
  wpm?: number;
}
function makeRec(overrides: MakeRecOverrides = {}): StatsRecord {
  return {
    ts: overrides.ts ?? '2026-01-01T00:00:00.000Z',
    language: overrides.language ?? 'Python',
    providerId: 'openai',
    providerName: 'OpenAI',
    model: 'gpt-4o-mini',
    totalChars: overrides.totalChars ?? 100,
    correct: 100,
    mistakes: 0,
    accuracy: overrides.accuracy ?? 1.0,
    durationMs: overrides.durationMs ?? 60_000,
    wpm: overrides.wpm ?? 20,
  };
}
