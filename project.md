# AI Interview Assistant - プロジェクト仕様書

## 概要

OpenAI Realtime API と Agents SDK を活用した、音声ベースのリアルタイムインタビュー支援システム。
ブラウザ上で動作する Web アプリケーションとして、**自動インタビュー**と**人間インタビュアーのサポート**の2つのモードを提供する。

## 技術スタック

| カテゴリ | 技術 | バージョン |
|---------|------|-----------|
| フレームワーク | Next.js (App Router) | 16.x |
| 言語 | TypeScript | 5.x |
| AI/音声 | OpenAI Realtime API | gpt-realtime |
| エージェント | @openai/agents (Agents SDK) | 0.4.x |
| 通信 | WebRTC (OpenAIRealtimeWebRTC) | - |
| 音声分析 | Meyda.js + Web Audio API | 5.6.x |
| スタイリング | Tailwind CSS v4 + shadcn/ui | 4.x |
| バリデーション | Zod | 4.x |

---

## アーキテクチャ

```
ブラウザ (クライアント)
├── マイク音声 → WebRTC → OpenAI Realtime API
├── useRealtimeSession  → セッション管理・書き起こし・AI提案
├── useAudioAnalysis    → クライアント側音声特徴量抽出
└── UIコンポーネント     → 可視化・書き起こし・提案表示

サーバー (Next.js API Routes)
├── /api/session  → エフェメラルトークン発行
└── /api/results  → インタビュー結果の保存・取得

OpenAI Realtime API
├── gpt-realtime モデル → 音声対話 (speech-to-speech)
├── gpt-4o-transcribe   → 回答者音声の書き起こし (自動モード)
├── gpt-4o-transcribe-diarize → 話者分離付き書き起こし (サポートモード)
└── Agents SDK          → ツール実行・エージェントハンドオフ
```

---

## 2つのインタビューモード

### 自動インタビューモード (`auto`)

AI が音声でインタビューを実施する。回答内容と声のトーンに応じて次の質問を動的に分岐させる。

| 項目 | 内容 |
|------|------|
| AI音声出力 | あり（voice: `cedar`） |
| 書き起こしモデル | `gpt-4o-transcribe` |
| 主エージェント | `InterviewAgent` |
| ハンドオフ先 | `TechnicalTopicAgent`, `BehavioralTopicAgent`, `ClosingAgent` |
| ツール | `get_next_question`, `record_observation` |

### サポートモード (`support`)

人間のインタビュアーをリアルタイムで支援する。AI は音声を出さず、ツール経由でテキスト提案のみ行う。

| 項目 | 内容 |
|------|------|
| AI音声出力 | なし（`audioElement.muted = true` + プロンプト制約） |
| 書き起こしモデル | `gpt-4o-transcribe-diarize`（話者分離対応） |
| 主エージェント | `SupportAgent` |
| ツール | `suggest_follow_up`, `record_observation` |
| 話者分離 | `speaker_0` / `speaker_1` ラベルで自動識別 |

---

## エージェント定義 (`src/lib/agents.ts`)

### InterviewAgent

メインのインタビュアーエージェント。自動モードで使用。

- 日本語で丁寧かつ自然な対話を行う
- 各回答後に `get_next_question` ツールで次の質問を動的に決定
- トピックに応じて専門エージェントにハンドオフ

### TechnicalTopicAgent

技術的なトピックに特化したサブエージェント。

- 具体的なエピソードや技術的詳細を引き出す
- 抽象的な回答にはフォローアップで深掘り
- 完了後は `ClosingAgent` にハンドオフ可能

### BehavioralTopicAgent

行動面・人物面に特化したサブエージェント。

- STAR形式（状況・課題・行動・結果）で回答を構造化
- 価値観やモチベーションを探る
- 完了後は `ClosingAgent` にハンドオフ可能

### ClosingAgent

インタビュー終了時のクロージングを担当。

- 感謝の表明 → 質問確認 → 今後の説明 → 挨拶

### SupportAgent

サポートモード専用。**音声出力を一切行わず、ツール経由のみでフィードバック**を提供。

- `suggest_follow_up` で次の質問候補を提案
- `record_observation` で回答者の特徴を記録

---

## ツール定義

### get_next_question

回答の評価に基づいて次の質問を動的に決定する対話分岐ツール。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `currentAnswerSummary` | `string` | 回答者の回答の要約 |
| `sentiment` | `"positive" \| "neutral" \| "negative"` | 回答者の感情。声のトーンや内容からAIが判断 |
| `topicCovered` | `boolean` | 現在のトピックが十分にカバーされたか |
| `answerQuality` | `"detailed" \| "adequate" \| "brief" \| "off_topic"` | 回答の質・深さの評価 |

**分岐ロジック** (`interview-config.ts`):
- `brief` → 同じ質問のフォローアップを返す（深掘り）
- `off_topic` → 軌道修正のフォローアップを返す
- `topicCovered: false` → 同じトピック内の次の質問へ
- `topicCovered: true` → 次のトピックへ移行（必要に応じてエージェントハンドオフ）
- 全トピック完了 → `ClosingAgent` にハンドオフ

### record_observation

インタビュー中の観察事項を記録するツール。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `observation` | `string` | 観察メモ |
| `category` | `enum` | `communication_style` / `expertise` / `enthusiasm` / `concern` / `notable_response` |
| `importance` | `"high" \| "medium" \| "low"` | 重要度 |

### suggest_follow_up

サポートモードで、人間のインタビュアーに提案を表示するツール。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `suggestion` | `string` | 提案する質問やフォローアップ |
| `reason` | `string` | 提案の理由 |
| `priority` | `"high" \| "medium" \| "low"` | 優先度 |

---

## インタビューシナリオ (`src/lib/interview-config.ts`)

### 一般インタビュー (`general`)

| トピック | ID | 質問数 | 内容 |
|---------|-----|--------|------|
| アイスブレイク | `icebreak` | 2 | 自己紹介、期待 |
| 経験・スキル | `experience` | 3 | 挑戦的プロジェクト、チームワーク、学習 |
| 技術的深掘り | `technical` | 3 | 技術スタック、問題解決、コード品質 |
| 行動・人物面 | `behavioral` | 3 | 困難への対処、意見対立、自己分析 |
| クロージング | `closing` | 1 | 質問確認、締め |

### ユーザーリサーチ (`user_research`)

| トピック | ID | 質問数 | 内容 |
|---------|-----|--------|------|
| 利用背景 | `context` | 2 | 利用シーン、きっかけ |
| 使用体験 | `experience_ux` | 2 | 気に入っている機能、使いにくい点 |
| ニーズ・要望 | `needs` | 1 | 欲しい機能 |
| クロージング | `closing` | 1 | 締め |

---

## Realtime API パラメータ (`useRealtimeSession.ts`)

### セッション設定

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `model` | `"gpt-realtime"` | Realtime対話モデル（speech-to-speech） |
| `transport` | `OpenAIRealtimeWebRTC` | WebRTCトランスポート。ブラウザのマイク入力とスピーカー出力を管理 |

### 音声入力設定 (`config.audio.input`)

| パラメータ | 自動モード | サポートモード | 説明 |
|-----------|-----------|-------------|------|
| `transcription.model` | `gpt-4o-transcribe` | `gpt-4o-transcribe-diarize` | 入力音声の書き起こしモデル。サポートモードでは話者分離対応 |
| `turnDetection.type` | `server_vad` | `server_vad` | サーバー側VAD（Voice Activity Detection）。発話の開始/終了を検出 |
| `turnDetection.threshold` | `0.5` | `0.5` | VADの感度 (0.0-1.0)。高いほど大きな音でのみ反応。デフォルト0.5 |
| `turnDetection.prefixPaddingMs` | `300` | `300` | VADが発話を検出する前に含める音声の長さ (ms)。発話開始の取りこぼしを防ぐ |
| `turnDetection.silenceDurationMs` | `700` | `700` | 発話終了と判定する無音の長さ (ms)。短いとAIが素早く応答。長いと相手の間を待つ |

### 音声出力設定 (`config.audio.output`)

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `voice` | `"cedar"` | AIの声。OpenAI推奨の高品質ボイス。**セッション中は変更不可** |

利用可能な声: `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`, `cedar`

### 書き起こしモデルの違い

| モデル | 用途 | 特徴 |
|-------|------|------|
| `whisper-1` | レガシー | 旧モデル。精度はやや低い |
| `gpt-4o-transcribe` | 自動モード | GPT-4oベース。文脈理解による高精度書き起こし |
| `gpt-4o-transcribe-diarize` | サポートモード | 話者分離対応。`speaker` ラベルでインタビュアーと回答者を区別 |

---

## 音声分析パラメータ (`useAudioAnalysis.ts`)

クライアント側で Web Audio API + Meyda.js を使ってリアルタイム音声特徴量を抽出する。
**これは Realtime API とは独立した処理**で、ブラウザのマイク入力から直接分析する。

### 定数

| 定数 | 値 | 説明 |
|------|-----|------|
| `BUFFER_SIZE` | `2048` | FFT分析のバッファサイズ。AnalyserNodeのfftSizeに使用 |
| `HISTORY_MAX` | `300` | 保持する分析履歴の最大件数（約5分間分） |
| Meydaバッファ | `512` | Meydaの特徴量抽出バッファサイズ |

### 抽出される音声特徴量 (`AudioFeatures`)

| 特徴量 | フィールド | 型 | 説明 |
|--------|-----------|-----|------|
| RMS | `rms` | `number` | Root Mean Square。音声信号の実効値。音量の指標。0に近いほど静か |
| エネルギー | `energy` | `number` | フレーム内の総エネルギー。RMSの二乗に比例。発話の有無の判定に使用 |
| スペクトル重心 | `spectralCentroid` | `number` | 周波数スペクトルの「重心」(Hz)。声の「明るさ」の指標。高い→甲高い声、低い→落ち着いた声 |
| スペクトル平坦度 | `spectralFlatness` | `number` | 0-1の値。1に近いほどノイズ的（ホワイトノイズ）、0に近いほどトーン的（明瞭な音声） |
| ゼロ交差率 | `zcr` | `number` | 1秒間に波形がゼロを横切る回数。高い→摩擦音/子音が多い、低い→母音的 |
| 知覚的音量 | `loudness` | `number` | 人間の聴覚特性に基づく音量推定値。物理的な音圧（RMS）とは異なり、周波数ごとの感度差を考慮 |
| ピッチ | `pitch` | `number \| null` | 基本周波数 (Hz)。自己相関法で推定。50-600Hzの範囲のみ検出。`null`は無音または検出不可 |

### ピッチ検出 (`detectPitch`)

自己相関法（Autocorrelation）による基本周波数推定。

1. RMS が 0.01 未満なら `null`（無音判定）
2. 自己相関関数を全ラグについて計算
3. 最初のゼロ交差以降で最大相関値のラグを検出
4. `サンプルレート / ラグ = 周波数` で基本周波数を算出
5. 50-600Hz の範囲外なら `null`

---

## クライアント側の提案生成 (`SuggestionPanel.tsx`)

AI ツールからの提案に加え、クライアント側でも音声分析ヒューリスティクスに基づく提案を生成する。

### ルールベース提案の判定条件

| 提案 | 条件 | 優先度 |
|------|------|--------|
| 短い回答 | `lastEntry.text.length < 30` | medium |
| 声が小さい | `rms < 0.03` | medium |
| 熱心 | `pitch > 220Hz && rms > 0.1` | high |
| 緊張 | `pitch > 200Hz && spectralCentroid > 2500Hz` | high |
| 発話比率偏り | `interviewer/interviewee > 2` | low |
| 単調な声 | ピッチの標準偏差 < 15Hz（直近30サンプル） | low |

---

## API Routes

### POST `/api/session`

OpenAI Realtime API のエフェメラルトークンを発行する。

- エンドポイント: `https://api.openai.com/v1/realtime/client_secrets`
- リクエストボディ: `{ session: { type: "realtime", model: "gpt-realtime" } }`
- レスポンス: `{ apiKey: "ek_..." }` (1分間有効)

### POST/GET `/api/results`

インタビュー結果を `data/results/` ディレクトリにJSONファイルとして保存・取得する。

保存データ:
- トランスクリプト全文
- 音声分析履歴
- インタビュー設定（モード、シナリオ、開始/終了時刻）

---

## ファイル構成

```
src/
├── app/
│   ├── api/
│   │   ├── session/route.ts      # エフェメラルトークン発行
│   │   └── results/route.ts      # 結果保存・取得
│   ├── interview/page.tsx         # インタビュー実行ページ
│   ├── page.tsx                   # ランディングページ（モード/シナリオ選択）
│   ├── layout.tsx                 # ルートレイアウト
│   └── globals.css                # グローバルCSS（ダークテーマ）
├── components/
│   ├── InterviewRoom.tsx          # メインUI。セッション/分析を統合
│   ├── TranscriptPanel.tsx        # リアルタイム書き起こし表示
│   ├── SuggestionPanel.tsx        # AI提案 + ルールベース提案の表示
│   ├── AnalysisPanel.tsx          # 音声分析パネル
│   └── AudioVisualizer.tsx        # 音声波形・エネルギー可視化
├── hooks/
│   ├── useRealtimeSession.ts      # Realtime API接続・セッション管理
│   └── useAudioAnalysis.ts        # クライアント側音声分析
└── lib/
    ├── agents.ts                  # エージェント定義・ツール定義
    ├── interview-config.ts        # シナリオ・質問・分岐ロジック
    ├── types.ts                   # TypeScript型定義
    └── cn.ts                      # Tailwind CSSクラスユーティリティ
```

---

## 環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `OPENAI_API_KEY` | はい | OpenAI API キー。Realtime API にアクセスするために必要 |

---

## 既知の制約

1. **1セッション = 1声**: Realtime API の仕様上、セッション中にAIの声を変更できない
2. **話者分離の精度**: `gpt-4o-transcribe-diarize` の話者ラベルは自動割り当て。最初に話した人が `speaker_0` になる
3. **サポートモードの音声抑制**: プロンプトで発話を禁止 + `audioElement.muted` で二重に抑制しているが、API側で音声生成自体は行われるためトークンコストは発生する
4. **音声分析はクライアント側**: Meyda.js による分析はブラウザ内で完結。Realtime API は音声のピッチや感情分析機能を持たない
5. **ピッチ検出の限界**: 自己相関法は50-600Hz範囲内でのみ有効。楽器音や複数話者の重複には非対応
