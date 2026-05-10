import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { BUILT_IN_PROVIDERS, Provider } from '../lib/providers.js';
import { getApiKey, maskApiKey, removeAuth } from '../lib/auth.js';

interface Props {
  current: string | undefined;
  onSelect: (provider: Provider) => void;
  onCancel: () => void;
  onChanged?: () => void;
}

export const ProviderPicker: React.FC<Props> = ({ current, onSelect, onCancel, onChanged }) => {
  const initial = Math.max(
    0,
    BUILT_IN_PROVIDERS.findIndex((p) => p.id === current),
  );
  const [index, setIndex] = useState(initial);
  const [info, setInfo] = useState<string | null>(null);
  const [bump, setBump] = useState(0); // force re-render after auth change

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      onSelect(BUILT_IN_PROVIDERS[index]);
      return;
    }
    if (key.upArrow || (key.ctrl && input === 'p')) {
      setIndex((i) => (i - 1 + BUILT_IN_PROVIDERS.length) % BUILT_IN_PROVIDERS.length);
      return;
    }
    if (key.downArrow || (key.ctrl && input === 'n')) {
      setIndex((i) => (i + 1) % BUILT_IN_PROVIDERS.length);
      return;
    }
    if (input === 'd' || input === 'D') {
      const p = BUILT_IN_PROVIDERS[index];
      if (getApiKey(p.id)) {
        removeAuth(p.id);
        setInfo(`${p.name} のAPIキーを削除しました`);
        setBump((b) => b + 1);
        onChanged?.();
      }
      return;
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">プロバイダーを選択</Text>
      <Text color="gray">↑↓: 移動  Enter: 決定  d: APIキー削除  Esc: キャンセル</Text>
      <Box flexDirection="column" marginTop={1}>
        {BUILT_IN_PROVIDERS.map((p, i) => {
          const selected = i === index;
          const isCurrent = p.id === current;
          const key = getApiKey(p.id);
          const status = !p.requiresApiKey
            ? 'no-key'
            : key
              ? `key: ${maskApiKey(key)}`
              : 'key未設定';
          const statusColor = !p.requiresApiKey ? 'gray' : key ? 'green' : 'yellow';
          return (
            <Box key={`${p.id}:${bump}`}>
              <Text color={selected ? 'cyan' : 'white'} bold={selected}>
                {selected ? '▶ ' : '  '}
                {p.name}
                {isCurrent ? '  ●' : ''}
              </Text>
              <Text color="gray">  </Text>
              <Text color={statusColor}>[{status}]</Text>
              <Text color="gray">  {p.baseURL}</Text>
            </Box>
          );
        })}
      </Box>
      {info && (
        <Box marginTop={1}>
          <Text color="green">{info}</Text>
        </Box>
      )}
    </Box>
  );
};
