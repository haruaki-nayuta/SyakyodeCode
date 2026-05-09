import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface Language {
  id: string;
  label: string;
}

export const LANGUAGES: Language[] = [
  { id: 'auto', label: 'auto (指定なし)' },
  { id: 'python', label: 'Python' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'java', label: 'Java' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'swift', label: 'Swift' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'php', label: 'PHP' },
  { id: 'csharp', label: 'C#' },
  { id: 'scala', label: 'Scala' },
  { id: 'haskell', label: 'Haskell' },
  { id: 'elixir', label: 'Elixir' },
  { id: 'lua', label: 'Lua' },
  { id: 'sql', label: 'SQL' },
  { id: 'bash', label: 'Bash' },
];

export function getLanguageLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id;
}

interface Props {
  current: string;
  onSelect: (id: string) => void;
  onCancel: () => void;
}

export const LanguagePicker: React.FC<Props> = ({ current, onSelect, onCancel }) => {
  const initialIndex = Math.max(
    0,
    LANGUAGES.findIndex((l) => l.id === current),
  );
  const [index, setIndex] = useState(initialIndex);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      onSelect(LANGUAGES[index].id);
      return;
    }
    if (key.upArrow || (key.ctrl && input === 'p')) {
      setIndex((i) => (i - 1 + LANGUAGES.length) % LANGUAGES.length);
      return;
    }
    if (key.downArrow || (key.ctrl && input === 'n')) {
      setIndex((i) => (i + 1) % LANGUAGES.length);
      return;
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
    >
      <Text bold color="cyan">言語を選択</Text>
      <Text color="gray">↑↓: 移動  Enter: 決定  Esc: キャンセル</Text>
      <Box flexDirection="column" marginTop={1}>
        {LANGUAGES.map((lang, i) => {
          const selected = i === index;
          const isCurrent = lang.id === current;
          return (
            <Box key={lang.id}>
              <Text color={selected ? 'cyan' : 'white'} bold={selected}>
                {selected ? '▶ ' : '  '}
                {lang.label}
                {isCurrent ? '  ●' : ''}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
