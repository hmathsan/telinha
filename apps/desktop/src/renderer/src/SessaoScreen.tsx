import { useMemo, useRef, useState } from "react";
import { MAX_TRANSMISSORES } from "@pvt-broadcast/protocol";
import type { EntryRequestEntry } from "../../shared/clientSessaoState.js";
import type { ClientSessaoState } from "../../shared/clientSessaoState.js";
import type { SignalingConnectionState } from "../../shared/ipc.js";
import { isConnectionDegraded } from "../../shared/media/connectionQuality.js";
import { selectPalco } from "../../shared/palcoSelection.js";
import type { ConnectionDiagnostics } from "./media/meshManager.js";
import type { QualityWarning } from "./useSessao.js";
import { VideoTile } from "./VideoTile.js";
import { QualityIndicator } from "./QualityIndicator.js";
import { DiagnosticsPanel } from "./DiagnosticsPanel.js";
import { IconBroadcast, IconSignOut } from "./components/icons/index.js";

export interface SessaoScreenProps {
  readonly state: ClientSessaoState;
  readonly connectionState: SignalingConnectionState;
  readonly remoteStreams: ReadonlyMap<string, MediaStream>;
  readonly diagnostics: readonly ConnectionDiagnostics[];
  readonly warnings: readonly QualityWarning[];
  readonly isTransmitting: boolean;
  readonly localStream: MediaStream | null;
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

function nameOf(state: ClientSessaoState, id: string): string {
  if (id === state.myId) return "Você";
  return state.roster.find((p) => p.id === id)?.name ?? id.slice(0, 8);
}

export function SessaoScreen(props: SessaoScreenProps) {
  const { state } = props;
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [promotedId, setPromotedId] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const banner = connectionBanner(props.connectionState);
  const palcoOcupado = state.transmissores.length >= MAX_TRANSMISSORES;

  const streamsById = useMemo(() => {
    const map = new Map<string, MediaStream>(props.remoteStreams);
    if (props.isTransmitting && props.localStream && state.myId) map.set(state.myId, props.localStream);
    return map;
  }, [props.remoteStreams, props.isTransmitting, props.localStream, state.myId]);

  // O primeiro Transmissor ocupa o Palco por padrão; clicar numa miniatura promove e substitui
  // (spec 0004, "Palco"). Ordem vem do roster autoritativo (`state.transmissores`), não da ordem
  // de chegada das streams na malha.
  const orderedTransmissorIds = state.transmissores.filter((id) => streamsById.has(id));
  const stagedId = selectPalco(orderedTransmissorIds, promotedId);
  const thumbnailIds = orderedTransmissorIds.filter((id) => id !== stagedId);

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

  function promote(id: string): void {
    setPromotedId(id);
  }

  function toggleFullscreen(): void {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
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
      <header className="flex flex-none items-center justify-between border-b border-b-border px-4 py-3">
        <strong className="font-medium">
          Código de Sessão: <span className="font-mono tracking-wide">{state.codigoDeSessao}</span>
        </strong>
        <button type="button" className="btn btn-ghost" onClick={props.onLeave}>
          <IconSignOut />
          Sair
        </button>
      </header>

      {banner && <div className="flex-none bg-surface px-4 py-2 text-sm text-text-muted">{banner}</div>}

      {state.isAnfitriao &&
        state.pendingEntryRequests.map((request: EntryRequestEntry) => (
          <div key={request.participanteId} className="card card-accent mx-4 mt-3 flex flex-none items-center justify-between gap-3">
            <span>{request.name} pediu para entrar.</span>
            <span className="flex gap-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => props.onRespondEntry(request.participanteId, true)}>
                Aprovar
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => props.onRespondEntry(request.participanteId, false)}>
                Recusar
              </button>
            </span>
          </div>
        ))}

      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <QualityIndicator
            frameWidth={frameWidth}
            frameHeight={frameHeight}
            framesPerSecond={framesPerSecond}
            degraded={degraded}
            relayed={relayed}
            onClick={() => setShowDiagnostics((v) => !v)}
          />

          {orderedTransmissorIds.length === 0 ? (
            <div className="card card-quiet flex flex-1 flex-col items-center justify-center gap-3">
              <p>Ninguém está transmitindo.</p>
              {transmitirButton}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div ref={stageRef} className="stage-surface flex min-h-0 flex-1">
                {stagedId && (
                  <VideoTile stream={streamsById.get(stagedId)!} label={nameOf(state, stagedId)} onDoubleClick={toggleFullscreen} />
                )}
              </div>
              {thumbnailIds.length > 0 && (
                <div className="flex flex-none gap-2 overflow-x-auto">
                  {thumbnailIds.map((id) => (
                    <VideoTile
                      key={id}
                      variant="thumbnail"
                      stream={streamsById.get(id)!}
                      label={nameOf(state, id)}
                      onClick={() => promote(id)}
                    />
                  ))}
                </div>
              )}
              <div className="flex-none">{transmitirButton}</div>
            </div>
          )}

          {showDiagnostics && (
            <DiagnosticsPanel
              diagnostics={props.diagnostics}
              warnings={props.warnings}
              onDismissWarning={props.onDismissWarning}
              onExport={props.onExportDiagnostics}
            />
          )}
        </div>

        <aside className="drawer flex flex-col gap-2">
          <h3 className="section-label">Participantes</h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {state.roster.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  {state.transmissores.includes(p.id) && <span className="dot dot-live" />}
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">{p.name}</span>
                </span>
                {state.isAnfitriao && p.id !== state.myId && (
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => props.onExpel(p.id)}>
                    expulsar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
