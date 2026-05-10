export type Mark = 'correct' | 'incorrect' | null;

export interface TypingState {
  target: string;
  cursor: number;
  marks: Mark[];
  startedAt: number | null;
  completedAt: number | null;
}

export function createTypingState(target: string): TypingState {
  return {
    target,
    cursor: 0,
    marks: new Array(target.length).fill(null),
    startedAt: null,
    completedAt: null,
  };
}

export function typeChar(state: TypingState, char: string): TypingState {
  if (state.cursor >= state.target.length) return state;

  const expected = state.target[state.cursor];
  const mark: Mark = expected === char ? 'correct' : 'incorrect';

  const marks = state.marks.slice();
  marks[state.cursor] = mark;

  const nextCursor = state.cursor + 1;
  const startedAt = state.startedAt ?? Date.now();
  const completedAt = nextCursor >= state.target.length ? Date.now() : state.completedAt;

  return { ...state, marks, cursor: nextCursor, startedAt, completedAt };
}

export function backspace(state: TypingState): TypingState {
  if (state.cursor === 0) return state;
  const marks = state.marks.slice();
  marks[state.cursor - 1] = null;
  return { ...state, marks, cursor: state.cursor - 1, completedAt: null };
}

export function isComplete(state: TypingState): boolean {
  return state.cursor >= state.target.length;
}

export function progress(state: TypingState): { typed: number; total: number; correct: number; mistakes: number } {
  const correct = state.marks.filter((m) => m === 'correct').length;
  const mistakes = state.marks.filter((m) => m === 'incorrect').length;
  return {
    typed: state.cursor,
    total: state.target.length,
    correct,
    mistakes,
  };
}
