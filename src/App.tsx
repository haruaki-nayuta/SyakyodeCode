import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { PromptInput } from './components/PromptInput.js';
import { TypingView } from './components/TypingView.js';
import {
  TypingState,
  backspace,
  createTypingState,
  isComplete,
  progress,
  typeChar,
} from './typing/state.js';
import { generateSnippet, getModelInfo } from './lib/llm.js';

type Mode = 'input' | 'loading' | 'typing';

export const App: React.FC = () => {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>('input');
  const [promptValue, setPromptValue] = useState('');
  const [typing, setTyping] = useState<TypingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modelInfo = useMemo(() => getModelInfo(), []);

  const completed = typing ? isComplete(typing) : false;

  useEffect(() => {
    if (mode === 'typing' && completed) {
      setInfo('完了です ✓  Enterで次の問題、もしくはEscでこのまま戻れます');
    }
  }, [mode, completed]);

  const startGeneration = async (prompt: string) => {
    setError(null);
    setInfo(null);
    setMode('loading');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const snippet = await generateSnippet({ prompt, signal: ctrl.signal });
      if (!snippet || snippet.trim().length === 0) {
        throw new Error('LLMからの出力が空でした');
      }
      setTyping(createTypingState(snippet));
      setPromptValue('');
      setMode('typing');
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setMode('input');
        return;
      }
      setError(e?.message ?? String(e));
      setMode('input');
    } finally {
      abortRef.current = null;
    }
  };

  useInput(
    (input, key) => {
      if (key.ctrl && (input === 'c' || input === 'd')) {
        exit();
        return;
      }

      if (mode === 'loading') {
        if (key.escape) {
          abortRef.current?.abort();
        }
        return;
      }

      if (mode === 'input') {
        if (key.escape) {
          if (typing) {
            setMode('typing');
            setInfo(null);
          }
          return;
        }
        return;
      }

      // mode === 'typing'
      if (key.escape) {
        setMode('input');
        setInfo(null);
        return;
      }

      if (!typing) return;

      if (completed) {
        if (key.return) {
          setTyping(null);
          setInfo(null);
          setMode('input');
        }
        return;
      }

      if (key.backspace || key.delete) {
        setTyping((s) => (s ? backspace(s) : s));
        return;
      }

      if (key.return) {
        setTyping((s) => (s ? typeChar(s, '\n') : s));
        return;
      }

      if (key.tab) {
        setTyping((s) => (s ? typeChar(typeChar(s, ' '), ' ') : s));
        return;
      }

      if (key.ctrl || key.meta || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
        return;
      }

      if (input && input.length > 0) {
        setTyping((s) => {
          if (!s) return s;
          let next = s;
          for (const ch of input) {
            next = typeChar(next, ch);
          }
          return next;
        });
      }
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header model={modelInfo.model} mode={mode} />

      {mode === 'input' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan" bold>写経したい内容・テーマを入力してください</Text>
          <Text color="gray">例: "Pythonで素数判定を再帰で書いて" / "TypeScriptでデバウンス関数"</Text>
          <Box marginTop={1}>
            <PromptInput
              value={promptValue}
              onChange={setPromptValue}
              onSubmit={(v) => {
                const trimmed = v.trim();
                if (!trimmed) return;
                void startGeneration(trimmed);
              }}
              placeholder="お題を入力してEnter..."
            />
          </Box>
          {typing && (
            <Text color="gray">Esc: 写経画面に戻る</Text>
          )}
          {error && (
            <Box marginTop={1}>
              <Text color="red">エラー: {error}</Text>
            </Box>
          )}
        </Box>
      )}

      {mode === 'loading' && (
        <Box marginTop={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> {modelInfo.model} で生成中... (Escでキャンセル)</Text>
        </Box>
      )}

      {mode === 'typing' && typing && (
        <Box flexDirection="column" marginTop={1}>
          <ProgressBar state={typing} />
          <Box
            borderStyle="round"
            borderColor={completed ? 'green' : 'cyan'}
            paddingX={1}
            flexDirection="column"
            marginTop={1}
          >
            <TypingView state={typing} active={!completed} />
          </Box>
          {info && (
            <Box marginTop={1}>
              <Text color="green">{info}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text color="gray">
              Esc: お題入力に戻る / Backspace: 1文字戻る / Enter: 改行
              {completed ? ' / Enter: 次の問題へ' : ''}
            </Text>
          </Box>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray" dimColor>Ctrl+C で終了 · LM Studio: {modelInfo.baseURL}</Text>
      </Box>
    </Box>
  );
};

const Header: React.FC<{ model: string; mode: Mode }> = ({ model, mode }) => {
  const label =
    mode === 'input' ? 'PROMPT' : mode === 'loading' ? 'GENERATING' : 'TYPING';
  const color = mode === 'input' ? 'cyan' : mode === 'loading' ? 'yellow' : 'magenta';
  return (
    <Box>
      <Text bold color={color}>SyakyodeCode</Text>
      <Text color="gray"> · </Text>
      <Text color={color}>[{label}]</Text>
      <Text color="gray"> · model: </Text>
      <Text>{model}</Text>
    </Box>
  );
};

const ProgressBar: React.FC<{ state: TypingState }> = ({ state }) => {
  const p = progress(state);
  const ratio = p.total === 0 ? 0 : p.typed / p.total;
  const width = 30;
  const filled = Math.round(ratio * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const accuracy = p.typed === 0 ? 100 : Math.round((p.correct / p.typed) * 100);
  return (
    <Box>
      <Text color="cyan">{bar}</Text>
      <Text color="gray">  {p.typed}/{p.total} </Text>
      <Text color="gray">  正解率 </Text>
      <Text color={accuracy >= 95 ? 'green' : accuracy >= 80 ? 'yellow' : 'red'}>
        {accuracy}%
      </Text>
      <Text color="gray">  ミス </Text>
      <Text color={p.mistakes === 0 ? 'green' : 'red'}>{p.mistakes}</Text>
    </Box>
  );
};
