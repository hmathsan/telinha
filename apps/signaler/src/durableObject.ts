import { DurableObject } from "cloudflare:workers";
import {
  appToSignalerMessageSchema,
  createSessao,
  PROTOCOL_VERSION,
  processLeave,
  processMessage,
  type Effect,
  type InternalParticipante,
  type SessaoState,
  type SignalerToAppMessage,
  type TransitionResult,
} from "@scrn-broadcast/protocol";
import type { Env } from "./env.js";
import { buildIceServers } from "./turn.js";

/**
 * Per-connection state via `serializeAttachment` (spec 0002). O SessaoState inteiro nunca fica
 * num campo em memória: cada mensagem o reconstrói a partir dos attachments das conexões vivas,
 * porque hibernação descarta campos de instância mas preserva WebSockets aceitos e seus
 * attachments.
 */
interface ConnectionAttachment {
  readonly participanteId: string;
  readonly codigoDeSessao: string;
  readonly name?: string;
  readonly admissionState?: "pending-approval" | "admitted";
  readonly isAnfitriao?: boolean;
  readonly isTransmissor?: boolean;
}

const EMPTY_SESSAO_TIMEOUT_MS = 60_000;

function attachmentOf(ws: WebSocket): ConnectionAttachment | null {
  return (ws.deserializeAttachment() as ConnectionAttachment | null) ?? null;
}

export class SessaoDurableObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const codigoDeSessao = url.searchParams.get("codigoDeSessao");
    if (!codigoDeSessao) {
      return new Response("missing codigoDeSessao", { status: 400 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    const participanteId = crypto.randomUUID();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ participanteId, codigoDeSessao } satisfies ConnectionAttachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const attachment = attachmentOf(ws);
    if (!attachment) {
      return;
    }

    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return;
    }
    const parsed = appToSignalerMessageSchema.safeParse(json);
    if (!parsed.success) {
      return;
    }
    const message = parsed.data;

    const liveAttachments = this.ctx.getWebSockets().map(attachmentOf).filter((a): a is ConnectionAttachment => a !== null);
    const anfitriaoAttachment = liveAttachments.find((a) => a.isAnfitriao);

    if (message.type === "create-sessao") {
      if (anfitriaoAttachment) {
        return; // sessão já existe para este código; create-sessao só vale antes de existir
      }
      const result = createSessao({
        participanteId: attachment.participanteId,
        name: message.name,
        protocolVersion: message.protocolVersion,
        codigoDeSessao: attachment.codigoDeSessao,
      });
      if (!result.state) {
        const byId = new Map([[attachment.participanteId, ws]]);
        for (const effect of result.effects) this.deliver(byId, effect);
        this.stripAndClose(ws, attachment, 1008, "incompatible-version");
        // Nenhuma Sessão chegou a existir para este código; sem isso, nada mais a agenda a limpeza.
        await this.ctx.storage.setAlarm(Date.now() + EMPTY_SESSAO_TIMEOUT_MS);
        return;
      }
      const emptyState = this.emptyState(attachment.codigoDeSessao);
      await this.applyResult(emptyState, attachment.participanteId, {
        state: result.state,
        effects: result.effects,
      });
      return;
    }

    if (!anfitriaoAttachment) {
      if (message.type === "join") {
        this.send(ws, { type: "entry-refused", reason: "invalid-code" });
      }
      this.stripAndClose(ws, attachment, 1008, "invalid-code");
      return;
    }

    const state = this.reconstructState(liveAttachments, anfitriaoAttachment, attachment.codigoDeSessao);
    const result = processMessage(state, attachment.participanteId, message);
    await this.applyResult(state, attachment.participanteId, result);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async alarm(): Promise<void> {
    if (this.ctx.getWebSockets().length === 0) {
      await this.ctx.storage.deleteAll();
    }
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    const attachment = attachmentOf(ws);
    if (!attachment?.admissionState) {
      return; // nunca chegou a entrar na Sessão, ou já foi processado por nós mesmos
    }

    const liveAttachments = this.ctx
      .getWebSockets()
      .map(attachmentOf)
      .filter((a): a is ConnectionAttachment => a !== null);
    if (!liveAttachments.some((a) => a.participanteId === attachment.participanteId)) {
      liveAttachments.push(attachment);
    }
    const anfitriaoAttachment = liveAttachments.find((a) => a.isAnfitriao);
    if (!anfitriaoAttachment) {
      return;
    }

    const state = this.reconstructState(liveAttachments, anfitriaoAttachment, attachment.codigoDeSessao);
    const result = processLeave(state, attachment.participanteId, "disconnected");
    await this.applyResult(state, attachment.participanteId, result);
  }

  private emptyState(codigoDeSessao: string): SessaoState {
    return {
      codigoDeSessao,
      protocolVersion: PROTOCOL_VERSION,
      anfitriaoId: "",
      participantes: new Map(),
      transmissores: [],
      ended: false,
    };
  }

  private reconstructState(
    attachments: readonly ConnectionAttachment[],
    anfitriaoAttachment: ConnectionAttachment,
    codigoDeSessao: string,
  ): SessaoState {
    const participantes = new Map<string, InternalParticipante>();
    const transmissores: string[] = [];
    for (const a of attachments) {
      if (!a.admissionState) continue;
      participantes.set(a.participanteId, {
        id: a.participanteId,
        name: a.name ?? "",
        state: a.admissionState,
      });
      if (a.isTransmissor) transmissores.push(a.participanteId);
    }
    return {
      codigoDeSessao,
      protocolVersion: PROTOCOL_VERSION,
      anfitriaoId: anfitriaoAttachment.participanteId,
      participantes,
      transmissores,
      ended: false,
    };
  }

  private async applyResult(
    oldState: SessaoState,
    senderId: string,
    result: TransitionResult,
  ): Promise<void> {
    const { state: newState, effects } = result;
    const byId = new Map<string, WebSocket>();
    for (const ws of this.ctx.getWebSockets()) {
      const a = attachmentOf(ws);
      if (a) byId.set(a.participanteId, ws);
    }

    for (const [id, participante] of newState.participantes) {
      const ws = byId.get(id);
      if (!ws) continue;
      const prev = attachmentOf(ws);
      if (!prev) continue;
      ws.serializeAttachment({
        participanteId: prev.participanteId,
        codigoDeSessao: prev.codigoDeSessao,
        name: participante.name,
        admissionState: participante.state === "left" ? undefined : participante.state,
        isAnfitriao: id === newState.anfitriaoId,
        isTransmissor: newState.transmissores.includes(id),
      } satisfies ConnectionAttachment);
    }

    for (const effect of effects) {
      this.deliver(byId, effect);
    }

    for (const [id, participante] of newState.participantes) {
      const wasAdmitted = oldState.participantes.get(id)?.state === "admitted";
      if (participante.state === "admitted" && !wasAdmitted) {
        const ws = byId.get(id);
        if (ws) await this.sendIceServersTo(ws, id);
      }
    }

    const removedIds = new Set<string>();
    for (const id of oldState.participantes.keys()) {
      if (!newState.participantes.has(id)) removedIds.add(id);
    }
    if (!newState.participantes.has(senderId)) removedIds.add(senderId);

    for (const id of removedIds) {
      const ws = byId.get(id);
      if (!ws) continue;
      const prev = attachmentOf(ws);
      if (prev) {
        ws.serializeAttachment({
          participanteId: prev.participanteId,
          codigoDeSessao: prev.codigoDeSessao,
        } satisfies ConnectionAttachment);
      }
      this.safeClose(ws, 1000, "removido-da-sessao");
    }

    if (newState.ended) {
      for (const ws of this.ctx.getWebSockets()) {
        this.safeClose(ws, 1000, "sessao-encerrada");
      }
    }
    if (newState.ended || newState.participantes.size === 0) {
      await this.ctx.storage.setAlarm(Date.now() + EMPTY_SESSAO_TIMEOUT_MS);
    }
  }

  private async sendIceServersTo(ws: WebSocket, participanteId: string): Promise<void> {
    const iceServers = await buildIceServers(this.env, participanteId);
    this.send(ws, { type: "ice-servers", iceServers });
  }

  private deliver(byId: ReadonlyMap<string, WebSocket>, effect: Effect): void {
    for (const id of effect.toParticipanteIds) {
      const ws = byId.get(id);
      if (ws) this.send(ws, effect.message);
    }
  }

  private send(ws: WebSocket, message: SignalerToAppMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // socket já fechando/fechado
    }
  }

  private stripAndClose(ws: WebSocket, attachment: ConnectionAttachment, code: number, reason: string): void {
    ws.serializeAttachment({
      participanteId: attachment.participanteId,
      codigoDeSessao: attachment.codigoDeSessao,
    } satisfies ConnectionAttachment);
    this.safeClose(ws, code, reason);
  }

  private safeClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      // já fechado
    }
  }
}
