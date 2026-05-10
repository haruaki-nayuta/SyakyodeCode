import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { fetchModels, FetchedModel, Provider } from '../lib/providers.js';
import { getApiKey } from '../lib/auth.js';

interface Props {
  provider: Provider;
  current: string | undefined;
  onSelect: (modelId: string) => void;
  onCancel: () => void;
  onBack: () => void;
}

const PAGE_SIZE = 12;

export const ModelPicker: React.FC<Props> = ({ provider, current, onSelect, onCancel, onBack }) => {
  const [models, setModels] = useState<FetchedModel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [index, setIndex] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    fetchModels(provider, getApiKey(provider.id), ctrl.signal)
      .then((list) => {
        setModels(list);
        setLoading(false);
        const idx = current ? list.findIndex((m) => m.id === current) : -1;
        if (idx >= 0) setIndex(idx);
      })
      .catch((e: any) => {
        if (e?.name === 'AbortError') return;
        setError(e?.message ?? String(e));
        setModels([]);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [provider.id]);

  const filtered = useMemo(() => {
    if (!models) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.id.toLowerCase().includes(q));
  }, [models, filter]);

  useEffect(() => {
    if (index >= filtered.length) setIndex(0);
  }, [filtered.length]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.upArrow || (key.ctrl && input === 'p')) {
      if (filtered.length === 0) return;
      setIndex((i) => (i - 1 + filtered.length) % filtered.length);
      return;
    }
    if (key.downArrow || (key.ctrl && input === 'n')) {
      if (filtered.length === 0) return;
      setIndex((i) => (i + 1) % filtered.length);
      return;
    }
    if (key.pageUp) {
      setIndex((i) => Math.max(0, i - PAGE_SIZE));
      return;
    }
    if (key.pageDown) {
      setIndex((i) => Math.min(Math.max(0, filtered.length - 1), i + PAGE_SIZE));
      return;
    }
    if (key.tab) {
      onBack();
      return;
    }
  });

  const start = Math.max(0, Math.min(index - Math.floor(PAGE_SIZE / 2), filtered.length - PAGE_SIZE));
  const visible = filtered.slice(start, start + PAGE_SIZE);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">モデルを選択 — {provider.name}</Text>
      <Text color="gray">
        ↑↓: 移動  Enter: 決定  Tab: プロバイダーに戻る  Esc: キャンセル
      </Text>
      <Box marginTop={1}>
        <Text color="gray">filter: </Text>
        <TextInput
          value={filter}
          onChange={setFilter}
          onSubmit={() => {
            const target = filtered[index];
            if (target) onSelect(target.id);
          }}
          placeholder="モデル名の一部を入力"
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        {loading && (
          <Box>
            <Text color="yellow"><Spinner type="dots" /></Text>
            <Text> モデル一覧を取得中...</Text>
          </Box>
        )}
        {!loading && error && (
          <Text color="red">取得失敗: {error}</Text>
        )}
        {!loading && !error && filtered.length === 0 && (
          <Text color="gray">該当するモデルがありません</Text>
        )}
        {!loading && filtered.length > 0 && visible.map((m, i) => {
          const realIndex = start + i;
          const selected = realIndex === index;
          const isCurrent = m.id === current;
          return (
            <Box key={m.id}>
              <Text color={selected ? 'cyan' : 'white'} bold={selected}>
                {selected ? '▶ ' : '  '}
                {m.id}
                {isCurrent ? '  ●' : ''}
              </Text>
            </Box>
          );
        })}
      </Box>
      {!loading && filtered.length > PAGE_SIZE && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {index + 1}/{filtered.length} (PgUp/PgDn でページ移動)
          </Text>
        </Box>
      )}
    </Box>
  );
};
