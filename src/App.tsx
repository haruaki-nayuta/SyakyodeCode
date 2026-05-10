import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { PromptInput } from './components/PromptInput.js';
import { TypingView } from './components/TypingView.js';
import { LanguagePicker, getLanguageLabel } from './components/LanguagePicker.js';
import { ProviderPicker } from './components/ProviderPicker.js';
import { ApiKeyInput } from './components/ApiKeyInput.js';
import { ModelPicker } from './components/ModelPicker.js';
import {
  TypingState,
  backspace,
  createTypingState,
  isComplete,
  progress,
  typeChar,
} from './typing/state.js';
import { generateSnippet, getModelInfo } from './lib/llm.js';
import { loadSettings, saveSettings } from './lib/settings.js';
import { Provider, findProvider, getDefaultProvider } from './lib/providers.js';
import { getApiKey, setApiKey } from './lib/auth.js';

type Mode =
  | 'input'
  | 'loading'
  | 'typing'
  | 'language-picker'
  | 'provider-picker'
  | 'api-key-input'
  | 'model-picker';

interface SlashCommand {
  name: string;
  aliases?: string[];
  description: string;
}

interface SlashCommandMatch {
  command: SlashCommand;
  displayName: string;
}

const COMMANDS: SlashCommand[] = [
  { name: '/model', description: 'プロバイダーとモデルを選択する' },
  { name: '/language', description: 'プログラミング言語を設定する' },
  { name: '/quit', aliases: ['/exit'], description: '終了する' },
];

function filterCommands(input: string): SlashCommandMatch[] {
  const q = input.trim().toLowerCase();
  if (!q.startsWith('/')) return [];
  const results: SlashCommandMatch[] = [];
  for (const cmd of COMMANDS) {
    const names = [cmd.name, ...(cmd.aliases ?? [])];
    const matched = names.find((n) => n.toLowerCase().startsWith(q));
    if (matched) {
      results.push({ command: cmd, displayName: matched });
    }
  }
  return results;
}

export const App: React.FC = () => {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>('input');
  const [promptValue, setPromptValue] = useState('');
  const [typing, setTyping] = useState<TypingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>(() => loadSettings().language ?? 'auto');
  const [activeProvider, setActiveProvider] = useState<Provider>(
    () => findProvider(loadSettings().providerId) ?? getDefaultProvider(),
  );
  const [activeModel, setActiveModel] = useState<string>(
    () => loadSettings().model ?? getDefaultProvider().defaultModel ?? '',
  );
  // re-render trigger when auth/settings change
  const [, setRefresh] = useState(0);
  const bump = () => setRefresh((r) => r + 1);

  const [stagedProvider, setStagedProvider] = useState<Provider | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const completed = typing ? isComplete(typing) : false;

  useEffect(() => {
    if (mode === 'typing' && completed) {
      setInfo('完了です ✓  Enterでホームに戻る');
    }
  }, [mode, completed]);

  const startGeneration = async (prompt: string) => {
    setError(null);
    setInfo(null);
    setMode('loading');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const snippet = await generateSnippet({ prompt, language, signal: ctrl.signal });
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

  const persistProviderModel = (providerId: string, model: string) => {
    const next = { ...loadSettings(), providerId, model };
    saveSettings(next);
  };

  useInput(
    (input, key) => {
      if (key.ctrl && (input === 'c' || input === 'd')) {
        exit();
        return;
      }

      if (
        mode === 'language-picker' ||
        mode === 'provider-picker' ||
        mode === 'api-key-input' ||
        mode === 'model-picker'
      ) {
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

  const handleProviderSelect = (provider: Provider) => {
    setStagedProvider(provider);
    if (provider.requiresApiKey && !getApiKey(provider.id)) {
      setMode('api-key-input');
    } else {
      setMode('model-picker');
    }
  };

  const handleApiKeySubmit = (key: string) => {
    if (!stagedProvider) return;
    setApiKey(stagedProvider.id, key);
    setInfo(`${stagedProvider.name} のAPIキーを保存しました`);
    bump();
    setMode('model-picker');
  };

  const handleModelSelect = (modelId: string) => {
    if (!stagedProvider) return;
    persistProviderModel(stagedProvider.id, modelId);
    setActiveProvider(stagedProvider);
    setActiveModel(modelId);
    setInfo(`${stagedProvider.name} / ${modelId} を選択しました`);
    setStagedProvider(null);
    setMode('input');
  };

  const modelInfo = getModelInfo();

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header
        model={modelInfo.model}
        providerName={modelInfo.providerName}
        mode={mode}
        language={language}
      />

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
                if (trimmed.startsWith('/')) {
                  const top = filterCommands(trimmed)[0];
                  if (!top) return;
                  setError(null);
                  setInfo(null);
                  setPromptValue('');
                  if (top.command.name === '/language') {
                    setMode('language-picker');
                  } else if (top.command.name === '/model') {
                    setStagedProvider(activeProvider);
                    setMode('provider-picker');
                  } else if (top.command.name === '/quit') {
                    exit();
                  }
                  return;
                }
                void startGeneration(trimmed);
              }}
              placeholder="お題を入力してEnter..."
            />
          </Box>
          {promptValue.startsWith('/') && (
            <SlashCommandPalette query={promptValue} />
          )}
          {typing && (
            <Text color="gray">Esc: 写経画面に戻る</Text>
          )}
          <Box>
            <Text color="gray">言語: </Text>
            <Text color={language === 'auto' ? 'gray' : 'green'} bold>
              {language === 'auto' ? '未設定' : getLanguageLabel(language)}
            </Text>
          </Box>
          {info && (
            <Box marginTop={1}>
              <Text color="green">{info}</Text>
            </Box>
          )}
          {error && (
            <Box marginTop={1}>
              <Text color="red">エラー: {error}</Text>
            </Box>
          )}
        </Box>
      )}

      {mode === 'language-picker' && (
        <Box marginTop={1}>
          <LanguagePicker
            current={language}
            onSelect={(id) => {
              setLanguage(id);
              saveSettings({ ...loadSettings(), language: id });
              setMode('input');
              setInfo(`言語を ${getLanguageLabel(id)} に設定しました`);
            }}
            onCancel={() => setMode('input')}
          />
        </Box>
      )}

      {mode === 'provider-picker' && (
        <Box marginTop={1}>
          <ProviderPicker
            current={activeProvider.id}
            onSelect={handleProviderSelect}
            onCancel={() => {
              setStagedProvider(null);
              setMode('input');
            }}
            onChanged={bump}
          />
        </Box>
      )}

      {mode === 'api-key-input' && stagedProvider && (
        <Box marginTop={1}>
          <ApiKeyInput
            provider={stagedProvider}
            onSubmit={handleApiKeySubmit}
            onCancel={() => setMode('provider-picker')}
          />
        </Box>
      )}

      {mode === 'model-picker' && stagedProvider && (
        <Box marginTop={1}>
          <ModelPicker
            provider={stagedProvider}
            current={stagedProvider.id === activeProvider.id ? activeModel : undefined}
            onSelect={handleModelSelect}
            onCancel={() => {
              setStagedProvider(null);
              setMode('input');
            }}
            onBack={() => setMode('provider-picker')}
          />
        </Box>
      )}

      {mode === 'loading' && (
        <Box marginTop={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> {modelInfo.providerName} / {modelInfo.model} で生成中... (Escでキャンセル)</Text>
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
              {completed
                ? 'Enter: ホームに戻る / Esc: ホームに戻る'
                : 'Esc: ホームに戻る / Backspace: 1文字戻る / Enter: 改行'}
            </Text>
          </Box>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {modelInfo.providerName}: {modelInfo.baseURL}
          {modelInfo.hasApiKey ? '' : '  (APIキー未設定)'}
        </Text>
      </Box>
    </Box>
  );
};

const Header: React.FC<{
  model: string;
  providerName: string;
  mode: Mode;
  language: string;
}> = ({ model, providerName, mode, language }) => {
  const label =
    mode === 'input'
      ? 'HOME'
      : mode === 'loading'
        ? 'GENERATING'
        : mode === 'language-picker'
          ? 'LANGUAGE'
          : mode === 'provider-picker'
            ? 'PROVIDER'
            : mode === 'api-key-input'
              ? 'API KEY'
              : mode === 'model-picker'
                ? 'MODEL'
                : 'TYPING';
  const color =
    mode === 'input'
      ? 'cyan'
      : mode === 'loading'
        ? 'yellow'
        : mode === 'language-picker' || mode === 'provider-picker' || mode === 'model-picker' || mode === 'api-key-input'
          ? 'cyan'
          : 'magenta';
  return (
    <Box>
      <Text bold color={color}>SyakyodeCode</Text>
      <Text color="gray"> · </Text>
      <Text color={color}>[{label}]</Text>
      <Text color="gray"> · </Text>
      <Text>{providerName}</Text>
      <Text color="gray"> / </Text>
      <Text>{model}</Text>
      <Text color="gray"> · lang: </Text>
      <Text color={language === 'auto' ? 'gray' : 'green'}>
        {getLanguageLabel(language)}
      </Text>
    </Box>
  );
};

const SlashCommandPalette: React.FC<{ query: string }> = ({ query }) => {
  const matches = filterCommands(query);
  if (matches.length === 0) {
    return (
      <Box marginTop={0}>
        <Text color="gray" dimColor>該当するコマンドがありません</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" marginTop={0}>
      {matches.map((m, i) => {
        const isAlias = m.displayName !== m.command.name;
        return (
          <Box key={`${m.command.name}:${m.displayName}`}>
            <Text color={i === 0 ? 'cyan' : 'gray'} bold={i === 0}>
              {i === 0 ? '▶ ' : '  '}
              {m.displayName}
            </Text>
            <Text color="gray">
              {'  '}
              {m.command.description}
              {isAlias ? ` (${m.command.name} のエイリアス)` : ''}
            </Text>
          </Box>
        );
      })}
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
