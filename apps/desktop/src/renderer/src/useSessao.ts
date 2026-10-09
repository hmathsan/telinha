import { useCallback, useEffect, useReducer, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AppToSignalerMessage, SignalerToAppMessage } from "@scrn-broadcast/protocol";
import { initialClientSessaoState, sessaoReducer } from "../../shared/clientSessaoState.js";
import type { ConnectAction, SignalingConnectionState } from "../../shared/ipc.js";
import type { SomStatus } from "../../shared/media/somCapture.js";
import { MeshManager, type ConnectionDiagnostics, type MeshManagerHandlers } from "./media/meshManager.js";
import { captureFonte } from "./media/capture.js";
import { logToMain } from "./log.js";

export interface QualityWarning {
  readonly id: string;
  readonly text: string;
}

function deleteKey<T>(prev: Map<string, T>, key: string): Map<string, T> {
  if (!prev.has(key)) return prev;
  const next = new Map(prev);
  next.delete(key);
  return next;
}

function buildHandlers(
  setRemoteStreams: Dispatch<SetStateAction<Map<string, MediaStream>>>,
  setSomStates: Dispatch<SetStateAction<Map<string, boolean>>>,
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
      setRemoteStreams((prev) => deleteKey(prev, transmissorId));
      setSomStates((prev) => deleteKey(prev, transmissorId));
    },
    onSomState: (transmissorId, ativo) => {
      setSomStates((prev) => new Map(prev).set(transmissorId, ativo));
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
  /** O Som da última captura (spec 0009). Quem consome é a 0010. `null` sem captura. */
  const [somStatus, setSomStatus] = useState<SomStatus | null>(null);
  /** Silenciado pela barra (spec 0010). Volta a ativo a cada transmissão nova. */
  const [somAtivo, setSomAtivoState] = useState(true);
  /** O último `som-state` de cada Transmissor remoto. Ausente = nada recebido. */
  const [somStates, setSomStates] = useState<Map<string, boolean>>(new Map());

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
    () => new MeshManager(buildHandlers(setRemoteStreams, setSomStates, setDiagnostics, setWarnings)),
    [],
  );

  useEffect(() => {
    /** `transmissores-changed` e a parte equivalente do `resumed`. Lê `stateRef` antes do dispatch. */
    function applyTransmissores(mesh: MeshManager, participanteIds: readonly string[]): void {
      const myId = stateRef.current.myId;
      const wasTransmitting = myId ? stateRef.current.transmissores.includes(myId) : false;
      const isTransmittingNow = myId ? participanteIds.includes(myId) : false;
      mesh.handleTransmissoresChanged(participanteIds);

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
    }

    function routeToMesh(message: SignalerToAppMessage): void {
      const mesh = meshRef.current;
      if (!mesh) return;

      switch (message.type) {
        case "sessao-created":
          mesh.setMyId(message.participanteId);
          previousMyIdRef.current = message.participanteId;
          break;

        case "entry-approved": {
          // participanteId diferente do anterior == voltamos com identidade nova. A Retomada
          // (spec 0011) evita isso, e o `rejoining` já descarta a malha; isto fica como rede de
          // segurança: a malha anterior estaria órfã, e é descartada.
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
            setSomStates(new Map());
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

        case "resumed": {
          // Retomada (spec 0011): a malha não é refeita, só alinhada ao roster que mudou enquanto
          // estávamos caídos. `handleParticipanteJoined` não é idempotente — chamá-lo para quem
          // já estava criaria uma segunda conexão —, então só vai para quem é novo.
          const previous = new Set(stateRef.current.roster.map((p) => p.id));
          const current = new Set(message.roster.map((p) => p.id));
          for (const id of previous) {
            if (!current.has(id)) mesh.handleParticipanteLeft(id);
          }
          for (const id of current) {
            if (!previous.has(id) && id !== message.participanteId) mesh.handleParticipanteJoined(id);
          }
          applyTransmissores(mesh, message.transmissores);
          break;
        }

        case "transmissores-changed":
          applyTransmissores(mesh, message.participanteIds);
          break;

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
      if (connectionState.status === "rejoining") {
        // A Retomada não aconteceu: quem éramos saiu da Sessão, e o pedido de entrada novo já foi
        // (spec 0011). A malha falava por aquele `participanteId`; uma nova espera a aprovação.
        meshRef.current?.close();
        meshRef.current = createMesh();
        previousMyIdRef.current = null;
        unwatchLocalTrack();
        setIsTransmitting(false);
        setLocalStream(null);
        setRemoteStreams(new Map());
        setSomStates(new Map());
        dispatch({
          source: "connect-attempt",
          connectAction: { kind: "join", name: connectionState.name, codigoDeSessao: connectionState.codigoDeSessao },
        });
      }
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
        setSomStates(new Map());
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
      const capture = await captureFonte();
      stream = capture.stream;
      setSomStatus(capture.som);
      setSomAtivoState(true);
      // O Som parar não é a Fonte parar, mas conta como encerrado para o botão e para `som-state`.
      capture.stream.getAudioTracks()[0]?.addEventListener(
        "ended",
        // `track.stop()` não dispara `ended`: parar ou trocar de Fonte pelo app não passa por aqui.
        () => {
          setSomStatus({ ativo: false, reason: "capture-ended" });
          meshRef.current?.handleSomEnded();
        },
        { once: true },
      );
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

  const setSomAtivo = useCallback((ativo: boolean) => {
    meshRef.current?.setSomAtivo(ativo);
    setSomAtivoState(ativo);
  }, []);

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
    setSomStates(new Map());
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
    // Sem captura em curso não há Som a relatar, e todo caminho que encerra a captura zera `localStream`.
    somStatus: localStream ? somStatus : null,
    somAtivo,
    somStates,
    setSomAtivo,
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
