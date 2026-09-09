import { buildEncodingParameters, MAX_BITRATE_BPS } from "../../../shared/media/bitrate.js";
import { preferH264 } from "../../../shared/media/codecPreference.js";
import { DiagnosticsSampler, didFallBackToSoftwareEncoder, type ConnectionDiagnosticsSnapshot } from "../../../shared/media/diagnostics.js";
import {
  connectionKey,
  meshSignalPayloadSchema,
  type MeshSignalPayload,
  type SessionDescriptionLike,
} from "../../../shared/media/meshSignal.js";
import { decideIceRecoveryAction, type IceConnectionState } from "../../../shared/media/reconnectionPolicy.js";
import { logToMain } from "../log.js";

const DIAGNOSTICS_INTERVAL_MS = 2000;

type Role = "transmissor" | "espectador";

interface ManagedConnection {
  readonly pc: RTCPeerConnection;
  readonly transmissorId: string;
  readonly espectadorId: string;
  readonly role: Role;
  lastEncoderImplementation: string | null;
}

export interface ConnectionDiagnostics extends ConnectionDiagnosticsSnapshot {
  readonly connectionKey: string;
  readonly transmissorId: string;
  readonly espectadorId: string;
  readonly role: Role;
  readonly iceConnectionState: RTCIceConnectionState;
}

export interface MeshManagerHandlers {
  readonly sendSignal: (toParticipanteId: string, payload: MeshSignalPayload) => void;
  readonly onRemoteStream: (transmissorId: string, stream: MediaStream) => void;
  readonly onRemoteStreamEnded: (transmissorId: string) => void;
  readonly onDiagnostics: (snapshots: readonly ConnectionDiagnostics[]) => void;
  readonly onEncoderFallback: (connectionKey: string) => void;
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
  private readonly sampler = new DiagnosticsSampler();
  private diagnosticsTimer: ReturnType<typeof setInterval> | null = null;

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
    const parsed = meshSignalPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      logToMain("warn", "mesh-signal-rejected", { fromParticipanteId, issues: parsed.error.issues });
      return;
    }
    // Uma falha aqui (SDP incompatível, glare) matava a conexão sem deixar rastro: nada acontecia
    // na tela, e o log não existia para contar o contrário.
    void this.applySignal(parsed.data).catch((error: unknown) => {
      logToMain("error", "mesh-signal-failed", { fromParticipanteId, kind: parsed.data.kind, message: String(error) });
    });
  }

  /** Fecha tudo — saída da Sessão ou app fechando. */
  close(): void {
    if (this.diagnosticsTimer) {
      clearInterval(this.diagnosticsTimer);
      this.diagnosticsTimer = null;
    }
    for (const key of [...this.connections.keys()]) this.closeConnection(key);
    for (const track of this.localStream?.getTracks() ?? []) track.stop();
    this.localStream = null;
  }

  // -------------------------------------------------------------------------

  private async applySignal(payload: MeshSignalPayload): Promise<void> {
    const key = connectionKey(payload.transmissorId, payload.espectadorId);

    if (payload.kind === "offer") {
      let entry = this.connections.get(key);
      if (!entry) {
        const pc = this.createPeerConnection();
        entry = { pc, transmissorId: payload.transmissorId, espectadorId: payload.espectadorId, role: "espectador", lastEncoderImplementation: null };
        this.wireConnection(entry);
        this.connections.set(key, entry);
      }
      await entry.pc.setRemoteDescription(payload.sdp);
      const answer = await entry.pc.createAnswer();
      await entry.pc.setLocalDescription(answer);
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
      }
      return;
    }

    // ice-candidate
    const entry = this.connections.get(key);
    if (entry) {
      try {
        await entry.pc.addIceCandidate(payload.candidate);
      } catch {
        // Pode chegar antes da remote description em corridas raras de sinalização; descartável.
      }
    }
  }

  private createOutgoingConnection(espectadorId: string): void {
    if (!this.myId || !this.localStream) return;
    const key = connectionKey(this.myId, espectadorId);
    if (this.connections.has(key)) return;

    const pc = this.createPeerConnection();
    const entry: ManagedConnection = { pc, transmissorId: this.myId, espectadorId, role: "transmissor", lastEncoderImplementation: null };
    this.wireConnection(entry);
    this.connections.set(key, entry);

    for (const track of this.localStream.getTracks()) {
      const transceiver = pc.addTransceiver(track, { direction: "sendonly", streams: [this.localStream] });
      this.applyPreferredCodecs(transceiver);

      const sender = transceiver.sender;
      const params = sender.getParameters();
      params.encodings = buildEncodingParameters(MAX_BITRATE_BPS);
      void sender.setParameters(params).catch(() => {
        // Alguns motores exigem uma negociação completa antes de aceitar setParameters; o teto
        // de bitrate não é crítico o bastante para bloquear a conexão nesse caso raro.
      });
    }

    void this.negotiate(entry).catch((error: unknown) => {
      logToMain("error", "mesh-negotiate-failed", { key, message: String(error) });
    });
  }

  private async negotiate(entry: ManagedConnection, options?: RTCOfferOptions): Promise<void> {
    const offer = await entry.pc.createOffer(options);
    await entry.pc.setLocalDescription(offer);
    if (!entry.pc.localDescription) return;
    this.handlers.sendSignal(entry.espectadorId, {
      kind: "offer",
      transmissorId: entry.transmissorId,
      espectadorId: entry.espectadorId,
      sdp: entry.pc.localDescription.toJSON() as SessionDescriptionLike,
    });
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
      const action = decideIceRecoveryAction(iceConnectionState as IceConnectionState);
      logToMain(iceConnectionState === "failed" ? "warn" : "info", "mesh-ice-state", {
        key: connectionKey(transmissorId, espectadorId),
        role,
        iceConnectionState,
        action,
      });
      // Camada 2 (spec 0003, "Reconexão"): só quem ofereceu originalmente renegocia.
      if (action === "restart-ice" && role === "transmissor") {
        void this.negotiate(entry, { iceRestart: true }).catch((error: unknown) => {
          logToMain("error", "mesh-ice-restart-failed", { role, message: String(error) });
        });
      }
    };

    if (role === "espectador") {
      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        this.handlers.onRemoteStream(transmissorId, stream);
        event.track.addEventListener("ended", () => this.handlers.onRemoteStreamEnded(transmissorId));
      };
    }
  }

  private closeConnection(key: string): void {
    const entry = this.connections.get(key);
    if (!entry) return;
    entry.pc.close();
    this.connections.delete(key);
    this.sampler.forget(key);
    if (entry.role === "espectador") this.handlers.onRemoteStreamEnded(entry.transmissorId);
  }

  private async pollDiagnostics(): Promise<void> {
    if (this.connections.size === 0) return;
    const snapshots: ConnectionDiagnostics[] = [];
    for (const [key, entry] of this.connections) {
      const stats = await entry.pc.getStats();
      const snapshot = this.sampler.sample(key, stats);
      if (didFallBackToSoftwareEncoder(entry.lastEncoderImplementation, snapshot.encoderImplementation)) {
        this.handlers.onEncoderFallback(key);
      }
      entry.lastEncoderImplementation = snapshot.encoderImplementation;
      snapshots.push({
        ...snapshot,
        connectionKey: key,
        transmissorId: entry.transmissorId,
        espectadorId: entry.espectadorId,
        role: entry.role,
        iceConnectionState: entry.pc.iceConnectionState,
      });
    }
    this.handlers.onDiagnostics(snapshots);
  }
}
