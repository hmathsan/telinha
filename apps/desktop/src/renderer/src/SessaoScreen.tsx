import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAX_TRANSMISSORES } from "@scrn-broadcast/protocol";
import type { ClientSessaoState } from "../../shared/clientSessaoState.js";
import type { SignalingConnectionState } from "../../shared/ipc.js";
import type { SomStatus } from "../../shared/media/somCapture.js";
import { isConnectionDegraded } from "../../shared/media/connectionQuality.js";
import { selectPalcoClick, selectPalcoLayout, type ModoPalco } from "../../shared/palcoSelection.js";
import { pruneSomPorTransmissor, selectSomAudivel, toggleSomEscolha } from "../../shared/somSelection.js";
import type { ConnectionDiagnostics } from "./media/meshManager.js";
import { useVideoSurfaces } from "./media/videoSurfaces.js";
import type { QualityWarning } from "./useSessao.js";
import { DiagnosticsPanel } from "./DiagnosticsPanel.js";
import { Palco } from "./Palco.js";
import { PedidosDeEntrada } from "./PedidosDeEntrada.js";
import { ParticipantesDrawer } from "./ParticipantesDrawer.js";
import { QualityIndicator } from "./QualityIndicator.js";
import { TopBar } from "./TopBar.js";
import { IconBroadcast, IconSpeakerHigh, IconSpeakerSlash, IconWarningCircle, IconX } from "./components/icons/index.js";
import type { VideoTileSom } from "./VideoTile.js";

export interface SessaoScreenProps {
  readonly state: ClientSessaoState;
  readonly connectionState: SignalingConnectionState;
  readonly remoteStreams: ReadonlyMap<string, MediaStream>;
  readonly diagnostics: readonly ConnectionDiagnostics[];
  readonly warnings: readonly QualityWarning[];
  readonly isTransmitting: boolean;
  readonly localStream: MediaStream | null;
  readonly somStatus: SomStatus | null;
  /** Silenciado pela barra quando `false`. */
  readonly somAtivo: boolean;
  /** O último `som-state` de cada Transmissor remoto. */
  readonly somStates: ReadonlyMap<string, boolean>;
  /** Apito de Pedido de entrada silenciado pelo Anfitrião (spec 0013). */
  readonly apitoSilenciado: boolean;
  /** Faixa de atualização no app, quando houver nova versão baixando ou pronta (spec 0014). */
  readonly updateBanner?: ReactNode;
  readonly onSetSomAtivo: (ativo: boolean) => void;
  readonly onSetApitoSilenciado: (silenciado: boolean) => void;
  readonly onSetRemoteVideoPaused: (paused: boolean, reason: "hidden" | "manual") => void;
  readonly onRespondEntry: (participanteId: string, approved: boolean) => void;
  readonly onStartTransmitindo: () => void;
  readonly onReleasePalco: () => void;
  readonly onExpel: (participanteId: string) => void;
  readonly onLeave: () => void;
  readonly onDismissWarning: (id: string) => void;
  readonly onExportDiagnostics: () => void;
}

/**
 * A faixa de quando a Fonte foi sem Som contra a vontade (spec 0010). `som-off` e `windows-10` não
 * têm faixa: a pessoa já viu o alternador desligado ou desabilitado.
 */
function somFaixa(status: SomStatus | null): string | null {
  if (!status || status.ativo) return null;
  switch (status.reason) {
    case "capture-failed":
    case "pid-not-found":
      return "Não foi possível capturar o Som deste aplicativo. A Fonte está sendo transmitida sem Som.";
    case "own-app":
      return "O Telinha não transmite o próprio som. A Fonte está sendo transmitida sem Som.";
    case "own-audio-not-excluded":
      return "Não foi possível tirar o som do Telinha do Som do sistema, então a Fonte está sendo transmitida sem Som.";
    case "capture-ended":
      return "O Som deste aplicativo parou de chegar. A Fonte continua sem Som.";
    case "som-off":
    case "windows-10":
      return null;
  }
}

function connectionBanner(connectionState: SignalingConnectionState): string | null {
  switch (connectionState.status) {
    case "connecting":
      return "Conectando ao sinalizador…";
    case "reconnecting":
      return "Reconectando à Sessão…";
    case "closed":
      return "Desconectado do sinalizador.";
    case "open":
    case "rejoining":
      return null;
  }
}

/** Debounce antes de pausar o vídeo remoto ao minimizar/ocultar a janela (spec 0015, Parte 2.3). */
const HIDE_PAUSE_DELAY_MS = 2000;

export function SessaoScreen(props: SessaoScreenProps) {
  const { state, onSetRemoteVideoPaused } = props;
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [promotedId, setPromotedId] = useState<string | null>(null);
  const [modoPreferido, setModoPreferido] = useState<ModoPalco>("foco");
  /** Escolhas manuais de quem se ouve e volumes, por Transmissor. Nada vai para `localStorage` (ADR 0004). */
  const [escolhas, setEscolhas] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [volumes, setVolumes] = useState<ReadonlyMap<string, number>>(new Map());
  /** A faixa dispensada é a do `SomStatus` daquela captura; uma captura nova traz a faixa de volta. */
  const [faixaDispensada, setFaixaDispensada] = useState<SomStatus | null>(null);
  /** Prévia local oculta para economizar GPU enquanto transmite (spec 0015, Parte 2.2). */
  const [previaOculta, setPreviaOculta] = useState(false);
  /** Vídeo remoto pausado manualmente pelo Espectador (spec 0015, Parte 2.3). */
  const [manualVideoPaused, setManualVideoPaused] = useState(false);
  /** Vídeo remoto pausado automaticamente após 2 s com a janela oculta (spec 0015, Parte 2.3). */
  const [hiddenVideoPaused, setHiddenVideoPaused] = useState(false);
  const lastPauseReasonRef = useRef<"hidden" | "manual">("hidden");
  const palcoRef = useRef<HTMLDivElement | null>(null);

  const banner = connectionBanner(props.connectionState);
  const palcoOcupado = state.transmissores.length >= MAX_TRANSMISSORES;
  const hasRemoteTransmissor = state.transmissores.some((id) => id !== state.myId);

  // Ao parar de transmitir, volta a mostrar a prévia na próxima transmissão.
  useEffect(() => {
    if (!props.isTransmitting) setPreviaOculta(false);
  }, [props.isTransmitting]);

  // Se todos os Transmissores remotos pararem, desfaz a pausa manual para a próxima transmissão.
  useEffect(() => {
    if (!hasRemoteTransmissor && manualVideoPaused) {
      lastPauseReasonRef.current = "manual";
      setManualVideoPaused(false);
    }
  }, [hasRemoteTransmissor, manualVideoPaused]);

  // Pausa o vídeo remoto após 2 s contínuos em `document.hidden`; volta imediata ao ficar visível.
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    function clearHideTimer(): void {
      if (hideTimer !== null) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    function onVisibilityChange(): void {
      if (document.hidden) {
        clearHideTimer();
        hideTimer = setTimeout(() => {
          hideTimer = null;
          if (!document.hidden) return;
          lastPauseReasonRef.current = "hidden";
          setHiddenVideoPaused(true);
        }, HIDE_PAUSE_DELAY_MS);
      } else {
        clearHideTimer();
        lastPauseReasonRef.current = "hidden";
        setHiddenVideoPaused(false);
      }
    }

    if (document.hidden) onVisibilityChange();

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearHideTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const effectiveVideoPaused = manualVideoPaused || hiddenVideoPaused;
  useEffect(() => {
    onSetRemoteVideoPaused(effectiveVideoPaused, lastPauseReasonRef.current);
  }, [effectiveVideoPaused, onSetRemoteVideoPaused]);

  function toggleManualVideoPaused(): void {
    lastPauseReasonRef.current = "manual";
    setManualVideoPaused((prev) => !prev);
  }

  const streamsById = useMemo(() => {
    const map = new Map<string, MediaStream>(props.remoteStreams);
    if (props.isTransmitting && props.localStream && state.myId && !previaOculta) {
      map.set(state.myId, props.localStream);
    }
    return map;
  }, [props.remoteStreams, props.isTransmitting, props.localStream, state.myId, previaOculta]);

  // Os `<video>` vivem aqui, não dentro do Palco: o layout muda o tempo todo, o elemento não.
  const surfaceOf = useVideoSurfaces(streamsById, state.myId);

  // Todas as regras de layout — alternador, ordem das células, quem está no Palco, e a volta para
  // Foco quando um Transmissor sai da Grade — vivem fora do React (spec 0008).
  const layout = useMemo(
    () =>
      selectPalcoLayout({
        transmissorIds: state.transmissores,
        streamIds: new Set(streamsById.keys()),
        promotedId,
        modoPreferido,
      }),
    [state.transmissores, streamsById, promotedId, modoPreferido],
  );

  // Quem se ouve é decisão de `selectSomAudivel`. O efeito roda depois do commit, e todo elemento
  // nasce mudo, então nada toca antes de a regra valer — nem a própria Fonte, que ela nunca inclui.
  const audivel = useMemo(
    () =>
      selectSomAudivel({
        modo: layout.modo,
        stagedId: layout.stagedId,
        cellIds: layout.cellIds,
        myId: state.myId,
        escolhas,
      }),
    [layout.modo, layout.stagedId, layout.cellIds, state.myId, escolhas],
  );
  useEffect(() => {
    for (const id of streamsById.keys()) {
      const surface = surfaceOf(id);
      if (!surface) continue;
      surface.muted = !audivel.has(id);
      surface.volume = volumes.get(id) ?? 1;
    }
  }, [streamsById, audivel, volumes, surfaceOf]);

  // Quem para de transmitir perde escolha e volume: ao voltar, segue o Palco com volume cheio.
  useEffect(() => {
    setEscolhas((prev) => pruneSomPorTransmissor(prev, state.transmissores));
    setVolumes((prev) => pruneSomPorTransmissor(prev, state.transmissores));
  }, [state.transmissores]);

  /** Com Som: a stream tem track de áudio e o último `som-state` não disse que foi silenciado. */
  function somOf(id: string): VideoTileSom | undefined {
    if (id === state.myId) return undefined;
    const temAudio = (props.remoteStreams.get(id)?.getAudioTracks().length ?? 0) > 0;
    if (!temAudio || props.somStates.get(id) === false) return { kind: "sem-som" };
    const audivelAgora = audivel.has(id);
    return {
      kind: "com-som",
      audivel: audivelAgora,
      volume: volumes.get(id) ?? 1,
      onToggle: () => setEscolhas((prev) => toggleSomEscolha(prev, id, audivelAgora)),
      onVolume: (volume) => setVolumes((prev) => new Map(prev).set(id, volume)),
    };
  }

  const faixa = props.somStatus !== faixaDispensada ? somFaixa(props.somStatus) : null;
  const somVivo = props.somStatus?.ativo === true;

  const stagedId = layout.stagedId;
  const stagedDiagnostics =
    stagedId !== null
      ? props.diagnostics.find(
          (d) => (d.role === "espectador" && d.transmissorId === stagedId) || (d.role === "transmissor" && stagedId === state.myId),
        )
      : undefined;
  const stagedLocalTrackSettings =
    stagedId !== null && stagedId === state.myId && !stagedDiagnostics
      ? props.localStream?.getVideoTracks()[0]?.getSettings()
      : undefined;

  const frameWidth = stagedDiagnostics?.frameWidth ?? stagedLocalTrackSettings?.width ?? null;
  const frameHeight = stagedDiagnostics?.frameHeight ?? stagedLocalTrackSettings?.height ?? null;
  const framesPerSecond =
    stagedDiagnostics?.framesPerSecond ??
    (stagedLocalTrackSettings?.frameRate ? Math.round(stagedLocalTrackSettings.frameRate) : null);
  const degraded = stagedDiagnostics
    ? isConnectionDegraded({
        iceConnectionState: stagedDiagnostics.iceConnectionState,
        qualityLimitationReason: stagedDiagnostics.qualityLimitationReason,
      })
    : false;
  const relayed = props.diagnostics.some((d) => d.relay.isRelay);
  const stageMeta =
    frameWidth && frameHeight
      ? `${frameWidth}×${frameHeight}${framesPerSecond !== null ? ` · ${framesPerSecond} fps` : ""}`
      : null;

  function nameOf(id: string): string {
    if (id === state.myId) return "Você";
    return state.roster.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  }

  /** O que o clique faz é decisão de `selectPalcoClick`, não deste componente. */
  function tileClick(id: string): void {
    const next = selectPalcoClick({
      modo: layout.modo,
      alternadorVisivel: layout.alternadorVisivel,
      clickedId: id,
      stagedId: layout.stagedId,
    });
    setModoPreferido(next.modoPreferido);
    setPromotedId(next.promotedId);
  }

  function toggleFullscreen(): void {
    const el = palcoRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  }

  /**
   * Duplo clique numa célula da Grade: promove, volta para Foco e entra em tela cheia. O pedido de
   * tela cheia sai aqui, no mesmo instante do clique — adiá-lo para depois da troca de modo perde
   * a ativação do gesto, e o Chromium recusa. Sair da tela cheia devolve a pessoa ao Transmissor
   * que ela escolheu, porque `promotedId` continua onde foi posto.
   */
  function promoteToFullscreen(id: string): void {
    setPromotedId(id);
    setModoPreferido("foco");
    const el = palcoRef.current;
    if (el && !document.fullscreenElement) void el.requestFullscreen();
  }

  const transmitirButton = props.isTransmitting ? (
    <>
      {/* Só silencia e reativa um Som que existe; sem track viva, trocar a Fonte é o caminho. */}
      <button
        type="button"
        className="btn btn-secondary"
        disabled={!somVivo}
        title={somVivo ? undefined : "Escolha a Fonte de novo para transmitir com Som"}
        onClick={() => props.onSetSomAtivo(!props.somAtivo)}
      >
        {somVivo && props.somAtivo ? <IconSpeakerHigh /> : <IconSpeakerSlash />}
        {!somVivo ? "Sem Som" : props.somAtivo ? "Silenciar Som" : "Ativar Som"}
      </button>
      <button type="button" className="btn btn-secondary" onClick={props.onReleasePalco}>
        <IconBroadcast />
        Parar de transmitir
      </button>
    </>
  ) : (
    <button type="button" className="btn btn-primary" disabled={palcoOcupado} onClick={props.onStartTransmitindo}>
      <IconBroadcast />
      {palcoOcupado ? `${MAX_TRANSMISSORES}/${MAX_TRANSMISSORES} transmitindo` : "Transmitir"}
    </button>
  );

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        codigoDeSessao={state.codigoDeSessao}
        modo={layout.modo}
        alternadorVisivel={layout.alternadorVisivel}
        onModoChange={setModoPreferido}
        temEscolhaDeSom={escolhas.size > 0}
        onSomSegueOPalco={() => setEscolhas(new Map())}
        isTransmitting={props.isTransmitting}
        previaOculta={previaOculta}
        onTogglePreviaOculta={() => setPreviaOculta((v) => !v)}
        hasRemoteTransmissor={hasRemoteTransmissor}
        videoRemotoPausado={manualVideoPaused}
        onToggleVideoRemotoPausado={toggleManualVideoPaused}
        transmitirButton={transmitirButton}
        isAnfitriao={state.isAnfitriao}
        apitoSilenciado={props.apitoSilenciado}
        onToggleApitoSilenciado={() => props.onSetApitoSilenciado(!props.apitoSilenciado)}
        participantesCount={state.roster.length}
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen((v) => !v)}
        onLeave={props.onLeave}
      />

      {banner && <div className="flex-none bg-surface px-4 py-2 text-sm text-text-muted">{banner}</div>}

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          {props.updateBanner}

          {faixa && (
            <div className="faixa-warn flex-none" role="status">
              <IconWarningCircle className="faixa-warn-icon" />
              <span className="flex-1">{faixa}</span>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setFaixaDispensada(props.somStatus)}
                title="Dispensar"
              >
                <IconX label="Dispensar" />
              </button>
            </div>
          )}

          {state.isAnfitriao && (
            <PedidosDeEntrada pedidos={state.pendingEntryRequests} onRespond={props.onRespondEntry} />
          )}

          <Palco
            layout={layout}
            surfaceOf={surfaceOf}
            nameOf={nameOf}
            somOf={somOf}
            stageMeta={stageMeta}
            palcoRef={palcoRef}
            onTileClick={tileClick}
            onPromoteToFullscreen={promoteToFullscreen}
            onToggleFullscreen={toggleFullscreen}
            transmitirButton={transmitirButton}
            previaOculta={props.isTransmitting && previaOculta}
            onMostrarPrevia={() => setPreviaOculta(false)}
            videoRemotoPausado={hasRemoteTransmissor && manualVideoPaused}
            onRetomarVideo={() => {
              lastPauseReasonRef.current = "manual";
              setManualVideoPaused(false);
            }}
          />

          <QualityIndicator
            frameWidth={frameWidth}
            frameHeight={frameHeight}
            framesPerSecond={framesPerSecond}
            degraded={degraded}
            relayed={relayed}
            onClick={() => setShowDiagnostics((v) => !v)}
          />
        </main>

        {drawerOpen && (
          <ParticipantesDrawer
            roster={state.roster}
            transmissores={state.transmissores}
            myId={state.myId}
            isAnfitriao={state.isAnfitriao}
            onExpel={props.onExpel}
            onClose={() => setDrawerOpen(false)}
          />
        )}
      </div>

      {showDiagnostics && (
        <DiagnosticsPanel
          diagnostics={props.diagnostics}
          warnings={props.warnings}
          nameOf={nameOf}
          onDismissWarning={props.onDismissWarning}
          onExport={props.onExportDiagnostics}
          onClose={() => setShowDiagnostics(false)}
        />
      )}
    </div>
  );
}
