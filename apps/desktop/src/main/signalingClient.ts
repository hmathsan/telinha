import {
  PROTOCOL_VERSION,
  RETOMADA_TIMEOUT_MS,
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

/** Para onde a Retomada volta, guardado ao entrar na Sessão (spec 0011). */
interface ResumeTarget {
  readonly codigoDeSessao: string;
  readonly participanteId: string;
  readonly isAnfitriao: boolean;
}

function buildUrl(baseUrl: string, action: ConnectAction, resumeTarget: ResumeTarget | null): string {
  const codigoDeSessao = resumeTarget?.codigoDeSessao ?? (action.kind === "join" ? action.codigoDeSessao : null);
  if (codigoDeSessao === null) return new URL("/sessao/create", baseUrl).toString();
  const url = new URL("/sessao/join", baseUrl);
  url.searchParams.set("codigoDeSessao", codigoDeSessao);
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
 * o alvo real da Retomada (spec 0011) e da camada 2 de reconexão (spec 0003).
 */
const TERMINAL_CLOSE_REASONS = new Set([
  "removido-da-sessao",
  "sessao-encerrada",
  "incompatible-version",
  "invalid-code",
]);

/** Uma resposta 4xx ao upgrade que não seja `429` não melhora tentando de novo (spec 0011, fase 0). */
function isTerminalHttpStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

/**
 * Cliente WebSocket do processo principal (spec 0002, "Configuração"). Depois de entrar na Sessão,
 * qualquer queda — a do Anfitrião inclusive — reconecta com backoff mandando `resume` (spec 0011,
 * Retomada). Antes disso, só o `join` reconecta (spec 0003, "Reconexão", camada 2): um `create`
 * que caiu antes do `sessao-created` não tem o que retomar, e é reportado como `closed`.
 */
export class SignalingClient {
  /**
   * Uma chave de pedido por processo, reenviada em toda tentativa. No `join`, permite ao
   * sinalizador substituir o pedido anterior deste mesmo app (ADR 0010); no `resume`, é a prova de
   * que quem volta é quem caiu (ADR 0012). Some quando o app fecha: fechar o app é Sair.
   */
  private readonly joinNonce = randomUUID();
  private ws: WebSocket | null = null;
  private lastAction: ConnectAction | null = null;
  private deliberateClose = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly outboundQueue: AppToSignalerMessage[] = [];
  private resumeTarget: ResumeTarget | null = null;
  /** Primeira queda desde o último `resumed`; o prazo local da Retomada conta daqui. */
  private fellAt: number | null = null;
  /** `resume` enviado, `resumed` ainda não: a fila de saída espera, nunca vai antes. */
  private awaitingResumed = false;

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
    this.resumeTarget = null;
    this.fellAt = null;
    this.open(action);
  }

  send(message: AppToSignalerMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN && !this.awaitingResumed) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.outboundQueue.push(message);
    }
  }

  /**
   * Sem socket aberto (caído), não há como levar o `leave`: a Sessão só acaba para os outros
   * quando o prazo da Retomada vence no sinalizador. Aceito pela spec 0011.
   */
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
    this.resumeTarget = null;
    this.fellAt = null;
    this.awaitingResumed = false;
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
    const resumeTarget = this.resumeTarget;
    // Durante a Retomada a faixa de `reconnecting` fica até o `resumed`.
    if (!resumeTarget) this.handlers.onConnectionState({ status: "connecting" });
    const ws = new WebSocket(buildUrl(this.baseUrl, action, resumeTarget));
    this.ws = ws;
    this.awaitingResumed = false;
    let rejectedStatus: number | null = null;

    /** Todo handler é de um socket específico; um socket já descartado não fala pelo cliente. */
    const isCurrent = (): boolean => this.ws === ws;

    ws.on("unexpected-response", (_request, response) => {
      rejectedStatus = response.statusCode ?? null;
      log.warn("signaling-unexpected-response", { status: rejectedStatus, kind: action.kind, current: isCurrent() });
      ws.terminate(); // emite `error` e `close`; quem decide o que fazer é o handler de `close`
    });

    ws.on("open", () => {
      if (!isCurrent()) return;
      log.info("signaling-open", { kind: action.kind, resuming: resumeTarget !== null });
      if (resumeTarget) {
        this.awaitingResumed = true;
        log.info("signaling-resume-sent", { attempt: this.reconnectAttempt, msSinceFall: this.msSinceFall() });
        ws.send(
          JSON.stringify({
            type: "resume",
            codigoDeSessao: resumeTarget.codigoDeSessao,
            participanteId: resumeTarget.participanteId,
            joinNonce: this.joinNonce,
            protocolVersion: PROTOCOL_VERSION,
          } satisfies AppToSignalerMessage),
        );
        return;
      }
      this.reconnectAttempt = 0;
      ws.send(JSON.stringify(initialMessage(action, this.joinNonce)));
      this.flushOutboundQueue(ws);
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
      const message = parsed.data;
      if (message.type === "resume-refused") {
        log.warn("signaling-resume-refused", {
          reason: message.reason,
          isAnfitriao: this.resumeTarget?.isAnfitriao ?? null,
        });
        this.giveUpResume(ws);
        return;
      }
      this.observe(action, ws, message);
      this.handlers.onMessage(message);
    });

    ws.on("close", (code: number, reasonBuffer: Buffer) => {
      const reason = reasonBuffer.toString();
      log.info("signaling-close", { code, reason, kind: action.kind, current: isCurrent() });
      if (!isCurrent()) return;
      if (rejectedStatus !== null && isTerminalHttpStatus(rejectedStatus)) {
        // Um 404 reconectava para sempre (log de 09/09/2026): o sinalizador não vai mudar de ideia.
        this.ws = null;
        this.resumeTarget = null;
        log.error("signaling-rejected", { status: rejectedStatus, kind: action.kind });
        this.handlers.onConnectionState({ status: "closed", reason: "signaler-rejected" });
        return;
      }
      this.handleClosed(action, reason);
    });
    ws.on("error", (error: Error) => {
      // "close" always follows "error" for the `ws` client; the reconnect logic lives there — mas
      // o motivo real da queda só existe aqui, e é o que faltava para diagnosticar a Sessão que
      // terminou sozinha.
      log.error("signaling-error", { message: error.message, current: isCurrent() });
    });
  }

  /** Guarda o alvo da Retomada ao entrar na Sessão, e solta a fila quando a Retomada se confirma. */
  private observe(action: ConnectAction, ws: WebSocket, message: SignalerToAppMessage): void {
    switch (message.type) {
      case "sessao-created":
        this.resumeTarget = {
          codigoDeSessao: message.codigoDeSessao,
          participanteId: message.participanteId,
          isAnfitriao: true,
        };
        break;
      case "entry-approved":
        if (action.kind === "join") {
          this.resumeTarget = {
            codigoDeSessao: action.codigoDeSessao,
            participanteId: message.participanteId,
            isAnfitriao: false,
          };
        }
        break;
      case "resumed":
        log.info("signaling-resumed", { msSinceFall: this.msSinceFall() });
        this.fellAt = null;
        this.reconnectAttempt = 0;
        this.awaitingResumed = false;
        this.flushOutboundQueue(ws);
        this.handlers.onConnectionState({ status: "open" });
        break;
    }
  }

  /**
   * A Retomada não vai acontecer. O Anfitrião volta à Entrada; o Espectador vira um pedido de
   * entrada com o mesmo nome e Código, na conexão aberta (`ws`) ou na próxima tentativa.
   */
  private giveUpResume(ws: WebSocket | null): void {
    const target = this.resumeTarget;
    const action = this.lastAction;
    this.resumeTarget = null;
    this.fellAt = null;
    this.awaitingResumed = false;
    this.outboundQueue.length = 0; // falava pelo `participanteId` que deixou de existir
    if (!target || target.isAnfitriao || action?.kind !== "join") {
      this.deliberateClose = true;
      this.clearReconnectTimer();
      this.discardCurrentSocket();
      this.handlers.onConnectionState({ status: "closed", reason: "anfitriao-connection-lost" });
      return;
    }
    this.handlers.onConnectionState({ status: "rejoining", codigoDeSessao: action.codigoDeSessao, name: action.name });
    if (ws?.readyState === WebSocket.OPEN) {
      this.reconnectAttempt = 0;
      ws.send(JSON.stringify(initialMessage(action, this.joinNonce)));
      this.handlers.onConnectionState({ status: "open" });
    }
  }

  private msSinceFall(): number | null {
    return this.fellAt === null ? null : Date.now() - this.fellAt;
  }

  private flushOutboundQueue(ws: WebSocket): void {
    for (const queued of this.outboundQueue.splice(0)) {
      ws.send(JSON.stringify(queued));
    }
  }

  private handleClosed(action: ConnectAction, reason: string): void {
    if (this.ws) this.ws = null;
    this.awaitingResumed = false;
    if (this.deliberateClose) {
      return;
    }
    if (TERMINAL_CLOSE_REASONS.has(reason)) {
      this.resumeTarget = null;
      this.handlers.onConnectionState({ status: "closed", reason });
      return;
    }
    if (this.resumeTarget) {
      this.fellAt ??= Date.now();
    } else if (action.kind === "create") {
      this.handlers.onConnectionState({ status: "closed", reason: reason || "anfitriao-connection-lost" });
      return;
    }

    const attempt = this.reconnectAttempt;
    const delayMs = nextBackoffDelayMs(attempt);
    this.reconnectAttempt += 1;
    log.info("signaling-reconnect-scheduled", { attempt, delayMs, resuming: this.resumeTarget !== null });
    this.handlers.onConnectionState({ status: "reconnecting", attempt, delayMs });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.deliberateClose) return;
      const msSinceFall = this.msSinceFall();
      if (this.resumeTarget && msSinceFall !== null && msSinceFall > RETOMADA_TIMEOUT_MS) {
        log.warn("signaling-resume-expired", { msSinceFall, isAnfitriao: this.resumeTarget.isAnfitriao });
        this.giveUpResume(null);
        if (this.deliberateClose) return; // o Anfitrião desistiu; o Espectador segue com `join`
      }
      this.open(action);
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
