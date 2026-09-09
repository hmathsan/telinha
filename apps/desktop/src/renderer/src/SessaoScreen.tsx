import { useMemo, useRef, useState } from "react";
import { MAX_TRANSMISSORES } from "@scrn-broadcast/protocol";
import type { ClientSessaoState } from "../../shared/clientSessaoState.js";
import type { SignalingConnectionState } from "../../shared/ipc.js";
import { isConnectionDegraded } from "../../shared/media/connectionQuality.js";
import { selectPalcoClick, selectPalcoLayout, type ModoPalco } from "../../shared/palcoSelection.js";
import type { ConnectionDiagnostics } from "./media/meshManager.js";
import type { QualityWarning } from "./useSessao.js";
import { DiagnosticsPanel } from "./DiagnosticsPanel.js";
import { Palco } from "./Palco.js";
import { PedidosDeEntrada } from "./PedidosDeEntrada.js";
import { ParticipantesDrawer } from "./ParticipantesDrawer.js";
import { QualityIndicator } from "./QualityIndicator.js";
import { TopBar } from "./TopBar.js";
import { IconBroadcast } from "./components/icons/index.js";

export interface SessaoScreenProps {
  readonly state: ClientSessaoState;
  readonly connectionState: SignalingConnectionState;
  readonly remoteStreams: ReadonlyMap<string, MediaStream>;
  readonly diagnostics: readonly ConnectionDiagnostics[];
  readonly warnings: readonly QualityWarning[];
  readonly isTransmitting: boolean;
  readonly localStream: MediaStream | null;
  /** Ver `useSessao`: muda quando a captura local é desmontada, e recria as Fontes do Palco. */
  readonly mediaEpoch: number;
  readonly onRespondEntry: (participanteId: string, approved: boolean) => void;
  readonly onStartTransmitindo: () => void;
  readonly onReleasePalco: () => void;
  readonly onExpel: (participanteId: string) => void;
  readonly onLeave: () => void;
  readonly onDismissWarning: (id: string) => void;
  readonly onExportDiagnostics: () => void;
}

function connectionBanner(connectionState: SignalingConnectionState): string | null {
  switch (connectionState.status) {
    case "connecting":
      return "Conectando ao sinalizador…";
    case "reconnecting":
      return `Conexão com o sinalizador caiu — tentando de novo (tentativa ${connectionState.attempt + 1})…`;
    case "closed":
      return "Desconectado do sinalizador.";
    case "open":
      return null;
  }
}

export function SessaoScreen(props: SessaoScreenProps) {
  const { state } = props;
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [promotedId, setPromotedId] = useState<string | null>(null);
  const [modoPreferido, setModoPreferido] = useState<ModoPalco>("foco");
  const palcoRef = useRef<HTMLDivElement | null>(null);

  const banner = connectionBanner(props.connectionState);
  const palcoOcupado = state.transmissores.length >= MAX_TRANSMISSORES;

  const streamsById = useMemo(() => {
    const map = new Map<string, MediaStream>(props.remoteStreams);
    if (props.isTransmitting && props.localStream && state.myId) map.set(state.myId, props.localStream);
    return map;
  }, [props.remoteStreams, props.isTransmitting, props.localStream, state.myId]);

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
    <button type="button" className="btn btn-secondary" onClick={props.onReleasePalco}>
      <IconBroadcast />
      Parar de transmitir
    </button>
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
        transmitirButton={transmitirButton}
        participantesCount={state.roster.length}
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen((v) => !v)}
        onLeave={props.onLeave}
      />

      {banner && <div className="flex-none bg-surface px-4 py-2 text-sm text-text-muted">{banner}</div>}

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          {state.isAnfitriao && (
            <PedidosDeEntrada pedidos={state.pendingEntryRequests} onRespond={props.onRespondEntry} />
          )}

          <Palco
            layout={layout}
            streamsById={streamsById}
            mediaEpoch={props.mediaEpoch}
            nameOf={nameOf}
            stageMeta={stageMeta}
            palcoRef={palcoRef}
            onTileClick={tileClick}
            onPromoteToFullscreen={promoteToFullscreen}
            onToggleFullscreen={toggleFullscreen}
            transmitirButton={transmitirButton}
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
