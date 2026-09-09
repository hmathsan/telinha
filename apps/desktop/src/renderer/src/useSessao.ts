import { useCallback, useEffect, useReducer, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AppToSignalerMessage, SignalerToAppMessage } from "@scrn-broadcast/protocol";
import { initialClientSessaoState, sessaoReducer } from "../../shared/clientSessaoState.js";
import type { ConnectAction, SignalingConnectionState } from "../../shared/ipc.js";
import { MeshManager, type ConnectionDiagnostics, type MeshManagerHandlers } from "./media/meshManager.js";
import { captureFonte } from "./media/capture.js";
import { logToMain } from "./log.js";

export interface QualityWarning {
  readonly id: string;
  readonly text: string;
}

function buildHandlers(
  setRemoteStreams: Dispatch<SetStateAction<Map<string, MediaStream>>>,
  setDiagnostics: Dispatch<SetStateAction<readonly ConnectionDiagnostics[]>>,
  setWarnings: Dispatch<SetStateAction<QualityWarning[]>>,
): MeshManagerHandlers {
  return {
    sendSignal: (toParticipanteId, payload) => {
      window.scrnBroadcast.send({ type: "signal", toParticipanteId, payload });
    },
    onRemoteStream: (transmissorId, stream) => {
      setRemoteStreams((prev) => new Map(prev).set(transmissorId, stream));
    },
    onRemoteStreamEnded: (transmissorId) => {
      setRemoteStreams((prev) => {
        if (!prev.has(transmissorId)) return prev;
        const next = new Map(prev);
        next.delete(transmissorId);
        return next;
      });
    },
    onDiagnostics: (snapshots) => setDiagnostics(snapshots),
    onEncoderFallback: (key) => {
      logToMain("warn", "encoder-fallback-to-software", { key });
      setWarnings((prev) => [
        ...prev,
        {
          id: `${key}:${Date.now()}`,
          text: "O encoder de vídeo caiu para software nesta conexão — o teto de encoders de hardware da GPU provavelmente estourou (feche outros programas que gravam ou transmitem tela).",
        },
      ]);
    },
  };
}

/**
 * Une o reducer de estado da Sessão (`clientSessaoState.ts`) com a malha de mídia (`MeshManager`)
 * e o IPC do preload. É o único lugar em `renderer` que decide QUANDO abrir/fechar conexões —
 * o MeshManager só sabe COMO.
 */
export function useSessao() {
  const [state, dispatch] = useReducer(sessaoReducer, initialClientSessaoState);
  const [connectionState, setConnectionState] = useState<SignalingConnectionState>({
    status: "closed",
    reason: "not-connected",
  });
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [diagnostics, setDiagnostics] = useState<readonly ConnectionDiagnostics[]>([]);
  const [warnings, setWarnings] = useState<QualityWarning[]>([]);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const pendingStreamRef = useRef<MediaStream | null>(null);
  /** Remove o listener de `ended` do track capturado; `null` quando não há captura em curso. */
  const localTrackWatchRef = useRef<(() => void) | null>(null);
  const previousMyIdRef = useRef<string | null>(null);
  const meshRef = useRef<MeshManager | null>(null);

  const send = useCallback((message: AppToSignalerMessage) => window.scrnBroadcast.send(message), []);

  const unwatchLocalTrack = useCallback(() => {
    localTrackWatchRef.current?.();
    localTrackWatchRef.current = null;
  }, []);

  /**
   * A pessoa também pode parar pela barra nativa do Chromium, ou fechando a janela que escolheu
   * como Fonte. Sem escutar `ended`, ela continuava em `transmissores` com o Palco congelado para
   * todo mundo, e ninguém — nem ela — tinha como tirar. `track.stop()` não dispara `ended`, então
   * parar pelo botão do app não passa por aqui.
   */
  const watchLocalTrack = useCallback(
    (stream: MediaStream) => {
      unwatchLocalTrack();
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      const onEnded = (): void => {
        localTrackWatchRef.current = null;
        send({ type: "release-palco" });
      };
      track.addEventListener("ended", onEnded);
      localTrackWatchRef.current = () => track.removeEventListener("ended", onEnded);
    },
    [send, unwatchLocalTrack],
  );

  // Uma malha nova a cada conexão (não só na primeira): reaproveitar a instância anterior depois
  // de `close()` deixaria o timer de diagnóstico morto para a próxima Sessão — `close()` para
  // valer só na saída/desmontagem, então "conectar de novo" precisa de um objeto novo.
  const createMesh = useCallback(
    () => new MeshManager(buildHandlers(setRemoteStreams, setDiagnostics, setWarnings)),
    [],
  );

  useEffect(() => {
    function routeToMesh(message: SignalerToAppMessage): void {
      const mesh = meshRef.current;
      if (!mesh) return;

      switch (message.type) {
        case "sessao-created":
          mesh.setMyId(message.participanteId);
          previousMyIdRef.current = message.participanteId;
          break;

        case "entry-approved": {
          // participanteId diferente do anterior == reconexão com identidade nova (spec 0003,
          // "Reconexão"): o sinalizador atual não tem como preservar a identidade através de uma
          // queda de WebSocket, então a malha anterior fica órfã e é descartada.
          let currentMesh = mesh;
          if (previousMyIdRef.current && previousMyIdRef.current !== message.participanteId) {
            logToMain("warn", "identity-changed-on-reconnect", {
              previous: previousMyIdRef.current,
              current: message.participanteId,
            });
            currentMesh.close();
            currentMesh = createMesh();
            currentMesh.setIceServers(stateRef.current.iceServers);
            meshRef.current = currentMesh;
            setIsTransmitting(false);
            setRemoteStreams(new Map());
          }
          currentMesh.setMyId(message.participanteId);
          previousMyIdRef.current = message.participanteId;
          break;
        }

        case "ice-servers":
          mesh.setIceServers(message.iceServers);
          break;

        case "participante-joined":
          mesh.handleParticipanteJoined(message.participante.id);
          break;

        case "participante-left":
          mesh.handleParticipanteLeft(message.participanteId);
          break;

        case "transmissores-changed": {
          const myId = stateRef.current.myId;
          const wasTransmitting = myId ? stateRef.current.transmissores.includes(myId) : false;
          const isTransmittingNow = myId ? message.participanteIds.includes(myId) : false;
          mesh.handleTransmissoresChanged(message.participanteIds);

          if (isTransmittingNow && !wasTransmitting && pendingStreamRef.current) {
            const stream = pendingStreamRef.current;
            pendingStreamRef.current = null;
            const espectadorIds = stateRef.current.roster.map((p) => p.id).filter((id) => id !== myId);
            mesh.startTransmitting(stream, espectadorIds);
            setIsTransmitting(true);
          } else if (!isTransmittingNow && wasTransmitting) {
            mesh.stopTransmitting();
            unwatchLocalTrack();
            setIsTransmitting(false);
            setLocalStream(null);
          }
          break;
        }

        case "palco-denied":
          if (pendingStreamRef.current) {
            unwatchLocalTrack();
            for (const track of pendingStreamRef.current.getTracks()) track.stop();
            pendingStreamRef.current = null;
            setLocalStream(null);
          }
          break;

        case "signal":
          mesh.handleSignal(message.fromParticipanteId, message.payload);
          break;
      }
    }

    const offMessage = window.scrnBroadcast.onMessage((message) => {
      dispatch({ source: "signaler", message });
      routeToMesh(message);
    });
    const offState = window.scrnBroadcast.onConnectionState((connectionState) => {
      setConnectionState(connectionState);
      if (connectionState.status === "closed") {
        logToMain("error", "signaling-closed", { reason: connectionState.reason });
        // O Durable Object fecha o WebSocket sem mensagem alguma ao expulsar ou ao encerrar uma
        // Sessão já terminada (durableObject.ts: safeClose) — sem isto, o app expulso ficava
        // parado na última tela, sem saber por quê, até clicar em "Sair" manualmente.
        meshRef.current?.close();
        unwatchLocalTrack();
        setIsTransmitting(false);
        setLocalStream(null);
        setRemoteStreams(new Map());
        dispatch({ source: "connection-terminated", reason: connectionState.reason });
      }
    });
    return () => {
      offMessage();
      offState();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      meshRef.current?.close();
      localTrackWatchRef.current?.();
    };
  }, []);

  const connect = useCallback(
    (action: ConnectAction) => {
      meshRef.current?.close();
      meshRef.current = createMesh();
      previousMyIdRef.current = null;
      dispatch({ source: "connect-attempt", connectAction: action });
      window.scrnBroadcast.connect(action);
    },
    [createMesh],
  );

  const respondEntry = useCallback(
    (participanteId: string, approved: boolean) => {
      send({ type: "respond-entry", participanteId, approved });
      dispatch({ source: "respond-entry", participanteId });
    },
    [send],
  );

  const startTransmitindo = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await captureFonte();
    } catch (error) {
      // Cancelar no seletor e ter a captura recusada chegam aqui iguais; o log é o que distingue.
      logToMain("info", "capture-fonte-aborted", { message: String(error) });
      return;
    }
    pendingStreamRef.current = stream;
    setLocalStream(stream);
    watchLocalTrack(stream);
    send({ type: "request-palco" });
  }, [send, watchLocalTrack]);

  const releasePalco = useCallback(() => send({ type: "release-palco" }), [send]);
  const expel = useCallback((participanteId: string) => send({ type: "expel", participanteId }), [send]);

  const leave = useCallback(() => {
    meshRef.current?.close();
    unwatchLocalTrack();
    window.scrnBroadcast.leave();
    dispatch({ source: "reset" });
    setIsTransmitting(false);
    setLocalStream(null);
    setRemoteStreams(new Map());
    setDiagnostics([]);
  }, [unwatchLocalTrack]);

  const dismissWarning = useCallback((id: string) => {
    setWarnings((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const exportDiagnostics = useCallback(async () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      codigoDeSessao: state.codigoDeSessao,
      myId: state.myId,
      connections: diagnostics,
    };
    const result = await window.scrnBroadcast.exportDiagnostics({
      suggestedFileName: `scrn-broadcast-diagnostico-${Date.now()}.json`,
      content: JSON.stringify(payload, null, 2),
    });
    // Falhar em silêncio era o comportamento anterior: o botão não fazia nada e ninguém sabia
    // que o disco tinha recusado. O canal de avisos já está na frente da pessoa.
    if (result.error) {
      setWarnings((prev) => [
        ...prev,
        { id: `export:${Date.now()}`, text: `Não foi possível salvar o diagnóstico: ${result.error}` },
      ]);
    }
    return result;
  }, [state.codigoDeSessao, state.myId, diagnostics]);

  return {
    state,
    connectionState,
    remoteStreams,
    diagnostics,
    warnings,
    isTransmitting,
    localStream,
    connect,
    respondEntry,
    startTransmitindo,
    releasePalco,
    expel,
    leave,
    dismissWarning,
    exportDiagnostics,
  };
}
