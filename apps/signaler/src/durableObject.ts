import { DurableObject } from "cloudflare:workers";
import {
  appToSignalerMessageSchema,
  createSessao,
  nextRetomadaDeadline,
  PROTOCOL_VERSION,
  processFall,
  processMessage,
  processResume,
  processRetomadaDeadlines,
  type Effect,
  type InternalParticipante,
  type Resume,
  type SessaoState,
  type SignalerToAppMessage,
  type TransitionResult,
} from "@scrn-broadcast/protocol";
import type { Env } from "./env.js";
import { buildIceServers } from "./turn.js";

/**
 * O attachment só diz de qual `participanteId` é cada socket (spec 0011). A Sessão inteira vive no
 * storage, na chave `SESSAO_KEY`: hibernação e reinício descartam campos de instância, e um
 * reinício também derruba os sockets — guardar a Sessão só nos attachments a destruía a cada queda
 * da borda (ADR 0012). Antes de entrar na Sessão, o `participanteId` é um id aleatório da conexão.
 */
interface ConnectionAttachment {
  readonly participanteId: string;
  readonly codigoDeSessao: string;
}

interface StoredSessao extends Omit<SessaoState, "participantes"> {
  readonly participantes: readonly InternalParticipante[];
}

const SESSAO_KEY = "sessao";
const EMPTY_SESSAO_TIMEOUT_MS = 60_000;
/** A vigia: encerra a Sessão de um objeto que reiniciou e para o qual ninguém voltou. */
const VIGIA_INTERVAL_MS = 5 * 60_000;
const WS_OPEN = 1;

function attachmentOf(ws: WebSocket): ConnectionAttachment | null {
  return (ws.deserializeAttachment() as ConnectionAttachment | null) ?? null;
}

function serialize(state: SessaoState): string {
  return JSON.stringify({ ...state, participantes: [...state.participantes.values()] } satisfies StoredSessao);
}

function deserialize(stored: string): SessaoState {
  const parsed = JSON.parse(stored) as StoredSessao;
  return { ...parsed, participantes: new Map(parsed.participantes.map((p) => [p.id, p])) };
}

/** O estado como estava no storage (`stored`) e o resultado da reconciliação aplicada sobre ele. */
interface Loaded {
  readonly stored: string;
  readonly reconciled: TransitionResult;
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
    const now = Date.now();
    const loaded = await this.load(now);

    if (message.type === "create-sessao") {
      if (loaded) {
        return; // sessão já existe para este código; create-sessao só vale antes de existir
      }
      const result = createSessao({
        participanteId: attachment.participanteId,
        name: message.name,
        protocolVersion: message.protocolVersion,
        joinNonce: message.joinNonce,
        codigoDeSessao: attachment.codigoDeSessao,
      });
      if (!result.state) {
        const byId = new Map([[attachment.participanteId, ws]]);
        for (const effect of result.effects) this.deliver(byId, effect);
        this.stripAndClose(ws, 1008, "incompatible-version");
        // Nenhuma Sessão chegou a existir para este código; sem isso, nada mais a agenda a limpeza.
        await this.ctx.storage.setAlarm(now + EMPTY_SESSAO_TIMEOUT_MS);
        return;
      }
      await this.commit(now, null, this.emptyState(attachment.codigoDeSessao), result, attachment.participanteId);
      return;
    }

    if (message.type === "resume") {
      await this.handleResume(ws, attachment, message, loaded, now);
      return;
    }

    if (!loaded) {
      if (message.type === "join") {
        this.send(ws, { type: "entry-refused", reason: "invalid-code" });
      }
      this.stripAndClose(ws, 1008, "invalid-code");
      return;
    }

    const state = loaded.reconciled.state;
    const result = processMessage(state, attachment.participanteId, message);
    await this.commit(now, loaded.stored, state, concat(loaded.reconciled, result), attachment.participanteId);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const loaded = await this.load(now);
    if (!loaded) {
      if (this.ctx.getWebSockets().length === 0) {
        await this.ctx.storage.deleteAll();
      }
      return;
    }
    const result = processRetomadaDeadlines(loaded.reconciled.state, now);
    await this.commit(now, loaded.stored, loaded.reconciled.state, concat(loaded.reconciled, result), null, true);
  }

  /**
   * Cair não tira ninguém da Sessão (spec 0011): a reconciliação, que exclui o socket que está
   * fechando, é quem aplica o `processFall` dele — um `admitted` vira `fallen`, um pendente sai.
   */
  private async handleDisconnect(ws: WebSocket): Promise<void> {
    if (!attachmentOf(ws)) {
      return; // já foi descartado por nós mesmos (`stripAndClose`)
    }
    const now = Date.now();
    const loaded = await this.load(now, ws);
    if (!loaded) return;
    await this.commit(now, loaded.stored, loaded.reconciled.state, loaded.reconciled, null);
  }

  private async handleResume(
    ws: WebSocket,
    attachment: ConnectionAttachment,
    message: Resume,
    loaded: Loaded | null,
    now: number,
  ): Promise<void> {
    const connectionId = attachment.participanteId;
    if (!loaded) {
      // Sem Sessão não há o que retomar. Não fecha: o Espectador manda `join` na mesma conexão.
      this.send(ws, { type: "resume-refused", reason: "not-resumable" });
      return;
    }
    const state = loaded.reconciled.state;
    const result = processResume(state, connectionId, message, now);
    if (!result.effects.some((e) => e.message.type === "resumed")) {
      // Recusa (inclusive por versão): entregue direto ao id da conexão, sem fechar.
      for (const effect of result.effects) this.deliver(new Map([[connectionId, ws]]), effect);
      await this.commit(now, loaded.stored, state, loaded.reconciled, null);
      return;
    }

    // Antes dos efeitos: o socket antigo da mesma pessoa sai sem virar uma queda, e o novo passa a
    // falar pelo `participanteId` retomado.
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws && attachmentOf(other)?.participanteId === message.participanteId) {
        this.stripAndClose(other, 1000, "substituido-pela-retomada");
      }
    }
    ws.serializeAttachment({
      participanteId: message.participanteId,
      codigoDeSessao: attachment.codigoDeSessao,
    } satisfies ConnectionAttachment);

    await this.commit(now, loaded.stored, state, concat(loaded.reconciled, result), message.participanteId);
    // As credenciais TURN têm TTL de minutos; as da conexão anterior podem ter vencido.
    await this.sendIceServersTo(ws, message.participanteId);
  }

  /**
   * Carrega a Sessão do storage e a reconcilia com os sockets vivos: quem não tem socket aberto
   * caiu. É o que detecta um reinício do objeto, que não emite `webSocketClose`.
   */
  private async load(now: number, closing?: WebSocket): Promise<Loaded | null> {
    const stored = await this.ctx.storage.get<string>(SESSAO_KEY);
    if (stored === undefined) return null;
    const live = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === closing || ws.readyState !== WS_OPEN) continue;
      const a = attachmentOf(ws);
      if (a) live.add(a.participanteId);
    }
    let reconciled: TransitionResult = { state: deserialize(stored), effects: [] };
    for (const id of reconciled.state.participantes.keys()) {
      if (!live.has(id)) reconciled = concat(reconciled, processFall(reconciled.state, id, now));
    }
    return { stored, reconciled };
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

  /**
   * Grava (só se o estado serializado mudou — o plano gratuito limita escritas, e um `signal` nunca
   * muda nada), entrega os efeitos, fecha quem saiu e reagenda o alarme. `senderId` é quem mandou
   * a mensagem, fechado se terminou fora da Sessão (recusa de `join`); `null` quando não há.
   */
  private async commit(
    now: number,
    stored: string | null,
    oldState: SessaoState,
    result: TransitionResult,
    senderId: string | null,
    forceReschedule = false,
  ): Promise<void> {
    const { state: newState, effects } = result;
    const byId = new Map<string, WebSocket>();
    for (const ws of this.ctx.getWebSockets()) {
      const a = attachmentOf(ws);
      if (a) byId.set(a.participanteId, ws);
    }

    const serialized = newState.ended ? null : serialize(newState);
    const changed = serialized !== stored;
    if (changed) {
      if (serialized === null) {
        await this.ctx.storage.delete(SESSAO_KEY);
      } else {
        await this.ctx.storage.put(SESSAO_KEY, serialized);
      }
    }

    for (const effect of effects) {
      this.deliver(byId, effect);
    }

    for (const [id, participante] of newState.participantes) {
      const was = oldState.participantes.get(id)?.state;
      // `fallen` -> `admitted` é a Retomada, que manda as credenciais ela mesma.
      if (participante.state === "admitted" && was !== "admitted" && was !== "fallen") {
        const ws = byId.get(id);
        if (ws) await this.sendIceServersTo(ws, id);
      }
    }

    const removedIds = new Set<string>();
    for (const id of oldState.participantes.keys()) {
      if (!newState.participantes.has(id)) removedIds.add(id);
    }
    if (senderId !== null && !newState.participantes.has(senderId)) removedIds.add(senderId);
    for (const id of removedIds) {
      const ws = byId.get(id);
      if (ws) this.stripAndClose(ws, 1000, "removido-da-sessao");
    }

    if (newState.ended) {
      for (const ws of this.ctx.getWebSockets()) {
        this.safeClose(ws, 1000, "sessao-encerrada");
      }
      await this.ctx.storage.setAlarm(now + EMPTY_SESSAO_TIMEOUT_MS);
    } else if (changed || forceReschedule) {
      const deadline = nextRetomadaDeadline(newState);
      const vigia = now + VIGIA_INTERVAL_MS;
      await this.ctx.storage.setAlarm(deadline === null ? vigia : Math.min(deadline, vigia));
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

  /** Sem attachment, o `webSocketClose` que vem a seguir não é tratado como queda. */
  private stripAndClose(ws: WebSocket, code: number, reason: string): void {
    ws.serializeAttachment(null);
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

function concat(first: TransitionResult, second: TransitionResult): TransitionResult {
  return { state: second.state, effects: [...first.effects, ...second.effects] };
}
