import type { Action, PlayerId } from "../../core/engine";
import type { RoomMode } from "../../core/match/room";
import type {
  ActionMeta,
  ClientMessage,
  JoinIntent,
  ParticipantSlot,
  ServerMessage,
} from "../../core/match/wsTypes";

export interface MatchClientOptions {
  roomId: string;
  mode?: RoomMode;
  intent?: JoinIntent;
  slot?: ParticipantSlot;
  botId?: number | null;
  url?: string; // defaults to resolved base (NEXT_PUBLIC_WS_URL or current host)
}

export type ServerMessageHandler = (msg: ServerMessage) => void;

export function resolveWsMatchBaseUrl(): string {
  const envBase = process.env.NEXT_PUBLIC_WS_URL;
  if (envBase?.trim()) return envBase;
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}:8080/ws/match`;
    }
    return `${protocol}//${window.location.host}/ws/match`;
  }
  return "ws://localhost:8080/ws/match";
}

export function buildWsMatchUrl(args: {
  roomId: string;
  mode?: RoomMode;
  userId?: string;
  baseUrl?: string;
}): string {
  const url = new URL(args.baseUrl ?? resolveWsMatchBaseUrl());
  url.searchParams.set("roomId", args.roomId);
  if (args.mode) url.searchParams.set("mode", args.mode);
  if (args.userId) url.searchParams.set("userId", args.userId);
  return url.toString();
}

/**
 * Low-level WebSocket client for /ws/match.
 *
 * - Connects to the server and sends a `join` message on open.
 * - Provides `sendAction` for pushing player actions.
 * - Allows subscribing to typed server messages.
 */
export class WsMatchClient {
  private socket: WebSocket | null = null;
  private readonly handlers = new Set<ServerMessageHandler>();
  private pendingMessages: ClientMessage[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private closedByClient = false;
  private readonly roomId: string;
  private readonly mode?: RoomMode;
  private readonly intent?: JoinIntent;
  private readonly slot?: ParticipantSlot;
  private readonly botId?: number | null;
  private readonly url?: string;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectDelayMs: number;

  constructor(options: MatchClientOptions) {
    this.roomId = options.roomId;
    this.mode = options.mode;
    this.intent = options.intent;
    this.slot = options.slot;
    this.botId = options.botId ?? null;
    this.url = options.url;
    // E2E/開発環境では WebSocket の初回接続が一時的に失敗することがあるため、
    // 小さめの自動リトライを入れて UI 操作の安定性を上げる。
    this.maxReconnectAttempts = 3;
    this.reconnectDelayMs = 250;
  }

  connect(): void {
    this.closedByClient = false;

    if (this.isOpen() || this.isConnecting()) {
      return;
    }

    const targetUrl =
      this.url ?? buildWsMatchUrl({ roomId: this.roomId, mode: this.mode });
    const ws = new WebSocket(targetUrl);
    ws.addEventListener("open", () => {
      this.reconnectAttempts = 0;
      const joinMessage: ClientMessage = {
        type: "join",
        roomId: this.roomId,
        mode: this.mode,
        intent: this.intent,
        slot: this.slot,
        botId: this.botId,
      };
      ws.send(JSON.stringify(joinMessage));
      this.flushPending(ws);
    });
    ws.addEventListener("message", (event) => {
      const parsed = this.parseServerMessage(event.data);
      if (!parsed) {
        console.warn("[WsMatchClient] Failed to parse message", event.data);
        return;
      }
      for (const handler of this.handlers) {
        handler(parsed);
      }
    });
    ws.addEventListener("error", (event) => {
      console.warn("[WsMatchClient] socket error", event);
    });
    ws.addEventListener("close", () => {
      this.socket = null;
      this.scheduleReconnect();
    });

    this.socket = ws;
  }

  disconnect(): void {
    this.closedByClient = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!this.socket) {
      this.pendingMessages = [];
      return;
    }

    // Best-effort leave notice before closing.
    if (this.socket.readyState === WebSocket.OPEN) {
      const leaveMessage: ClientMessage = {
        type: "leave",
        roomId: this.roomId,
      };
      this.socket.send(JSON.stringify(leaveMessage));
    }
    this.socket.close();
    this.socket = null;
    this.pendingMessages = [];
  }

  sendAction(action: Action, playerId: PlayerId, meta?: ActionMeta): void {
    const message: ClientMessage = {
      type: "action",
      roomId: this.roomId,
      playerId,
      action,
      meta,
    };
    this.safeSend(message);
  }

  updateSlot(slot: ParticipantSlot, botId?: number | null): void {
    const message: ClientMessage = {
      type: "setSlot",
      roomId: this.roomId,
      slot,
      botId: botId ?? null,
    };
    this.safeSend(message);
  }

  leaveSlot(): void {
    const message: ClientMessage = {
      type: "leaveSlot",
      roomId: this.roomId,
    };
    this.safeSend(message);
  }

  startMatch(): void {
    const message: ClientMessage = {
      type: "start",
      roomId: this.roomId,
    };
    this.safeSend(message);
  }

  closeRoom(): void {
    const message: ClientMessage = {
      type: "closeRoom",
      roomId: this.roomId,
    };
    this.safeSend(message);
  }

  setMapId(mapId: string): void {
    const message: ClientMessage = {
      type: "setMap",
      roomId: this.roomId,
      mapId,
    };
    this.safeSend(message);
  }

  onMessage(handler: ServerMessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private isOpen(): boolean {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  private isConnecting(): boolean {
    return !!this.socket && this.socket.readyState === WebSocket.CONNECTING;
  }

  private scheduleReconnect(): void {
    if (this.closedByClient) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    if (this.reconnectTimer) return;

    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelayMs);
  }

  private safeSend(message: ClientMessage): void {
    if (this.closedByClient) {
      return;
    }
    if (!this.socket) {
      // UI/テスト側が connect() より先に操作するケースがあるため、open までバッファする。
      this.pendingMessages.push(message);
      return;
    }
    if (this.socket.readyState !== WebSocket.OPEN) {
      this.pendingMessages.push(message);
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private flushPending(ws: WebSocket): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (this.pendingMessages.length === 0) return;

    const messages = this.pendingMessages;
    this.pendingMessages = [];
    for (const message of messages) {
      ws.send(JSON.stringify(message));
    }
  }

  private parseServerMessage(data: unknown): ServerMessage | null {
    const text = this.normalizeData(data);
    if (!text) return null;

    try {
      return JSON.parse(text) as ServerMessage;
    } catch {
      return null;
    }
  }

  private normalizeData(data: unknown): string | null {
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
    if (data instanceof Uint8Array) return new TextDecoder().decode(data);
    return null;
  }
}
