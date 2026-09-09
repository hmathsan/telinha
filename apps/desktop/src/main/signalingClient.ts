import {
  PROTOCOL_VERSION,
  signalerToAppMessageSchema,
  type AppToSignalerMessage,
  type SignalerToAppMessage,
} from "@scrn-broadcast/protocol";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { nextBackoffDelayMs } from "../shared/backoff.js";
import { log } from "./log.js";
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

function initialMessage(action: ConnectAction, joinNonce: string): AppToSignalerMessage {
  return action.kind === "create"
    ? { type: "create-sessao", name: action.name, protocolVersion: PROTOCOL_VERSION, joinNonce }
    : {
        type: "join",
        codigoDeSessao: action.codigoDeSessao,
        name: action.name,
        protocolVersion: PROTOCOL_VERSION,
        joinNonce,
      };
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
  /**
   * Uma chave de pedido por processo, reenviada em toda tentativa — inclusive nas reconexões de
   * backoff, que ganham um `participanteId` novo do sinalizador. É o que permite ao sinalizador
   * substituir o Participante anterior deste mesmo app em vez de somar um duplicado ao roster
   * (ADR 0010). Some quando o app fecha: não é identidade.
   */
  private readonly joinNonce = randomUUID();
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
    // Fechar o socket anterior é o ponto inteiro deste método. Sem isto, cada clique em "Entrar"
    // deixava uma conexão viva no sinalizador, e cada conexão viva é um `participanteId` — o
    // caminho pelo qual uma pessoa só aparecia duas vezes na lista de Participantes.
    this.discardCurrentSocket();
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
      log.info("signaling-leave");
      this.ws.send(JSON.stringify({ type: "leave" } satisfies AppToSignalerMessage));
      this.ws.close(1000, "leave");
      this.ws = null;
    } else {
      this.discardCurrentSocket();
    }
    this.lastAction = null;
  }

  /**
   * Solta o socket corrente sem passar por `handleClosed`: os handlers dele já checam
   * `this.ws !== ws` e saem, então nem o `close` que vem a seguir dispara reconexão.
   */
  private discardCurrentSocket(): void {
    const ws = this.ws;
    if (!ws) return;
    this.ws = null;
    try {
      ws.terminate();
    } catch {
      // já fechado
    }
  }

  private open(action: ConnectAction): void {
    this.handlers.onConnectionState({ status: "connecting" });
    const ws = new WebSocket(buildUrl(this.baseUrl, action));
    this.ws = ws;

    /** Todo handler é de um socket específico; um socket já descartado não fala pelo cliente. */
    const isCurrent = (): boolean => this.ws === ws;

    ws.on("open", () => {
      if (!isCurrent()) return;
      this.reconnectAttempt = 0;
      log.info("signaling-open", { kind: action.kind });
      ws.send(JSON.stringify(initialMessage(action, this.joinNonce)));
      for (const queued of this.outboundQueue.splice(0)) {
        ws.send(JSON.stringify(queued));
      }
      this.handlers.onConnectionState({ status: "open" });
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      if (!isCurrent()) return;
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw.toString());
      } catch {
        log.warn("signaling-message-not-json");
        return;
      }
      const parsed = signalerToAppMessageSchema.safeParse(parsedJson);
      if (!parsed.success) {
        // Uma mensagem descartada em silêncio aqui aparece como "não acontece nada" na UI, e é
        // exatamente assim que uma divergência de versão de protocolo se manifestaria.
        log.warn("signaling-message-rejected", { issues: parsed.error.issues });
        return;
      }
      this.handlers.onMessage(parsed.data);
    });

    ws.on("close", (code: number, reasonBuffer: Buffer) => {
      const reason = reasonBuffer.toString();
      log.info("signaling-close", { code, reason, kind: action.kind, current: isCurrent() });
      if (!isCurrent()) return;
      this.handleClosed(action, reason);
    });
    ws.on("error", (error: Error) => {
      // "close" always follows "error" for the `ws` client; the reconnect logic lives there — mas
      // o motivo real da queda só existe aqui, e é o que faltava para diagnosticar a Sessão que
      // terminou sozinha.
      log.error("signaling-error", { message: error.message, current: isCurrent() });
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
    log.info("signaling-reconnect-scheduled", { attempt, delayMs });
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
