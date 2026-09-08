import { useCallback, useEffect, useReducer, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AppToSignalerMessage, SignalerToAppMessage } from "@pvt-broadcast/protocol";
import { initialClientSessaoState, sessaoReducer } from "../../shared/clientSessaoState.js";
import type { ConnectAction, SignalingConnectionState } from "../../shared/ipc.js";
import { MeshManager, type ConnectionDiagnostics, type MeshManagerHandlers } from "./media/meshManager.js";
import { captureFonte } from "./media/capture.js";

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
      window.pvtBroadcast.send({ type: "signal", toParticipanteId, payload });
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
  const previousMyIdRef = useRef<string | null>(null);
  const meshRef = useRef<MeshManager | null>(null);

  if (!meshRef.current) {
    meshRef.current = new MeshManager(buildHandlers(setRemoteStreams, setDiagnostics, setWarnings));
  }

  const send = useCallback((message: AppToSignalerMessage) => window.pvtBroadcast.send(message), []);

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
            currentMesh.close();
            currentMesh = new MeshManager(buildHandlers(setRemoteStreams, setDiagnostics, setWarnings));
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
            setIsTransmitting(false);
            setLocalStream(null);
          }
          break;
        }

        case "palco-denied":
          if (pendingStreamRef.current) {
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

    const offMessage = window.pvtBroadcast.onMessage((message) => {
      dispatch({ source: "signaler", message });
      routeToMesh(message);
    });
    const offState = window.pvtBroadcast.onConnectionState(setConnectionState);
    return () => {
      offMessage();
      offState();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      meshRef.current?.close();
    };
  }, []);

  const connect = useCallback((action: ConnectAction) => {
    dispatch({ source: "connect-attempt", connectAction: action });
    window.pvtBroadcast.connect(action);
  }, []);

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
    } catch {
      return; // seletor de Fonte cancelado, ou getDisplayMedia recusado.
    }
    pendingStreamRef.current = stream;
    setLocalStream(stream);
    send({ type: "request-palco" });
  }, [send]);

  const releasePalco = useCallback(() => send({ type: "release-palco" }), [send]);
  const expel = useCallback((participanteId: string) => send({ type: "expel", participanteId }), [send]);

  const leave = useCallback(() => {
    meshRef.current?.close();
    window.pvtBroadcast.leave();
    dispatch({ source: "reset" });
    setIsTransmitting(false);
    setLocalStream(null);
    setRemoteStreams(new Map());
    setDiagnostics([]);
  }, []);

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
    return window.pvtBroadcast.exportDiagnostics({
      suggestedFileName: `pvt-broadcast-diagnostico-${Date.now()}.json`,
      content: JSON.stringify(payload, null, 2),
    });
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
