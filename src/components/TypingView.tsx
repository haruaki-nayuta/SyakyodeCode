import React from 'react';
import { Box, Text } from 'ink';
import type { Mark, TypingState } from '../typing/state.js';

interface Props {
  state: TypingState;
  active: boolean;
}

interface CharCell {
  char: string;
  idx: number;
}

interface LineRow {
  cells: CharCell[];
  newlineIdx: number | null;
}

function splitLines(target: string): LineRow[] {
  const lines: LineRow[] = [];
  let buf: CharCell[] = [];
  for (let i = 0; i < target.length; i++) {
    const c = target[i];
    if (c === '\n') {
      lines.push({ cells: buf, newlineIdx: i });
      buf = [];
    } else {
      buf.push({ char: c, idx: i });
    }
  }
  lines.push({ cells: buf, newlineIdx: null });
  return lines;
}

const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const INVERSE = `${ESC}[7m`;
const BOLD = `${ESC}[1m`;
const FG_GREEN = `${ESC}[32m`;
const FG_RED = `${ESC}[31m`;
const FG_GRAY = `${ESC}[90m`;

function styleChar(char: string, mark: Mark, isCursor: boolean): string {
  if (isCursor) {
    return `${INVERSE}${char}${RESET}`;
  }
  if (mark === 'correct') {
    return `${FG_GREEN}${char}${RESET}`;
  }
  if (mark === 'incorrect') {
    return `${BOLD}${FG_RED}${char}${RESET}`;
  }
  return `${FG_GRAY}${char}${RESET}`;
}

function buildLineString(
  line: LineRow,
  state: TypingState,
  active: boolean,
  appendCursorBlock: boolean,
): string {
  let out = '';
  for (const cell of line.cells) {
    const mark = state.marks[cell.idx];
    const isCursor = active && state.cursor === cell.idx;
    out += styleChar(cell.char, mark, isCursor);
  }
  if (appendCursorBlock) {
    out += `${INVERSE} ${RESET}`;
  }
  return out;
}

export const TypingView: React.FC<Props> = ({ state, active }) => {
  const lines = splitLines(state.target);
  const finalCursor = state.cursor >= state.target.length;

  return (
    <Box flexDirection="column">
      {lines.map((line, lineIdx) => {
        const isCursorOnNewline = line.newlineIdx !== null && state.cursor === line.newlineIdx;
        const isFinalLine = lineIdx === lines.length - 1;
        const isCursorAtEnd = isFinalLine && finalCursor;
        const appendCursorBlock = active && (isCursorOnNewline || isCursorAtEnd);

        const content = buildLineString(line, state, active, appendCursorBlock);

        return (
          <Text key={lineIdx}>{content.length > 0 ? content : ' '}</Text>
        );
      })}
    </Box>
  );
};
