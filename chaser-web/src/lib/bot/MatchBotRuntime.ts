import {
  type Action,
  type GameState,
  isAction,
  type PlayerId,
  type TurnView,
} from "../../core/engine";
import type { RoomMode } from "../../core/match/room";
import type { ActionMeta, ServerMessage } from "../../core/match/wsTypes";
import { WsMatchClient } from "../client/wsMatchClient";
import { defaultAction } from "./executor";
import type {
  BotRuntime,
  BotRuntimeInitInput,
  BotRuntimeMeta,
  BotRuntimeResult,
} from "./runtime/BotRuntime";

export interface MatchBotRuntimeOptions {
  roomId: string;
  slot: PlayerId;
  mode?: RoomMode;
  botId?: number | null;
  runtime: BotRuntime;
  runtimeInit: BotRuntimeInitInput;
  wsUrl?: string;
  onMessage?: (msg: ServerMessage) => void;
}

export class MatchBotRuntime {
  private readonly slot: PlayerId;
  private readonly runtime: BotRuntime;
  private readonly runtimeInit: BotRuntimeInitInput;
  private readonly client: WsMatchClient;
  private runtimeInitPromise: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  private runningTurn = false;
  private latestState: GameState | null = null;
  private stopped = false;
  private turnGeneration = 0;

  constructor(options: MatchBotRuntimeOptions) {
    this.slot = options.slot;
    this.runtime = options.runtime;
    this.runtimeInit = options.runtimeInit;
    this.client = new WsMatchClient({
      roomId: options.roomId,
      mode: options.mode,
      intent: "player",
      slot: options.slot,
      botId: options.botId ?? null,
      url: options.wsUrl,
    });
    if (options.onMessage) {
      this.client.onMessage(options.onMessage);
    }
  }

  start(): void {
    if (this.unsubscribe) {
      return;
    }
    this.stopped = false;
    this.runtimeInitPromise = this.runtime
      .init(this.runtimeInit)
      .catch((err) => {
        throw err;
      });
    this.unsubscribe = this.client.onMessage((msg) =>
      this.handleServerMessage(msg),
    );
    this.client.connect();
  }

  stop(): void {
    this.stopped = true;
    this.turnGeneration += 1;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.client.disconnect();
    this.runtimeInitPromise = null;
    this.latestState = null;
    this.runningTurn = false;
    void this.runtime.dispose();
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "turnStart":
        this.handleTurnStart(msg.playerId, msg.view);
        break;
      case "stateUpdate":
        this.latestState = msg.state;
        // UI/host can hook into ws client directly if needed.
        console.debug("[MatchBotRuntime] server message", msg);
        break;
      case "joined":
      case "gameEnd":
      case "roomClosed":
      case "error":
        // For now we simply log; UI/host can hook into ws client directly if needed.
        console.debug("[MatchBotRuntime] server message", msg);
        if (msg.type === "gameEnd" || msg.type === "roomClosed") {
          this.stop();
        }
        break;
      default:
        console.warn("[MatchBotRuntime] unknown server message", msg);
    }
  }

  private handleTurnStart(playerId: PlayerId, view: TurnView): void {
    if (playerId !== this.slot) {
      return;
    }
    if (this.runningTurn) {
      console.warn(
        "[MatchBotRuntime] turnStart received while a turn is running; ignoring",
      );
      return;
    }

    const turnGeneration = ++this.turnGeneration;
    this.runningTurn = true;
    Promise.resolve()
      .then(() => this.ensureRuntimeReady())
      .then(() => {
        if (this.stopped || turnGeneration !== this.turnGeneration) {
          throw new Error("MatchBotRuntime stopped");
        }
        const state = this.latestState;
        if (!state) {
          throw new Error("MatchBotRuntime has no stateUpdate yet");
        }
        return this.runtime.onTurn({
          state,
          playerId,
          around: view.around,
        });
      })
      .then((result) => {
        if (this.stopped || turnGeneration !== this.turnGeneration) {
          return;
        }
        const normalized = this.normalizeResult(result);
        this.client.sendAction(normalized.action, playerId, normalized.meta);
      })
      .catch((err) => {
        if (this.stopped || turnGeneration !== this.turnGeneration) {
          return;
        }
        console.error("[MatchBotRuntime] onTurn failed", err);
        this.client.sendAction(defaultAction, playerId, {
          fallbackReason: "error",
          note: err instanceof Error ? err.message : String(err),
          source: "bot",
        });
      })
      .finally(() => {
        if (turnGeneration === this.turnGeneration) {
          this.runningTurn = false;
        }
      });
  }

  private ensureRuntimeReady(): Promise<void> {
    if (!this.runtimeInitPromise) {
      this.runtimeInitPromise = this.runtime
        .init(this.runtimeInit)
        .catch((err) => {
          throw err;
        });
    }
    return this.runtimeInitPromise;
  }

  private normalizeResult(
    result: BotRuntimeResult | Action | null | undefined,
  ): {
    action: Action;
    meta?: ActionMeta;
  } {
    if (!result || typeof result !== "object") {
      return {
        action: defaultAction,
        meta: this.invalidActionMeta(undefined, "action result is missing"),
      };
    }
    if ("action" in result) {
      const action = result.action;
      if (!isAction(action)) {
        return {
          action: defaultAction,
          meta: this.invalidActionMeta(result.meta, "invalid action in result"),
        };
      }
      const meta = this.toActionMeta(result.meta);
      return { action, meta };
    }
    if (!isAction(result)) {
      return {
        action: defaultAction,
        meta: this.invalidActionMeta(undefined, "invalid action"),
      };
    }
    return { action: result as Action };
  }

  private invalidActionMeta(
    meta?: BotRuntimeMeta,
    note = "invalid action result",
  ): ActionMeta {
    return (
      this.toActionMeta({
        ...meta,
        fallbackReason: meta?.fallbackReason ?? "invalid",
        errorPhase: meta?.errorPhase ?? "runtime",
        note: meta?.note ?? note,
      }) ?? { fallbackReason: "error", source: "bot" }
    );
  }

  private toActionMeta(meta?: BotRuntimeMeta): ActionMeta | undefined {
    if (!meta) return undefined;
    const fallbackReason =
      meta.fallbackReason === "invalid" ? "error" : meta.fallbackReason;
    return {
      ...meta,
      fallbackReason,
      source: "bot",
    };
  }
}
