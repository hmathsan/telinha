import {
  PROTOCOL_VERSION,
  signalerToAppMessageSchema,
  type AppToSignalerMessage,
  type SignalerToAppMessage,
} from "@pvt-broadcast/protocol";
import WebSocket from "ws";
import { nextBackoffDelayMs } from "../shared/backoff.js";
import type { ConnectAction, SignalingConnectionState } from "../shared/ipc.js";

export interface SignalingClientHandlers {
  readonly onMessage: (message: SignalerToAppMessage) => void;
  readonly onConnectionState: (state: SignalingConnectionState) => void;
}

function buildUrl(baseUrl: string, action: ConnectAction): string {
  const url = new URL(action.kind === "create" ? "/sessao/create" : "/sessao/join", baseUrl);
  if (action.kind === "join") {
    url.searchParams.set("codigoDeSessao", action.codigoDeSessao);
  }
  return url.toString();
}

function initialMessage(action: ConnectAction): AppToSignalerMessage {
  return action.kind === "create"
    ? { type: "create-sessao", name: action.name, protocolVersion: PROTOCOL_VERSION }
    : { type: "join", codigoDeSessao: action.codigoDeSessao, name: action.name, protocolVersion: PROTOCOL_VERSION };
}

/**
 * Motivos com que o Durable Object fecha o WebSocket deliberadamente (ver `durableObject.ts`:
 * `safeClose`/`stripAndClose`). Reconectar depois de um destes tentaria reentrar numa Sessão que
 * já não quer este Participante, ou que já terminou — bem diferente de uma queda de rede, que é
 * o alvo real da camada 2 de reconexão (spec 0003).
 */
const TERMINAL_CLOSE_REASONS = new Set([
  "removido-da-sessao",
  "sessao-encerrada",
  "incompatible-version",
  "invalid-code",
]);

/**
 * Cliente WebSocket do processo principal (spec 0002, "Configuração"). Só o pathway `join`
 * reconecta com backoff sozinho (spec 0003, "Reconexão", camada 2) — um `create` reconectando
 * silenciosamente trocaria todo mundo de Código de Sessão sem aviso, então uma queda nesse
 * caminho é reportada como `closed` e cabe a um humano decidir criar de novo.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private lastAction: ConnectAction | null = null;
  private deliberateClose = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly outboundQueue: AppToSignalerMessage[] = [];

  constructor(
    private readonly baseUrl: string,
    private readonly handlers: SignalingClientHandlers,
  ) {}

  connect(action: ConnectAction): void {
    this.clearReconnectTimer();
    this.deliberateClose = false;
    this.reconnectAttempt = 0;
    this.lastAction = action;
    this.outboundQueue.length = 0;
    this.open(action);
  }

  send(message: AppToSignalerMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.outboundQueue.push(message);
    }
  }

  leave(): void {
    this.deliberateClose = true;
    this.clearReconnectTimer();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "leave" } satisfies AppToSignalerMessage));
      this.ws.close(1000, "leave");
    } else {
      this.ws?.terminate();
    }
    this.ws = null;
    this.lastAction = null;
  }

  private open(action: ConnectAction): void {
    this.handlers.onConnectionState({ status: "connecting" });
    const ws = new WebSocket(buildUrl(this.baseUrl, action));
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectAttempt = 0;
      ws.send(JSON.stringify(initialMessage(action)));
      for (const queued of this.outboundQueue.splice(0)) {
        ws.send(JSON.stringify(queued));
      }
      this.handlers.onConnectionState({ status: "open" });
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const parsed = signalerToAppMessageSchema.safeParse(parsedJson);
      if (parsed.success) {
        this.handlers.onMessage(parsed.data);
      }
    });

    ws.on("close", (_code: number, reasonBuffer: Buffer) => this.handleClosed(action, reasonBuffer.toString()));
    ws.on("error", () => {
      // "close" always follows "error" for the `ws` client; the reconnect logic lives there.
    });
  }

  private handleClosed(action: ConnectAction, reason: string): void {
    if (this.ws) this.ws = null;
    if (this.deliberateClose) {
      return;
    }
    if (TERMINAL_CLOSE_REASONS.has(reason)) {
      this.handlers.onConnectionState({ status: "closed", reason });
      return;
    }
    if (action.kind === "create") {
      this.handlers.onConnectionState({ status: "closed", reason: reason || "anfitriao-connection-lost" });
      return;
    }

    const attempt = this.reconnectAttempt;
    const delayMs = nextBackoffDelayMs(attempt);
    this.reconnectAttempt += 1;
    this.handlers.onConnectionState({ status: "reconnecting", attempt, delayMs });
    this.reconnectTimer = setTimeout(() => {
      if (!this.deliberateClose) this.open(action);
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
