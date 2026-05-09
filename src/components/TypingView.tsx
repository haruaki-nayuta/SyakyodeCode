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

function colorFor(mark: Mark): string | undefined {
  if (mark === 'correct') return 'green';
  if (mark === 'incorrect') return 'red';
  return 'gray';
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

        return (
          <Text key={lineIdx}>
            {line.cells.map((cell) => {
              const mark = state.marks[cell.idx];
              const isCursor = active && state.cursor === cell.idx;
              const display = cell.char;
              return (
                <Text
                  key={cell.idx}
                  color={colorFor(mark)}
                  inverse={isCursor}
                  bold={mark === 'incorrect'}
                >
                  {display}
                </Text>
              );
            })}
            {isCursorOnNewline && active ? (
              <Text inverse color="gray">{' '}</Text>
            ) : null}
            {isCursorAtEnd && active ? (
              <Text inverse color="gray">{' '}</Text>
            ) : null}
          </Text>
        );
      })}
    </Box>
  );
};
