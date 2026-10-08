import { buildEncodingParameters, MAX_BITRATE_BPS, MAX_SOM_BITRATE_BPS } from "../../../shared/media/bitrate.js";
import { withOpusStereo } from "../../../shared/media/opusStereo.js";
import { SomSilenceTracker } from "../../../shared/media/somSilence.js";
import { preferH264 } from "../../../shared/media/codecPreference.js";
import { DiagnosticsSampler, didFallBackToSoftwareEncoder, type ConnectionDiagnosticsSnapshot } from "../../../shared/media/diagnostics.js";
import {
  connectionKey,
  parseMeshSignal,
  type IceCandidateLike,
  type MeshSignalPayload,
  type SessionDescriptionLike,
} from "../../../shared/media/meshSignal.js";
import {
  decideIceRecoveryAction,
  escalationFor,
  isMediaStalled,
  RECOVERY_COOLDOWN_MS,
  type IceConnectionState,
  type IceRecoveryAction,
} from "../../../shared/media/reconnectionPolicy.js";
import { logToMain } from "../log.js";

const DIAGNOSTICS_INTERVAL_MS = 2000;

/**
 * Teto da fila de candidatos por perna. Um candidato que chega antes da remote description não
 * pode ser aplicado nem descartado (descartar era o bug: durante um `recreate`, a oferta nova e os
 * candidatos novos correm juntos). O teto existe para que uma chave que nunca ganha uma
 * `RTCPeerConnection` não vire vazamento.
 */
const MAX_PENDING_CANDIDATES = 50;

type Role = "transmissor" | "espectador";

/** O que provocou uma ação de recuperação — ver `mesh-ice-recovery` no log. */
type RecoveryTrigger = "ice" | "media" | "peer";

interface ManagedConnection {
  readonly pc: RTCPeerConnection;
  readonly transmissorId: string;
  readonly espectadorId: string;
  readonly role: Role;
  lastEncoderImplementation: string | null;
  /** Quando esta perna entrou em estado insalubre de ICE. `null` enquanto está saudável. */
  unhealthySince: number | null;
  /** Quantos `iceRestart` já se tentou desde a última vez que ela esteve saudável. */
  restartAttempts: number;
  /** Última ação de recuperação nesta perna, para o cooldown — inclusive as pedidas pelo par. */
  lastRecoveryAt: number;
  /** Última vez que mídia chegou de fato. Base do watchdog de mídia. */
  mediaFlowingAt: number;
  /**
   * Só do lado do Espectador: já pediu uma perna nova e está esperando a oferta que a substitui.
   * A perna velha (congelada) fica de pé até ela chegar — fechar antes deixaria a miniatura
   * sumida para sempre se o Transmissor não respondesse (cliente antigo, sinalização fora do ar),
   * e sem entrada no mapa não sobra ninguém para insistir no pedido.
   */
  awaitingReplacement: boolean;
  /**
   * Só do Transmissor: o transceiver do Som. Depois de `replaceTrack(null)` o `sender.track` é
   * `null` e não serve mais para achá-lo (spec 0010, "Botão na barra superior").
   */
  somTransceiver: RTCRtpTransceiver | null;
}

export interface ConnectionDiagnostics extends ConnectionDiagnosticsSnapshot {
  readonly connectionKey: string;
  readonly transmissorId: string;
  readonly espectadorId: string;
  readonly role: Role;
  readonly iceConnectionState: RTCIceConnectionState;
  /** Há quanto tempo esta perna está quebrada. `0` quando está saudável. */
  readonly msUnhealthy: number;
  readonly restartAttempts: number;
}

export interface MeshManagerHandlers {
  readonly sendSignal: (toParticipanteId: string, payload: MeshSignalPayload) => void;
  readonly onRemoteStream: (transmissorId: string, stream: MediaStream) => void;
  readonly onRemoteStreamEnded: (transmissorId: string) => void;
  readonly onDiagnostics: (snapshots: readonly ConnectionDiagnostics[]) => void;
  readonly onEncoderFallback: (connectionKey: string) => void;
  /** O Transmissor disse se o Som dele está ativo (`som-state`, spec 0010). */
  readonly onSomState: (transmissorId: string, ativo: boolean) => void;
}

/**
 * Uma `RTCPeerConnection` por (Transmissor, Espectador) — spec 0003, "Topologia". Glue de
 * verdade sobre WebRTC: sem teste unitário (spec 0006 trata mídia como validação manual); a
 * lógica de decisão que ela usa (relay, diagnóstico, reconexão, bitrate) vive em
 * `src/shared/media` e é testada lá.
 */
export class MeshManager {
  private myId: string | null = null;
  private iceServers: RTCIceServer[] = [];
  private localStream: MediaStream | null = null;
  private readonly connections = new Map<string, ManagedConnection>();
  private readonly pendingCandidates = new Map<string, IceCandidateLike[]>();
  private readonly sampler = new DiagnosticsSampler();
  /** Uma só: a track de áudio é a mesma em todas as conexões de saída. */
  private readonly somSilence = new SomSilenceTracker();
  private diagnosticsTimer: ReturnType<typeof setInterval> | null = null;
  /** Silenciado pela barra: os senders de áudio ficam em `replaceTrack(null)`. */
  private somAtivo = true;

  constructor(private readonly handlers: MeshManagerHandlers) {
    this.diagnosticsTimer = setInterval(() => void this.pollDiagnostics(), DIAGNOSTICS_INTERVAL_MS);
  }

  setMyId(id: string): void {
    this.myId = id;
  }

  setIceServers(iceServers: readonly RTCIceServer[]): void {
    this.iceServers = [...iceServers];
  }

  isTransmitting(): boolean {
    return this.localStream !== null;
  }

  startTransmitting(stream: MediaStream, espectadorIds: readonly string[]): void {
    this.localStream = stream;
    this.somAtivo = true;
    this.somSilence.reset();
    for (const espectadorId of espectadorIds) {
      if (espectadorId === this.myId) continue;
      this.createOutgoingConnection(espectadorId);
    }
  }

  stopTransmitting(): void {
    if (!this.myId) return;
    for (const [key, entry] of this.connections) {
      if (entry.role === "transmissor") this.closeConnection(key);
    }
    for (const track of this.localStream?.getTracks() ?? []) track.stop();
    this.localStream = null;
    this.somSilence.reset();
  }

  /**
   * Silencia ou reativa o Som sem renegociar: `replaceTrack(null)` para o encode Opus de todas as
   * pernas, e a track volta no mesmo transceiver (spec 0010).
   */
  setSomAtivo(ativo: boolean): void {
    if (ativo === this.somAtivo) return;
    this.somAtivo = ativo;
    this.somSilence.reset();
    const track = ativo ? this.liveSomTrack() : null;
    for (const [key, entry] of this.connections) {
      if (!entry.somTransceiver) continue;
      void entry.somTransceiver.sender.replaceTrack(track).catch((error: unknown) => {
        logToMain("error", "som-replace-track-failed", { key, ativo, message: String(error) });
      });
    }
    logToMain("info", "som-ativo-changed", { ativo });
    this.broadcastSomState();
  }

  /** A track de áudio terminou no meio da transmissão: o Som conta como encerrado (spec 0010). */
  handleSomEnded(): void {
    logToMain("info", "som-ended-broadcast", { espectadores: this.outgoing().length });
    this.broadcastSomState();
  }

  handleParticipanteJoined(participanteId: string): void {
    if (this.localStream) this.createOutgoingConnection(participanteId);
  }

  handleParticipanteLeft(participanteId: string): void {
    for (const [key, entry] of this.connections) {
      if (entry.transmissorId === participanteId || entry.espectadorId === participanteId) {
        this.closeConnection(key);
      }
    }
  }

  handleTransmissoresChanged(transmissorIds: readonly string[]): void {
    const incomingTransmissorIds = [...this.connections.values()]
      .filter((c) => c.role === "espectador")
      .map((c) => c.transmissorId);
    for (const transmissorId of incomingTransmissorIds) {
      if (!transmissorIds.includes(transmissorId)) {
        this.closeConnection(connectionKey(transmissorId, this.myId ?? ""));
      }
    }
  }

  handleSignal(fromParticipanteId: string, rawPayload: unknown): void {
    const parsed = parseMeshSignal(fromParticipanteId, rawPayload);
    if (!parsed.ok) {
      logToMain("warn", "mesh-signal-rejected", { fromParticipanteId, issues: parsed.issues });
      return;
    }
    const payload = parsed.payload;
    if (payload.kind === "som-state") {
      this.handlers.onSomState(payload.transmissorId, payload.ativo);
      return;
    }
    // Uma falha aqui (SDP incompatível, glare) matava a conexão sem deixar rastro: nada acontecia
    // na tela, e o log não existia para contar o contrário.
    void this.applySignal(payload).catch((error: unknown) => {
      logToMain("error", "mesh-signal-failed", { fromParticipanteId, kind: payload.kind, message: String(error) });
    });
  }

  /** Fecha tudo — saída da Sessão ou app fechando. */
  close(): void {
    if (this.diagnosticsTimer) {
      clearInterval(this.diagnosticsTimer);
      this.diagnosticsTimer = null;
    }
    for (const key of [...this.connections.keys()]) this.closeConnection(key);
    this.pendingCandidates.clear();
    for (const track of this.localStream?.getTracks() ?? []) track.stop();
    this.localStream = null;
  }

  // -------------------------------------------------------------------------

  private async applySignal(payload: Exclude<MeshSignalPayload, { kind: "som-state" }>): Promise<void> {
    const key = connectionKey(payload.transmissorId, payload.espectadorId);

    if (payload.kind === "offer") {
      let entry = this.connections.get(key);
      // A oferta que o `recreate` pediu: é aqui que a perna velha sai e a nova entra. A fila de
      // candidatos sobrevive à troca, porque os que já chegaram são desta negociação.
      if (entry?.awaitingReplacement) {
        this.closeConnection(key, { keepPendingCandidates: true });
        entry = undefined;
      }
      if (!entry) {
        entry = this.trackConnection(this.createPeerConnection(), payload.transmissorId, payload.espectadorId, "espectador");
      }
      await entry.pc.setRemoteDescription(payload.sdp);
      await this.drainPendingCandidates(key, entry);
      const answer = await entry.pc.createAnswer();
      // É a resposta que decide o estéreo: o encoder Opus do Transmissor só sai de mono se a
      // descrição remota dele pedir `stereo=1` (spec 0009, "Estéreo").
      await entry.pc.setLocalDescription({ type: answer.type, sdp: withOpusStereo(answer.sdp ?? "", MAX_SOM_BITRATE_BPS) });
      if (entry.pc.localDescription) {
        this.handlers.sendSignal(payload.transmissorId, {
          kind: "answer",
          transmissorId: payload.transmissorId,
          espectadorId: payload.espectadorId,
          sdp: entry.pc.localDescription.toJSON() as SessionDescriptionLike,
        });
      }
      return;
    }

    if (payload.kind === "answer") {
      const entry = this.connections.get(key);
      if (entry?.role === "transmissor") {
        await entry.pc.setRemoteDescription(payload.sdp);
        await this.drainPendingCandidates(key, entry);
      }
      return;
    }

    if (payload.kind === "recovery-request") {
      this.applyRecoveryRequest(key, payload.mode);
      return;
    }

    // ice-candidate
    const entry = this.connections.get(key);
    // Sem remote description o candidato não pode ser aplicado ainda, e descartá-lo é perdê-lo:
    // a fila segura até a oferta (ou a oferta nova, depois de um `recreate`) chegar.
    if (!entry || !entry.pc.remoteDescription) {
      this.bufferCandidate(key, payload.candidate);
      return;
    }
    await this.addIceCandidate(entry, payload.candidate);
  }

  /**
   * O pedido do Espectador, executado por quem pode: só o Transmissor oferta. Passa pelo mesmo
   * cooldown das ações locais, senão um Espectador oscilando metralha ofertas daqui.
   */
  private applyRecoveryRequest(key: string, mode: "ice-restart" | "recreate"): void {
    const entry = this.connections.get(key);
    if (!entry || entry.role !== "transmissor" || entry.transmissorId !== this.myId) return;
    const now = Date.now();
    if (now - entry.lastRecoveryAt < RECOVERY_COOLDOWN_MS) {
      logToMain("info", "mesh-recovery-request-ignored", { key, mode, sinceLastMs: now - entry.lastRecoveryAt });
      return;
    }
    this.runRecovery(key, entry, mode === "recreate" ? "recreate" : "restart-ice", "peer", 0, now);
  }

  private createOutgoingConnection(espectadorId: string): void {
    if (!this.myId || !this.localStream) return;
    const key = connectionKey(this.myId, espectadorId);
    if (this.connections.has(key)) return;

    const pc = this.createPeerConnection();
    const entry = this.trackConnection(pc, this.myId, espectadorId, "transmissor");

    for (const track of this.localStream.getTracks()) {
      const transceiver = pc.addTransceiver(track, { direction: "sendonly", streams: [this.localStream] });
      // `applyPreferredCodecs` usa as capacidades de vídeo e lançaria num transceiver de áudio. O
      // Som não tem preferência de codec: é Opus, e o estéreo vai no SDP.
      const isVideo = track.kind === "video";
      if (isVideo) this.applyPreferredCodecs(transceiver);
      else {
        entry.somTransceiver = transceiver;
        // Perna nova enquanto o Som está silenciado: nasce silenciada, sem renegociar depois.
        if (!this.somAtivo) {
          void transceiver.sender.replaceTrack(null).catch((error: unknown) => {
            logToMain("error", "som-replace-track-failed", { key, ativo: false, message: String(error) });
          });
        }
      }

      const sender = transceiver.sender;
      const params = sender.getParameters();
      params.encodings = buildEncodingParameters(isVideo ? MAX_BITRATE_BPS : MAX_SOM_BITRATE_BPS);
      void sender.setParameters(params).catch(() => {
        // Alguns motores exigem uma negociação completa antes de aceitar setParameters; o teto
        // de bitrate não é crítico o bastante para bloquear a conexão nesse caso raro.
      });
    }

    void this.negotiate(entry).catch((error: unknown) => {
      logToMain("error", "mesh-negotiate-failed", { key, message: String(error) });
    });
  }

  private trackConnection(
    pc: RTCPeerConnection,
    transmissorId: string,
    espectadorId: string,
    role: Role,
  ): ManagedConnection {
    const now = Date.now();
    const entry: ManagedConnection = {
      pc,
      transmissorId,
      espectadorId,
      role,
      lastEncoderImplementation: null,
      unhealthySince: null,
      restartAttempts: 0,
      lastRecoveryAt: 0,
      mediaFlowingAt: now,
      awaitingReplacement: false,
      somTransceiver: null,
    };
    this.wireConnection(entry);
    this.connections.set(connectionKey(transmissorId, espectadorId), entry);
    return entry;
  }

  private async negotiate(entry: ManagedConnection, options?: RTCOfferOptions): Promise<void> {
    const offer = await entry.pc.createOffer(options);
    // Não é a oferta que decide o estéreo (é a resposta), mas os dois lados declaram a mesma coisa.
    await entry.pc.setLocalDescription({ type: offer.type, sdp: withOpusStereo(offer.sdp ?? "", MAX_SOM_BITRATE_BPS) });
    if (!entry.pc.localDescription) return;
    this.handlers.sendSignal(entry.espectadorId, {
      kind: "offer",
      transmissorId: entry.transmissorId,
      espectadorId: entry.espectadorId,
      sdp: entry.pc.localDescription.toJSON() as SessionDescriptionLike,
    });
    // Toda oferta (primeira, `iceRestart`, `recreate`) leva o estado do Som atrás: cobre quem entra
    // depois e quem teve a perna refeita, sem estado extra (spec 0010).
    this.sendSomState(entry);
  }

  /** Só há Som a reativar enquanto a track capturada está viva. */
  private liveSomTrack(): MediaStreamTrack | null {
    const track = this.localStream?.getAudioTracks()[0];
    return track && track.readyState === "live" ? track : null;
  }

  private outgoing(): ManagedConnection[] {
    return [...this.connections.values()].filter((c) => c.role === "transmissor");
  }

  private sendSomState(entry: ManagedConnection): void {
    // Sem track de áudio na stream local não há Som a anunciar: o Espectador já vê "sem Som".
    if (!this.localStream || this.localStream.getAudioTracks().length === 0) return;
    this.handlers.sendSignal(entry.espectadorId, {
      kind: "som-state",
      transmissorId: entry.transmissorId,
      espectadorId: entry.espectadorId,
      ativo: this.somAtivo && this.liveSomTrack() !== null,
    });
  }

  private broadcastSomState(): void {
    for (const entry of this.outgoing()) this.sendSomState(entry);
  }

  private createPeerConnection(): RTCPeerConnection {
    return new RTCPeerConnection({ iceServers: this.iceServers });
  }

  /**
   * Sem isso, o Chromium tende a oferecer VP8 primeiro, cujo encoder no WebRTC dele nunca tem
   * caminho de hardware — `encoderImplementation` seria sempre `libvpx`, mascarando o teto de
   * sessões NVENC que a ADR 0002 descreve. Só faz sentido no lado que envia.
   */
  private applyPreferredCodecs(transceiver: RTCRtpTransceiver): void {
    if (typeof transceiver.setCodecPreferences !== "function") return;
    const capabilities = RTCRtpSender.getCapabilities("video");
    if (!capabilities) return;
    try {
      transceiver.setCodecPreferences(preferH264(capabilities.codecs));
    } catch {
      // Motor recusou a lista reordenada; segue com a ordem padrão dele.
    }
  }

  private wireConnection(entry: ManagedConnection): void {
    const { pc, transmissorId, espectadorId, role } = entry;
    const key = connectionKey(transmissorId, espectadorId);

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const toParticipanteId = role === "transmissor" ? espectadorId : transmissorId;
      this.handlers.sendSignal(toParticipanteId, {
        kind: "ice-candidate",
        transmissorId,
        espectadorId,
        candidate: event.candidate.toJSON(),
      });
    };

    pc.oniceconnectionstatechange = () => {
      const iceConnectionState = pc.iceConnectionState;
      const now = Date.now();
      this.syncHealth(entry, iceConnectionState, now);
      const msUnhealthy = entry.unhealthySince === null ? 0 : now - entry.unhealthySince;
      const action = decideIceRecoveryAction({
        state: iceConnectionState as IceConnectionState,
        msUnhealthy,
        restartAttempts: entry.restartAttempts,
      });
      logToMain(iceConnectionState === "failed" ? "warn" : "info", "mesh-ice-state", {
        key,
        role,
        iceConnectionState,
        action,
      });
      // `failed` não espera o próximo tique do poll. `wait` sim — quem escala o `disconnected`
      // depois do período de graça é `pollDiagnostics`, porque para isso não existe evento.
      if (action === "restart-ice" || action === "recreate") {
        this.runRecovery(key, entry, action, "ice", msUnhealthy, now);
      }
    };

    if (role === "espectador") {
      // Com Som, dispara uma vez por track, com a mesma stream. Só o fim do vídeo encerra a Fonte:
      // o Som acabar não é a Fonte acabar.
      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        this.handlers.onRemoteStream(transmissorId, stream);
        if (event.track.kind === "video") {
          event.track.addEventListener("ended", () => this.handlers.onRemoteStreamEnded(transmissorId));
        }
      };
    }
  }

  /** Mantém o relógio de insalubridade da perna. Só voltar a conectar zera o contador. */
  private syncHealth(entry: ManagedConnection, state: RTCIceConnectionState, now: number): void {
    if (state === "connected" || state === "completed") {
      entry.unhealthySince = null;
      entry.restartAttempts = 0;
      entry.awaitingReplacement = false;
      return;
    }
    if (state !== "disconnected" && state !== "failed") return;
    entry.unhealthySince ??= now;
  }

  /**
   * A escada da spec 0003. Cada degrau custa mais que o anterior: `iceRestart` preserva o
   * transceiver e o encoder; `recreate` derruba a `RTCPeerConnection` e re-gathera do zero, que é
   * o que resolve um remapeamento de NAT — e é o único recurso num deploy STUN-only, onde não há
   * relay para onde cair.
   *
   * Quem escala é sempre a ponta que enxerga o defeito, e o Espectador não oferta: ele pede. Um
   * link quebrado para sempre fica pedindo a cada `RECOVERY_COOLDOWN_MS`, o que é barato e é
   * preferível a uma miniatura morta na tela até alguém sair e voltar da Sessão.
   */
  private runRecovery(
    key: string,
    entry: ManagedConnection,
    action: Exclude<IceRecoveryAction, "none" | "wait">,
    trigger: RecoveryTrigger,
    msUnhealthy: number,
    now: number,
  ): void {
    if (now - entry.lastRecoveryAt < RECOVERY_COOLDOWN_MS) return;
    entry.lastRecoveryAt = now;
    // Dá à ação o tempo de fazer efeito antes do watchdog de mídia reclamar da mesma perna.
    entry.mediaFlowingAt = now;

    const { transmissorId, espectadorId, role } = entry;
    logToMain("warn", "mesh-ice-recovery", {
      key,
      role,
      action,
      trigger,
      msUnhealthy,
      restartAttempts: entry.restartAttempts,
    });

    if (action === "restart-ice") {
      entry.restartAttempts += 1;
      if (role === "transmissor") {
        void this.negotiate(entry, { iceRestart: true }).catch((error: unknown) => {
          logToMain("error", "mesh-ice-restart-failed", { key, role, message: String(error) });
        });
        return;
      }
      this.handlers.sendSignal(transmissorId, {
        kind: "recovery-request",
        transmissorId,
        espectadorId,
        mode: "ice-restart",
      });
      return;
    }

    // `recreate`. Quem oferta derruba e refaz na hora. Quem assiste marca a perna e pede — a
    // troca acontece no ramo `offer`, quando a oferta nova chega. Enquanto ela não chega, o
    // pedido se repete a cada `RECOVERY_COOLDOWN_MS`, porque a entrada continua no mapa.
    if (role === "transmissor") {
      this.closeConnection(key);
      this.createOutgoingConnection(espectadorId);
      // O cooldown atravessa a troca: sem isto a perna nova nasce com o relógio zerado, e um
      // pedido do par chegando logo atrás a derrubaria de novo antes de ela ter chance.
      const replacement = this.connections.get(key);
      if (replacement) replacement.lastRecoveryAt = now;
      return;
    }
    entry.awaitingReplacement = true;
    this.handlers.sendSignal(transmissorId, {
      kind: "recovery-request",
      transmissorId,
      espectadorId,
      mode: "recreate",
    });
  }

  private bufferCandidate(key: string, candidate: IceCandidateLike): void {
    const queue = this.pendingCandidates.get(key) ?? [];
    if (queue.length >= MAX_PENDING_CANDIDATES) return;
    queue.push(candidate);
    this.pendingCandidates.set(key, queue);
  }

  private async drainPendingCandidates(key: string, entry: ManagedConnection): Promise<void> {
    const queue = this.pendingCandidates.get(key);
    if (!queue) return;
    this.pendingCandidates.delete(key);
    for (const candidate of queue) await this.addIceCandidate(entry, candidate);
  }

  private async addIceCandidate(entry: ManagedConnection, candidate: IceCandidateLike): Promise<void> {
    try {
      await entry.pc.addIceCandidate(candidate);
    } catch {
      // Candidato de uma negociação anterior (ufrag velho) depois de um restart; descartável.
    }
  }

  private closeConnection(key: string, options?: { readonly keepPendingCandidates?: boolean }): void {
    const entry = this.connections.get(key);
    if (!entry) return;
    entry.pc.close();
    this.connections.delete(key);
    if (!options?.keepPendingCandidates) this.pendingCandidates.delete(key);
    this.sampler.forget(key);
    if (entry.role === "espectador") this.handlers.onRemoteStreamEnded(entry.transmissorId);
  }

  private async pollDiagnostics(): Promise<void> {
    if (this.connections.size === 0) return;
    const now = Date.now();
    const snapshots: ConnectionDiagnostics[] = [];
    const pending: { key: string; entry: ManagedConnection; action: Exclude<IceRecoveryAction, "none" | "wait">; trigger: RecoveryTrigger; msUnhealthy: number }[] = [];

    // Amostrar antes de agir: uma ação fecha e recria conexões, e mexer no mapa no meio da
    // iteração faria a perna nova ser medida no mesmo tique em que nasceu.
    for (const [key, entry] of [...this.connections]) {
      if (!this.connections.has(key)) continue;
      const stats = await entry.pc.getStats();
      const snapshot = this.sampler.sample(key, stats);
      if (didFallBackToSoftwareEncoder(entry.lastEncoderImplementation, snapshot.encoderImplementation)) {
        this.handlers.onEncoderFallback(key);
      }
      entry.lastEncoderImplementation = snapshot.encoderImplementation;

      const iceConnectionState = entry.pc.iceConnectionState;
      this.syncHealth(entry, iceConnectionState, now);
      let msUnhealthy = entry.unhealthySince === null ? 0 : now - entry.unhealthySince;
      let trigger: RecoveryTrigger = "ice";
      let action = decideIceRecoveryAction({
        state: iceConnectionState as IceConnectionState,
        msUnhealthy,
        restartAttempts: entry.restartAttempts,
      });

      // Watchdog de mídia: fluxo parado com o ICE ainda em `connected` não emite evento nenhum,
      // e era a metade do congelamento que nada enxergava. Só conta quando o ICE não tem nada a
      // dizer — o que ele já denunciou está sendo tratado acima.
      if (snapshot.inboundBitrateBps !== 0) entry.mediaFlowingAt = now;
      if (action === "none") {
        const msSinceMediaFlowing = now - entry.mediaFlowingAt;
        if (
          isMediaStalled({
            role: entry.role,
            iceConnectionState,
            inboundBitrateBps: snapshot.inboundBitrateBps,
            msSinceMediaFlowing,
          })
        ) {
          trigger = "media";
          msUnhealthy = msSinceMediaFlowing;
          action = escalationFor(entry.restartAttempts);
        }
      }

      snapshots.push({
        ...snapshot,
        connectionKey: key,
        transmissorId: entry.transmissorId,
        espectadorId: entry.espectadorId,
        role: entry.role,
        iceConnectionState,
        msUnhealthy,
        restartAttempts: entry.restartAttempts,
      });

      if (action === "restart-ice" || action === "recreate") {
        pending.push({ key, entry, action, trigger, msUnhealthy });
      }
    }

    this.handlers.onDiagnostics(snapshots);
    this.observeSomSilence(snapshots, now);
    for (const { key, entry, action, trigger, msUnhealthy } of pending) {
      if (this.connections.get(key) !== entry) continue;
      this.runRecovery(key, entry, action, trigger, msUnhealthy, now);
    }
  }

  /**
   * Silêncio prolongado na captura (ADR 0011): só log, nunca aviso. Lê a primeira conexão de saída
   * porque a track é a mesma em todas; o watchdog de mídia continua olhando só o vídeo.
   */
  private observeSomSilence(snapshots: readonly ConnectionDiagnostics[], now: number): void {
    const outgoing = snapshots.find((s) => s.role === "transmissor");
    // Silenciado de propósito não é a captura em silêncio.
    if (!outgoing || !this.somAtivo) return;
    const transition = this.somSilence.observe(outgoing.somAudioLevel, now);
    if (transition === "went-silent") {
      logToMain("info", "som-capture-silent", { silentForMs: this.somSilence.silentForMs(now) });
    } else if (transition === "sound-returned") {
      logToMain("info", "som-capture-sound-returned");
    }
  }
}
