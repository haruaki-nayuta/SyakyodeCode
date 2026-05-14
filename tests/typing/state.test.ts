import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTypingState,
  typeChar,
  backspace,
  isComplete,
  progress,
  type TypingState,
} from '../../src/typing/state.js';

// 写経の状態遷移ロジック (typing/state.ts) のテスト。
// 純粋関数なので、入出力を直接検証する。
describe('createTypingState', () => {
  test('指定したターゲット文字列で初期化される', () => {
    const state = createTypingState('hello');
    assert.equal(state.target, 'hello');
    assert.equal(state.cursor, 0);
    // marks はターゲット長さぶんの null 配列。
    assert.equal(state.marks.length, 5);
    assert.deepEqual(state.marks, [null, null, null, null, null]);
    assert.equal(state.startedAt, null);
    assert.equal(state.completedAt, null);
  });

  test('空文字列ターゲットでも壊れない', () => {
    const state = createTypingState('');
    assert.equal(state.target, '');
    assert.equal(state.cursor, 0);
    assert.deepEqual(state.marks, []);
    // 空文字列は最初から完了扱い。
    assert.equal(isComplete(state), true);
  });
});

describe('typeChar', () => {
  test('正しい文字を打鍵すると correct マークが付き、カーソルが前進する', () => {
    const s0 = createTypingState('abc');
    const s1 = typeChar(s0, 'a');
    assert.equal(s1.cursor, 1);
    assert.equal(s1.marks[0], 'correct');
    // 元の state は変更されない（イミュータブル）。
    assert.equal(s0.cursor, 0);
    assert.equal(s0.marks[0], null);
  });

  test('間違った文字を打鍵すると incorrect マークが付くが、カーソルは前進する', () => {
    const s0 = createTypingState('abc');
    const s1 = typeChar(s0, 'X');
    assert.equal(s1.cursor, 1);
    assert.equal(s1.marks[0], 'incorrect');
  });

  test('最初の打鍵時に startedAt がセットされ、以降の打鍵では更新されない', () => {
    const before = Date.now();
    let state = createTypingState('abc');
    state = typeChar(state, 'a');
    const after = Date.now();

    assert.ok(state.startedAt !== null);
    assert.ok(state.startedAt! >= before && state.startedAt! <= after);

    const firstStartedAt = state.startedAt;
    // 同じ tick でも別の tick でも、startedAt は最初の値を保持する。
    state = typeChar(state, 'b');
    assert.equal(state.startedAt, firstStartedAt);
  });

  test('最終文字を正しく打鍵したときに completedAt がセットされる', () => {
    let state = createTypingState('ab');
    state = typeChar(state, 'a');
    assert.equal(state.completedAt, null);

    const before = Date.now();
    state = typeChar(state, 'b');
    const after = Date.now();

    assert.equal(state.cursor, 2);
    assert.ok(state.completedAt !== null);
    assert.ok(state.completedAt! >= before && state.completedAt! <= after);
    assert.equal(isComplete(state), true);
  });

  test('最終文字を間違えても completedAt はセットされる（カーソル基準で完了判定）', () => {
    let state = createTypingState('ab');
    state = typeChar(state, 'a');
    state = typeChar(state, 'Z'); // 間違いだが末尾に到達
    assert.equal(state.cursor, 2);
    assert.equal(state.marks[1], 'incorrect');
    assert.ok(state.completedAt !== null);
    assert.equal(isComplete(state), true);
  });

  test('完了後にさらに文字を入力しても状態は変わらない', () => {
    let state = createTypingState('a');
    state = typeChar(state, 'a');
    const completedAt = state.completedAt;
    const snapshot: TypingState = { ...state, marks: state.marks.slice() };

    const next = typeChar(state, 'b');
    // 完全に同じ参照（早期 return）。
    assert.equal(next, state);
    assert.equal(next.cursor, snapshot.cursor);
    assert.equal(next.completedAt, completedAt);
  });
});

describe('backspace', () => {
  test('カーソルを 1 戻し、直前のマークを null に戻す', () => {
    let state = createTypingState('abc');
    state = typeChar(state, 'a');
    state = typeChar(state, 'X'); // incorrect
    assert.equal(state.cursor, 2);
    assert.equal(state.marks[1], 'incorrect');

    const after = backspace(state);
    assert.equal(after.cursor, 1);
    assert.equal(after.marks[1], null);
    // 直前のマーク（インデックス 0）は触らない。
    assert.equal(after.marks[0], 'correct');
  });

  test('カーソルが 0 のときは何もしない（同一参照を返す）', () => {
    const state = createTypingState('abc');
    const result = backspace(state);
    assert.equal(result, state);
  });

  test('完了後に backspace すると completedAt が null に戻る', () => {
    let state = createTypingState('ab');
    state = typeChar(state, 'a');
    state = typeChar(state, 'b');
    assert.ok(state.completedAt !== null);

    const after = backspace(state);
    assert.equal(after.completedAt, null);
    assert.equal(after.cursor, 1);
    // startedAt は維持される（タイマーは継続）。
    assert.equal(after.startedAt, state.startedAt);
    assert.equal(isComplete(after), false);
  });
});

describe('progress', () => {
  test('打鍵していない初期状態は全カウントが 0', () => {
    const state = createTypingState('abcd');
    assert.deepEqual(progress(state), {
      typed: 0,
      total: 4,
      correct: 0,
      mistakes: 0,
    });
  });

  test('途中段階で correct / mistakes が正しくカウントされる', () => {
    let state = createTypingState('abcd');
    state = typeChar(state, 'a'); // correct
    state = typeChar(state, 'X'); // incorrect
    state = typeChar(state, 'c'); // correct
    assert.deepEqual(progress(state), {
      typed: 3,
      total: 4,
      correct: 2,
      mistakes: 1,
    });
  });

  test('backspace でマークが消えると correct / mistakes も減る', () => {
    let state = createTypingState('abcd');
    state = typeChar(state, 'a');
    state = typeChar(state, 'X');
    state = backspace(state);
    assert.deepEqual(progress(state), {
      typed: 1,
      total: 4,
      correct: 1,
      mistakes: 0,
    });
  });
});

describe('isComplete', () => {
  test('カーソルがターゲット末尾に到達すると true', () => {
    let state = createTypingState('ab');
    assert.equal(isComplete(state), false);
    state = typeChar(state, 'a');
    assert.equal(isComplete(state), false);
    state = typeChar(state, 'b');
    assert.equal(isComplete(state), true);
  });
});

describe('シナリオ統合テスト', () => {
  test('打鍵 → 誤打 → 訂正 → 完了 までの一連の流れ', () => {
    let state = createTypingState('print()');
    // 正しく "pri" まで打鍵
    state = typeChar(state, 'p');
    state = typeChar(state, 'r');
    state = typeChar(state, 'i');
    // 4 文字目で誤打
    state = typeChar(state, 'X');
    assert.equal(state.marks[3], 'incorrect');
    // backspace して正しい "n" を入れる
    state = backspace(state);
    state = typeChar(state, 'n');
    assert.equal(state.marks[3], 'correct');
    // 残りを打ち切る
    state = typeChar(state, 't');
    state = typeChar(state, '(');
    state = typeChar(state, ')');

    assert.equal(isComplete(state), true);
    const p = progress(state);
    // 訂正済みなので mistakes はゼロ（marks 上は全部 correct）。
    assert.equal(p.typed, 7);
    assert.equal(p.total, 7);
    assert.equal(p.correct, 7);
    assert.equal(p.mistakes, 0);
  });
});
