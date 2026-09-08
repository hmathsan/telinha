import { useState } from "react";
import { MAX_TRANSMISSORES } from "@pvt-broadcast/protocol";
import type { EntryRequestEntry } from "../../shared/clientSessaoState.js";
import type { ClientSessaoState } from "../../shared/clientSessaoState.js";
import type { SignalingConnectionState } from "../../shared/ipc.js";
import type { ConnectionDiagnostics } from "./media/meshManager.js";
import type { QualityWarning } from "./useSessao.js";
import { VideoTile } from "./VideoTile.js";
import { DiagnosticsPanel } from "./DiagnosticsPanel.js";

export interface SessaoScreenProps {
  readonly state: ClientSessaoState;
  readonly connectionState: SignalingConnectionState;
  readonly remoteStreams: ReadonlyMap<string, MediaStream>;
  readonly diagnostics: readonly ConnectionDiagnostics[];
  readonly warnings: readonly QualityWarning[];
  readonly isTransmitting: boolean;
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
  return state.roster.find((p) => p.id === id)?.name ?? id.slice(0, 8);
}

export function SessaoScreen(props: SessaoScreenProps) {
  const { state } = props;
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const banner = connectionBanner(props.connectionState);
  const palcoOcupado = state.transmissores.length >= MAX_TRANSMISSORES;
  const espectadorRelayed = props.diagnostics.some((d) => d.role === "espectador" && d.relay.isRelay);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong>Código de Sessão: {state.codigoDeSessao}</strong>
          {espectadorRelayed && <div style={{ color: "#b45309" }}>Sua rede exige um servidor de retransmissão.</div>}
        </div>
        <button onClick={props.onLeave}>Sair</button>
      </header>

      {banner && <div style={{ background: "#374151", color: "#fff", padding: 8, borderRadius: 4 }}>{banner}</div>}

      {state.isAnfitriao &&
        state.pendingEntryRequests.map((request: EntryRequestEntry) => (
          <div key={request.participanteId} style={{ background: "#1f2937", color: "#fff", padding: 8, borderRadius: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{request.name} pediu para entrar.</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button onClick={() => props.onRespondEntry(request.participanteId, true)}>Aprovar</button>
              <button onClick={() => props.onRespondEntry(request.participanteId, false)}>Recusar</button>
            </span>
          </div>
        ))}

      <section>
        <h3>Palco</h3>
        {props.remoteStreams.size === 0 && !props.isTransmitting && (
          <div style={{ padding: 40, textAlign: "center", background: "#111827", color: "#9ca3af", borderRadius: 8 }}>
            Ninguém está transmitindo.
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          {[...props.remoteStreams.entries()].map(([transmissorId, stream]) => (
            <VideoTile key={transmissorId} stream={stream} label={nameOf(state, transmissorId)} />
          ))}
        </div>
      </section>

      <section>
        {props.isTransmitting ? (
          <button onClick={props.onReleasePalco}>Parar de transmitir</button>
        ) : (
          <button disabled={palcoOcupado} onClick={props.onStartTransmitindo}>
            {palcoOcupado ? `${MAX_TRANSMISSORES}/${MAX_TRANSMISSORES} transmitindo` : "Transmitir"}
          </button>
        )}
      </section>

      <section>
        <h3>Participantes</h3>
        <ul>
          {state.roster.map((p) => (
            <li key={p.id}>
              {p.name} {state.transmissores.includes(p.id) && "🔴"}
              {state.isAnfitriao && p.id !== state.myId && (
                <button style={{ marginLeft: 8 }} onClick={() => props.onExpel(p.id)}>
                  expulsar
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <button onClick={() => setShowDiagnostics((v) => !v)}>{showDiagnostics ? "Ocultar diagnóstico" : "Diagnóstico"}</button>
      {showDiagnostics && (
        <DiagnosticsPanel
          diagnostics={props.diagnostics}
          warnings={props.warnings}
          onDismissWarning={props.onDismissWarning}
          onExport={props.onExportDiagnostics}
        />
      )}
    </div>
  );
}
