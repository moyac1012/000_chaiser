import type { Action, GameState, PlayerId } from "@/core/engine";

export type BotRuntimeLanguage = "js" | "blockly" | "ruby";

export type BotConsoleEntry = {
  id: number;
  level: "log" | "info" | "warn" | "error";
  args: unknown[];
};

export type BotRuntimeMeta = {
  fallbackReason?: "error" | "timeout" | "invalid";
  errorPhase?: "init" | "runtime";
  errorMessage?: string;
  errorStack?: string;
  note?: string;
};

export type BotRuntimeInitPhase =
  | "start"
  | "loading-wasm"
  | "initializing-vm"
  | "ready";

export type BotRuntimeInitStatus = {
  phase: BotRuntimeInitPhase;
};

export type BotRuntimeResult = {
  action: Action;
  logs?: BotConsoleEntry[];
  meta?: BotRuntimeMeta;
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
