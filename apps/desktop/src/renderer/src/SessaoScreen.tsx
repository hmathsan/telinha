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

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#1e1f22",
        color: "#eee",
        height: "100vh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #2b2d31" }}>
        <strong>Código de Sessão: {state.codigoDeSessao}</strong>
        <button onClick={props.onLeave}>Sair</button>
      </header>

      {banner && <div style={{ background: "#374151", color: "#fff", padding: 8 }}>{banner}</div>}

      {state.isAnfitriao &&
        state.pendingEntryRequests.map((request: EntryRequestEntry) => (
          <div key={request.participanteId} style={{ background: "#1f2937", color: "#fff", padding: 8, margin: "0 16px", marginTop: 12, borderRadius: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{request.name} pediu para entrar.</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button onClick={() => props.onRespondEntry(request.participanteId, true)}>Aprovar</button>
              <button onClick={() => props.onRespondEntry(request.participanteId, false)}>Recusar</button>
            </span>
          </div>
        ))}

      <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", gap: 16, padding: 16 }}>
        <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <QualityIndicator
            frameWidth={frameWidth}
            frameHeight={frameHeight}
            framesPerSecond={framesPerSecond}
            degraded={degraded}
            relayed={relayed}
            onClick={() => setShowDiagnostics((v) => !v)}
          />

          {orderedTransmissorIds.length === 0 ? (
            <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "#111214", color: "#9ca3af", borderRadius: 8 }}>
              <p>Ninguém está transmitindo.</p>
              <button disabled={palcoOcupado} onClick={props.onStartTransmitindo}>
                {palcoOcupado ? `${MAX_TRANSMISSORES}/${MAX_TRANSMISSORES} transmitindo` : "Transmitir"}
              </button>
            </div>
          ) : (
            <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <div ref={stageRef} style={{ flex: "1 1 auto", minHeight: 0, background: "#000", borderRadius: 8, display: "flex" }}>
                {stagedId && (
                  <VideoTile stream={streamsById.get(stagedId)!} label={nameOf(state, stagedId)} onDoubleClick={toggleFullscreen} />
                )}
              </div>
              {thumbnailIds.length > 0 && (
                <div style={{ display: "flex", gap: 8, overflowX: "auto", flex: "0 0 auto" }}>
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
              <div style={{ flex: "0 0 auto" }}>
                {props.isTransmitting ? (
                  <button onClick={props.onReleasePalco}>Parar de transmitir</button>
                ) : (
                  <button disabled={palcoOcupado} onClick={props.onStartTransmitindo}>
                    {palcoOcupado ? `${MAX_TRANSMISSORES}/${MAX_TRANSMISSORES} transmitindo` : "Transmitir"}
                  </button>
                )}
              </div>
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

        <aside style={{ flex: "0 0 220px", overflowY: "auto" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>PARTICIPANTES</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {state.roster.map((p) => (
              <li key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span>
                  {state.transmissores.includes(p.id) && <span style={{ color: "#ef4444" }}>● </span>}
                  {p.name}
                </span>
                {state.isAnfitriao && p.id !== state.myId && (
                  <button onClick={() => props.onExpel(p.id)}>expulsar</button>
                )}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
