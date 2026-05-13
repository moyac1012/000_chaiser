# Bot Runtime

このドキュメントは Bot 実行基盤の **現行仕様** と **実装構成** をまとめたものです。
実装と一致していることを最優先にし、未実装の構想は書きません。

## 役割分離

- **Host**: 対戦進行と Bot ランタイムのライフサイクル管理を担当
  - WS ルーム進行 / ローカル対戦 / TurnView の供給
  - fallback / timeout / error の扱い
  - ログの UI 連携
  - 例: `src/lib/bot/MatchBotRuntime.ts`, `src/app/my/bots/components/LocalTrainingArena.tsx`

- **Runtime**: Bot コードを実行し、1ターン1アクションを保証
  - 例: `src/lib/bot/runtime/*`

## インターフェース（現行）

`src/lib/bot/runtime/BotRuntime.ts` が正です。

```ts
export type BotRuntimeLanguage = "js" | "blockly" | "ruby";

export type BotRuntimeInitStatus = {
  phase: "start" | "loading-wasm" | "initializing-vm" | "ready";
};

export type BotRuntimeInitInput = {
  code: string;
  timeoutMs: number;
  seed?: number;
  onInitStatus?: (status: BotRuntimeInitStatus) => void;
};

export type BotRuntimeTurnInput = {
  state: GameState;
  playerId: PlayerId;
  around: number[];
};

export interface BotRuntime {
  readonly language: BotRuntimeLanguage;
  init(input: BotRuntimeInitInput): Promise<void>;
  onTurn(input: BotRuntimeTurnInput): Promise<BotRuntimeResult>;
  dispose(): Promise<void>;
}

export type BotRuntimeResult = {
  action: Action;
  logs?: BotConsoleEntry[];
  meta?: {
    fallbackReason?: "error" | "timeout" | "invalid";
    errorPhase?: "init" | "runtime";
    errorMessage?: string;
    errorStack?: string;
    note?: string;
  };
};
```

## 実装一覧（現行）

- **JS (Worker 優先)**
  - `WorkerJsBotRuntime` は Web Worker を使用し、1ターンごとのタイムアウトを持つ
  - `JsBotRuntime` はメインスレッドで直接実行（Worker が使えない場合の fallback）

- **Blockly**
  - Blockly → JS 生成 → `JsBotRuntime` / `WorkerJsBotRuntime`
  - `language="blockly"` で区別する

- **Ruby (WASM)**
  - `RubyBotRuntime` が `@ruby/wasm-wasi` を使用してブラウザで実行
  - **現状はメインスレッド実行**（TODO: Worker 化）
  - 初期化状況は `onInitStatus` で通知

生成・選択の入り口は `src/lib/bot/runtime/createBotRuntime.ts`。

## 実行ルール

- 1ターンに **1アクションのみ**
  - `BotApi` が二重実行を防止する
- Runtime は `BotRuntimeResult` を返す
  - `meta.fallbackReason` がある場合、Host 側で敗北扱いにすることがある

## ログ

- Runtime は `BotConsoleEntry[]` を返す
- 順序は **同ターン内の呼び出し順**を維持する

## 追加実装の指針

新しい言語ランタイムを追加する場合:

- `BotRuntimeLanguage` に追加
- `src/lib/bot/runtime/` に Runtime 実装を追加
- `createBotRuntime` に分岐を追加
- 初期化が重い場合は `onInitStatus` を通知する
- タイムアウト / ログ収集 / 1ターン1アクション保証を満たす
