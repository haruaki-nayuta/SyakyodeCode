# SyakyodeCode

LLM が生成したコードスニペットを、ターミナル上で**写経**して練習するための TUI ツールです。
お題を日本語で入力すると LLM が短いコードを生成し、それをそのまま打鍵していきます。タイピング速度・正解率・ミス数をリアルタイムに表示し、完了後はそのコードについて LLM に質問することもできます。

[Ink](https://github.com/vadimdemedes/ink)（React for CLI）+ TypeScript で実装されており、OpenAI 互換の API（LM Studio / OpenAI / OpenRouter / Groq / Together AI）を切り替えて使えます。

---

## 主な機能

- **お題から自動生成** — 自然言語のプロンプトから、写経しやすい長さのコードスニペットを生成
- **写経モード** — 進捗バー / 正解率 / ミス数 をリアルタイム表示
- **日本語の解説** — 生成されたコードの解説をそのまま下に表示（ON/OFF 切替可）
- **対話パネル** — 写経完了後、`c` キーでそのコードについて LLM に質問できる
- **auto モード** — 完了したお題に**関連する**次のお題を自動生成して連続練習
- **自動インデント** — 改行時にお題のインデント空白を自動入力（ON/OFF 切替可）
- **マルチプロバイダー** — LM Studio（ローカル）/ OpenAI / OpenRouter / Groq / Together AI に対応
- **統計の蓄積** — セッションごとに JSONL で記録、`/stats` で集計表示
- **20 言語のターゲット指定** — Python / TypeScript / Go / Rust / C / C++ / Java / Kotlin / Swift / Ruby / PHP / C# / Scala / Haskell / Elixir / Lua / SQL / Bash など

## デモ

```
SyakyodeCode · [TYPING] · LM Studio (local) / openai/gpt-oss-20b · lang: Python · auto: ON · explanation: ON · indent: ON

██████████████░░░░░░░░░░░░░░░░  142/300   正解率 97%   ミス 4

╭──────────────────────────────────────────────╮
│ def is_prime(n: int) -> bool:                │
│     if n < 2:                                │
│         return False                         │
│     ...                                      │
╰──────────────────────────────────────────────╯
```

## 必要環境

- Node.js 20 以上
- 以下のいずれかの LLM 接続先
  - **LM Studio**（推奨・ローカル / 無料） — [lmstudio.ai](https://lmstudio.ai/) でモデルをロードし `http://localhost:1234` でサーバーを起動
  - **OpenAI** / **OpenRouter** / **Groq** / **Together AI** の API キー

## インストール

```bash
git clone https://github.com/haruaki-nayuta/SyakyodeCode.git
cd SyakyodeCode
npm install
```

## 使い方

開発モードで起動（推奨）:

```bash
npm run dev
```

ビルドして起動:

```bash
npm run build
npm start
```

起動後、HOME 画面でお題を日本語で入力して Enter で生成が始まります。
例:

- `Pythonで素数判定を再帰で書いて`
- `TypeScriptでデバウンス関数`
- `Goでmapの値を降順ソートして上位N件`

## キーバインド

### HOME 画面

| キー | 動作 |
|---|---|
| Enter | お題を送信して生成開始 |
| `/` から始めて入力 | スラッシュコマンドのパレット表示（↑↓ で選択） |
| Shift + Tab | auto モードのトグル |
| Esc | 写経画面に戻る（直前の写経がある場合） |
| Ctrl + C / Ctrl + D | 終了 |

### 写経画面

| キー | 動作 |
|---|---|
| 文字キー | 1 文字ずつ打鍵 |
| Enter | 改行（auto-indent ON のときはインデント空白を自動補完） |
| Tab | スペース 2 文字を入力 |
| Backspace | 1 文字戻る |
| Esc | HOME に戻る |

### 完了後

| キー | 動作 |
|---|---|
| Enter | auto ON のときは次のお題を生成 / OFF のときは HOME に戻る |
| `c` | 対話パネルを開いて LLM に質問 |
| Esc | HOME に戻る |

## スラッシュコマンド

| コマンド | 説明 |
|---|---|
| `/model` | プロバイダーとモデルを選択 |
| `/language` | プログラミング言語を設定 |
| `/auto` | auto モード（完了後に関連お題を自動生成）の ON/OFF |
| `/explanation` | 日本語の解説表示の ON/OFF |
| `/auto-indent` | 改行時の自動インデントの ON/OFF |
| `/stats` | 統計サマリを表示 |
| `/quit` (`/exit`) | 終了 |

## プロバイダーと API キー

`/model` から下記のプロバイダーを切り替えられます。OpenAI 互換エンドポイントなら同じフローで追加できます。

| プロバイダー | エンドポイント | API キー |
|---|---|---|
| LM Studio (local) | `http://localhost:1234/v1` | 不要 |
| OpenAI | `https://api.openai.com/v1` | 必要 |
| OpenRouter | `https://openrouter.ai/api/v1` | 必要 |
| Groq | `https://api.groq.com/openai/v1` | 必要 |
| Together AI | `https://api.together.xyz/v1` | 必要 |

API キーが必要なプロバイダーを選ぶと初回に入力プロンプトが出ます。

## 設定とデータの保存場所

| 種類 | パス |
|---|---|
| 設定（言語・モデル・トグル類） | `$XDG_CONFIG_HOME/syakyode-code/settings.json`（既定: `~/.config/syakyode-code/settings.json`） |
| API キー | `$XDG_DATA_HOME/syakyode-code/auth.json`（既定: `~/.local/share/syakyode-code/auth.json`、`chmod 600`） |
| 統計ログ | `$XDG_CONFIG_HOME/syakyode-code/stats.jsonl` |

API キーをファイルに残したくない場合は、環境変数 `SYAKYODE_AUTH_CONTENT` に JSON 文字列を渡すこともできます。

## 開発

```bash
npm run dev      # tsx で TUI を起動
npm run build    # tsc でビルド（dist/ に出力）
npm start        # ビルド済みバイナリを実行
```

ディレクトリ構成:

```
src/
├── App.tsx              # ルート React コンポーネント / 全モード制御
├── cli.tsx              # エントリポイント
├── components/          # Ink ベースの UI 部品
├── lib/
│   ├── llm.ts           # OpenAI 互換 API のクライアント
│   ├── providers.ts     # 組み込みプロバイダー定義
│   ├── settings.ts      # 設定の永続化
│   ├── auth.ts          # API キーの永続化
│   └── stats.ts         # 統計の記録・集計
└── typing/state.ts      # 写経の状態遷移ロジック
```

## ライセンス

未設定。利用前にリポジトリオーナーへ確認してください。
