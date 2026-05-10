import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { Provider } from '../lib/providers.js';

interface Props {
  provider: Provider;
  onSubmit: (apiKey: string) => void;
  onCancel: () => void;
}

export const ApiKeyInput: React.FC<Props> = ({ provider, onSubmit, onCancel }) => {
  const [value, setValue] = useState('');

  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">{provider.name} のAPIキーを入力</Text>
      <Text color="gray">
        ~/.local/share/syakyode-code/auth.json に 0600 権限で保存されます
      </Text>
      <Text color="gray">Enter: 保存  Esc: キャンセル</Text>
      <Box marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyan">{'> '}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(v) => {
            const trimmed = v.trim();
            if (!trimmed) return;
            onSubmit(trimmed);
          }}
          mask="*"
          placeholder="sk-..."
        />
      </Box>
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          入力値はマスク表示されます。プロセス環境変数や履歴には残りません。
        </Text>
      </Box>
    </Box>
  );
};
