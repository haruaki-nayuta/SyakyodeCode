import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdin } from 'ink';
import Spinner from 'ink-spinner';
import { PromptInput } from './components/PromptInput.js';
import { TypingView } from './components/TypingView.js';
import { LanguagePicker, getLanguageLabel } from './components/LanguagePicker.js';
import { ProviderPicker } from './components/ProviderPicker.js';
import { ApiKeyInput } from './components/ApiKeyInput.js';
import { ModelPicker } from './components/ModelPicker.js';
import { StatsView } from './components/StatsView.js';
import { BoolPicker } from './components/BoolPicker.js';
import {
  TypingState,
  backspace,
  createTypingState,
  isComplete,
  progress,
  typeChar,
} from './typing/state.js';
import { chatAboutSnippet, generateSnippet, getModelInfo, SnippetChatMessage } from './lib/llm.js';
import { loadSettings, saveSettings } from './lib/settings.js';
import { Provider, findProvider, getDefaultProvider } from './lib/providers.js';
import { getApiKey, setApiKey } from './lib/auth.js';
import { appendRecord, buildRecord } from './lib/stats.js';
import {
  SyakyodeScope,
  appendLine as appendSyakyodeLine,
  getPath as getSyakyodePath,
  openInEditor as openSyakyodeEditor,
} from './lib/projectPrompt.js';

type Mode =
  | 'input'
  | 'loading'
  | 'typing'
  | 'language-picker'
  | 'provider-picker'
  | 'api-key-input'
  | 'model-picker'
  | 'stats'
  | 'auto-picker'
  | 'explanation-picker'
  | 'syakyode-md-picker';

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
  { name: '/auto', description: 'auto モード（完了後に関連お題を自動生成）の有効/無効を選択する' },
  { name: '/explanation', description: '日本語の解説表示の有効/無効を選択する' },
  { name: '/stats', description: '統計サマリを表示する' },
  { name: '/syakyode-md', description: 'Syakyode.md（追加ルール）をエディタで編集する' },
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
  const { stdin, setRawMode, isRawModeSupported } = useStdin();
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
  const [auto, setAutoState] = useState<boolean>(() => loadSettings().auto ?? false);
  const [explanation, setExplanationState] = useState<boolean>(
    () => loadSettings().explanation ?? true,
  );
  const [explanationText, setExplanationText] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<SnippetChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatActive, setChatActive] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  const setAuto = (next: boolean) => {
    setAutoState(next);
    saveSettings({ ...loadSettings(), auto: next });
  };

  const setExplanation = (next: boolean) => {
    setExplanationState(next);
    saveSettings({ ...loadSettings(), explanation: next });
  };
  // re-render trigger when auth/settings change
  const [, setRefresh] = useState(0);
  const bump = () => setRefresh((r) => r + 1);

  const [stagedProvider, setStagedProvider] = useState<Provider | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);

  const slashMatches = useMemo(
    () => (promptValue.startsWith('/') ? filterCommands(promptValue) : []),
    [promptValue],
  );

  useEffect(() => {
    setSlashIndex((i) => {
      if (slashMatches.length === 0) return 0;
      return Math.min(i, slashMatches.length - 1);
    });
  }, [slashMatches]);

  const abortRef = useRef<AbortController | null>(null);
  const recordedRef = useRef<TypingState | null>(null);

  const completed = typing ? isComplete(typing) : false;

  useEffect(() => {
    if (mode === 'typing' && completed && typing && recordedRef.current !== typing) {
      recordedRef.current = typing;
      const p = progress(typing);
      const startedAt = typing.startedAt;
      const completedAt = typing.completedAt ?? Date.now();
      const durationMs = startedAt ? Math.max(0, completedAt - startedAt) : 0;
      const info = getModelInfo();
      const record = buildRecord({
        language,
        providerId: info.providerId,
        providerName: info.providerName,
        model: info.model,
        totalChars: p.total,
        typed: p.typed,
        correct: p.correct,
        mistakes: p.mistakes,
        durationMs,
      });
      appendRecord(record);
    }
    if (mode === 'typing' && completed) {
      setInfo(
        auto
          ? '完了です ✓  Enterで関連する次のお題を生成'
          : '完了です ✓  Enterでホームに戻る',
      );
    }
  }, [mode, completed, typing, language, auto]);

  const startGeneration = async (
    prompt: string,
    previous?: { prompt: string; code: string },
  ) => {
    setError(null);
    setInfo(null);
    setMode('loading');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await generateSnippet({
        prompt,
        language,
        signal: ctrl.signal,
        previous,
        withExplanation: explanation,
      });
      if (!result.code || result.code.trim().length === 0) {
        throw new Error('LLMからの出力が空でした');
      }
      setTyping(createTypingState(result.code));
      setExplanationText(explanation ? result.explanation : null);
      if (prompt) setLastPrompt(prompt);
      setPromptValue('');
      chatAbortRef.current?.abort();
      chatAbortRef.current = null;
      setChatHistory([]);
      setChatInput('');
      setChatActive(false);
      setChatLoading(false);
      setChatError(null);
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

  const submitChat = async (raw: string) => {
    const question = raw.trim();
    if (!question || !typing || chatLoading) return;
    const code = typing.target;
    const historyForCall = chatHistory;
    setChatError(null);
    setChatInput('');
    setChatHistory((h) => [...h, { role: 'user', content: question }]);
    setChatLoading(true);
    const ctrl = new AbortController();
    chatAbortRef.current = ctrl;
    try {
      const reply = await chatAboutSnippet({
        code,
        explanation: explanationText,
        language,
        prompt: lastPrompt,
        history: historyForCall,
        question,
        signal: ctrl.signal,
      });
      setChatHistory((h) => [...h, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setChatError(e?.message ?? String(e));
      }
    } finally {
      if (chatAbortRef.current === ctrl) chatAbortRef.current = null;
      setChatLoading(false);
    }
  };

  useInput(
    (input, key) => {
      if (key.ctrl && (input === 'c' || input === 'd')) {
        exit();
        return;
      }

      if (chatActive) {
        if (key.escape) {
          chatAbortRef.current?.abort();
          chatAbortRef.current = null;
          setChatActive(false);
          setChatInput('');
          setChatLoading(false);
          setChatError(null);
        }
        return;
      }

      if (key.shift && key.tab) {
        const next = !auto;
        setAuto(next);
        setError(null);
        setInfo(`auto モード: ${next ? 'ON' : 'OFF'}`);
        return;
      }

      if (
        mode === 'language-picker' ||
        mode === 'provider-picker' ||
        mode === 'api-key-input' ||
        mode === 'model-picker' ||
        mode === 'stats' ||
        mode === 'auto-picker' ||
        mode === 'explanation-picker' ||
        mode === 'syakyode-md-picker'
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
        if (slashMatches.length > 0) {
          if (key.upArrow || (key.ctrl && input === 'p')) {
            setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
            return;
          }
          if (key.downArrow || (key.ctrl && input === 'n')) {
            setSlashIndex((i) => (i + 1) % slashMatches.length);
            return;
          }
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
        if (input === 'c' && !key.ctrl && !key.meta) {
          setChatActive(true);
          setChatError(null);
          return;
        }
        if (key.return) {
          if (auto && lastPrompt && typing) {
            const previousCode = typing.target;
            const previousPrompt = lastPrompt;
            setTyping(null);
            setInfo(null);
            void startGeneration('', {
              prompt: previousPrompt,
              code: previousCode,
            });
          } else {
            setTyping(null);
            setInfo(null);
            setMode('input');
          }
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

  const handleSyakyodeMdEdit = (scope: SyakyodeScope) => {
    const targetPath = getSyakyodePath(scope);
    const wasRaw = isRawModeSupported;
    if (wasRaw) {
      try {
        setRawMode(false);
      } catch {}
      try {
        stdin.pause();
      } catch {}
    }
    const result = openSyakyodeEditor(scope);
    if (wasRaw) {
      try {
        stdin.resume();
      } catch {}
      try {
        setRawMode(true);
      } catch {}
    }
    setMode('input');
    if (result.ok) {
      setError(null);
      setInfo(`Syakyode.md を保存しました: ${targetPath}`);
    } else {
      setError(`エディタ起動に失敗: ${result.message ?? '不明なエラー'} (${targetPath})`);
    }
  };

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
        auto={auto}
        explanation={explanation}
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
                  const matches = filterCommands(trimmed);
                  const picked = matches[slashIndex] ?? matches[0];
                  if (!picked) return;
                  setError(null);
                  setInfo(null);
                  setPromptValue('');
                  setSlashIndex(0);
                  if (picked.command.name === '/language') {
                    setMode('language-picker');
                  } else if (picked.command.name === '/model') {
                    setStagedProvider(activeProvider);
                    setMode('provider-picker');
                  } else if (picked.command.name === '/auto') {
                    setMode('auto-picker');
                  } else if (picked.command.name === '/explanation') {
                    setMode('explanation-picker');
                  } else if (picked.command.name === '/stats') {
                    setMode('stats');
                  } else if (picked.command.name === '/syakyode-md') {
                    setMode('syakyode-md-picker');
                  } else if (picked.command.name === '/quit') {
                    exit();
                  }
                  return;
                }
                if (trimmed.startsWith('#')) {
                  const line = trimmed.slice(1).trim();
                  if (!line) {
                    setError('# の後に追記したい内容を書いてください');
                    return;
                  }
                  try {
                    appendSyakyodeLine('project', line);
                    setError(null);
                    setInfo(`プロジェクト Syakyode.md に追記しました: ${getSyakyodePath('project')}`);
                    setPromptValue('');
                  } catch (e: any) {
                    setError(`Syakyode.md への追記に失敗: ${e?.message ?? String(e)}`);
                  }
                  return;
                }
                void startGeneration(trimmed);
              }}
              placeholder="お題を入力してEnter..."
            />
          </Box>
          {promptValue.startsWith('/') && (
            <SlashCommandPalette query={promptValue} selectedIndex={slashIndex} />
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

      {mode === 'stats' && (
        <Box marginTop={1}>
          <StatsView onClose={() => setMode('input')} />
        </Box>
      )}

      {mode === 'auto-picker' && (
        <Box marginTop={1}>
          <BoolPicker
            title="auto モードを選択"
            current={auto}
            options={[
              { value: true, label: 'ON', description: '完了後に関連お題を自動生成' },
              { value: false, label: 'OFF', description: '完了後はホームに戻る' },
            ]}
            onSelect={(v) => {
              setAuto(v);
              setInfo(`auto モード: ${v ? 'ON' : 'OFF'}`);
              setMode('input');
            }}
            onCancel={() => setMode('input')}
          />
        </Box>
      )}

      {mode === 'explanation-picker' && (
        <Box marginTop={1}>
          <BoolPicker
            title="解説表示を選択"
            current={explanation}
            options={[
              { value: true, label: 'ON', description: '写経枠の下に日本語の解説を表示' },
              { value: false, label: 'OFF', description: 'コードのみ生成・表示' },
            ]}
            onSelect={(v) => {
              setExplanation(v);
              setInfo(`解説表示: ${v ? 'ON' : 'OFF'}`);
              setMode('input');
            }}
            onCancel={() => setMode('input')}
          />
        </Box>
      )}

      {mode === 'syakyode-md-picker' && (
        <Box marginTop={1}>
          <BoolPicker
            title="Syakyode.md をどちらで編集する？"
            current={false}
            options={[
              {
                value: false,
                label: 'プロジェクト',
                description: getSyakyodePath('project'),
              },
              {
                value: true,
                label: 'グローバル',
                description: getSyakyodePath('global'),
              },
            ]}
            onSelect={(isGlobal) => handleSyakyodeMdEdit(isGlobal ? 'global' : 'project')}
            onCancel={() => setMode('input')}
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
          {explanation && explanationText && (
            <Box
              borderStyle="round"
              borderColor="gray"
              paddingX={1}
              flexDirection="column"
              marginTop={1}
            >
              <Text color="gray" bold>解説</Text>
              <Text>{explanationText}</Text>
            </Box>
          )}
          {completed && (
            <ChatPanel
              history={chatHistory}
              input={chatInput}
              onInputChange={setChatInput}
              onSubmit={submitChat}
              active={chatActive}
              loading={chatLoading}
              error={chatError}
            />
          )}
          {info && (
            <Box marginTop={1}>
              <Text color="green">{info}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text color="gray">
              {completed
                ? chatActive
                  ? 'Enter: 質問を送信 / Esc: 質問入力を閉じる'
                  : auto
                    ? 'Enter: 関連する次のお題を生成 / c: 質問する / Esc: ホームに戻る'
                    : 'Enter: ホームに戻る / c: 質問する / Esc: ホームに戻る'
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
  auto: boolean;
  explanation: boolean;
}> = ({ model, providerName, mode, language, auto, explanation }) => {
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
                : mode === 'stats'
                  ? 'STATS'
                  : mode === 'auto-picker'
                    ? 'AUTO'
                    : mode === 'explanation-picker'
                      ? 'EXPLANATION'
                      : mode === 'syakyode-md-picker'
                        ? 'SYAKYODE.MD'
                        : 'TYPING';
  const color =
    mode === 'input'
      ? 'cyan'
      : mode === 'loading'
        ? 'yellow'
        : mode === 'language-picker' ||
            mode === 'provider-picker' ||
            mode === 'model-picker' ||
            mode === 'api-key-input' ||
            mode === 'stats' ||
            mode === 'auto-picker' ||
            mode === 'explanation-picker' ||
            mode === 'syakyode-md-picker'
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
      <Text color="gray"> · auto: </Text>
      <Text color={auto ? 'green' : 'gray'} bold={auto}>
        {auto ? 'ON' : 'OFF'}
      </Text>
      <Text color="gray"> · explanation: </Text>
      <Text color={explanation ? 'green' : 'gray'} bold={explanation}>
        {explanation ? 'ON' : 'OFF'}
      </Text>
    </Box>
  );
};

const SlashCommandPalette: React.FC<{ query: string; selectedIndex: number }> = ({
  query,
  selectedIndex,
}) => {
  const matches = filterCommands(query);
  if (matches.length === 0) {
    return (
      <Box marginTop={0}>
        <Text color="gray" dimColor>該当するコマンドがありません</Text>
      </Box>
    );
  }
  const idx = Math.max(0, Math.min(selectedIndex, matches.length - 1));
  return (
    <Box flexDirection="column" marginTop={0}>
      {matches.map((m, i) => {
        const isAlias = m.displayName !== m.command.name;
        const selected = i === idx;
        return (
          <Box key={`${m.command.name}:${m.displayName}`}>
            <Text color={selected ? 'cyan' : 'gray'} bold={selected}>
              {selected ? '▶ ' : '  '}
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

const ChatPanel: React.FC<{
  history: SnippetChatMessage[];
  input: string;
  onInputChange: (v: string) => void;
  onSubmit: (v: string) => void;
  active: boolean;
  loading: boolean;
  error: string | null;
}> = ({ history, input, onInputChange, onSubmit, active, loading, error }) => {
  return (
    <Box
      borderStyle="round"
      borderColor={active ? 'cyan' : 'gray'}
      paddingX={1}
      flexDirection="column"
      marginTop={1}
    >
      <Text color={active ? 'cyan' : 'gray'} bold>
        対話 (LLMにこのコード・解説について質問する)
      </Text>
      {history.length === 0 && !loading && (
        <Text color="gray" dimColor>
          まだ質問はありません。
        </Text>
      )}
      {history.map((m, i) => (
        <Box key={i} flexDirection="column" marginTop={1}>
          <Text color={m.role === 'user' ? 'cyan' : 'magenta'} bold>
            {m.role === 'user' ? 'あなた' : 'アシスタント'}
          </Text>
          <Text>{m.content}</Text>
        </Box>
      ))}
      {loading && (
        <Box marginTop={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text color="gray"> 回答を生成中... (Escでキャンセル)</Text>
        </Box>
      )}
      {error && (
        <Box marginTop={1}>
          <Text color="red">エラー: {error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <PromptInput
          value={input}
          onChange={onInputChange}
          onSubmit={onSubmit}
          placeholder={active ? 'コードや解説について質問...' : 'c キーで質問入力を有効化'}
          disabled={!active || loading}
        />
      </Box>
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
