import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface Option {
  value: boolean;
  label: string;
  description?: string;
}

interface Props {
  title: string;
  current: boolean;
  options?: Option[];
  onSelect: (value: boolean) => void;
  onCancel: () => void;
}

const DEFAULT_OPTIONS: Option[] = [
  { value: true, label: 'ON' },
  { value: false, label: 'OFF' },
];

export const BoolPicker: React.FC<Props> = ({
  title,
  current,
  options = DEFAULT_OPTIONS,
  onSelect,
  onCancel,
}) => {
  const initialIndex = Math.max(
    0,
    options.findIndex((o) => o.value === current),
  );
  const [index, setIndex] = useState(initialIndex);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      onSelect(options[index].value);
      return;
    }
    if (key.upArrow || (key.ctrl && input === 'p')) {
      setIndex((i) => (i - 1 + options.length) % options.length);
      return;
    }
    if (key.downArrow || (key.ctrl && input === 'n')) {
      setIndex((i) => (i + 1) % options.length);
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
      <Text bold color="cyan">{title}</Text>
      <Text color="gray">↑↓: 移動  Enter: 決定  Esc: キャンセル</Text>
      <Box flexDirection="column" marginTop={1}>
        {options.map((opt, i) => {
          const selected = i === index;
          const isCurrent = opt.value === current;
          return (
            <Box key={String(opt.value)}>
              <Text color={selected ? 'cyan' : 'white'} bold={selected}>
                {selected ? '▶ ' : '  '}
                {opt.label}
                {isCurrent ? '  ●' : ''}
              </Text>
              {opt.description && (
                <Text color="gray">  {opt.description}</Text>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
