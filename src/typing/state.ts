export type Mark = 'correct' | 'incorrect' | null;

export interface TypingState {
  target: string;
  cursor: number;
  marks: Mark[];
}

export function createTypingState(target: string): TypingState {
  return {
    target,
    cursor: 0,
    marks: new Array(target.length).fill(null),
  };
}

export function typeChar(state: TypingState, char: string): TypingState {
  if (state.cursor >= state.target.length) return state;

  const expected = state.target[state.cursor];
  const mark: Mark = expected === char ? 'correct' : 'incorrect';

  const marks = state.marks.slice();
  marks[state.cursor] = mark;

  return { ...state, marks, cursor: state.cursor + 1 };
}

export function backspace(state: TypingState): TypingState {
  if (state.cursor === 0) return state;
  const marks = state.marks.slice();
  marks[state.cursor - 1] = null;
  return { ...state, marks, cursor: state.cursor - 1 };
}

export function isComplete(state: TypingState): boolean {
  return (
    state.cursor === state.target.length &&
    state.marks.every((m) => m === 'correct')
  );
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
