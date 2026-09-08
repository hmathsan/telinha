import type { ConnectionDiagnostics } from "./media/meshManager.js";
import type { QualityWarning } from "./useSessao.js";

function formatBitrate(bps: number | null): string {
  if (bps === null) return "—";
  return `${(bps / 1_000_000).toFixed(2)} Mbps`;
}

export interface DiagnosticsPanelProps {
  readonly diagnostics: readonly ConnectionDiagnostics[];
  readonly warnings: readonly QualityWarning[];
  readonly onDismissWarning: (id: string) => void;
  readonly onExport: () => void;
}

/**
 * Painel expandido com as métricas por conexão da spec 0003. `encoderImplementation` e
 * `qualityLimitationReason` aparecem sempre, mesmo sem problema — são o único jeito de ver a
 * queda para software antes que vire "o jogo do meu amigo ficou ruim, sei lá por quê".
 */
export function DiagnosticsPanel({ diagnostics, warnings, onDismissWarning, onExport }: DiagnosticsPanelProps) {
  return (
    <div style={{ fontSize: 13, border: "1px solid #444", borderRadius: 8, padding: 12, marginTop: 12 }}>
      {warnings.map((w) => (
        <div key={w.id} style={{ background: "#7c2d12", color: "#fff", padding: 8, borderRadius: 4, marginBottom: 8, display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span>{w.text}</span>
          <button onClick={() => onDismissWarning(w.id)}>×</button>
        </div>
      ))}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Conexão</th>
            <th align="left">Saída</th>
            <th align="left">Entrada</th>
            <th align="left">Perdidos</th>
            <th align="left">FPS</th>
            <th align="left">Encoder</th>
            <th align="left">Limitação</th>
            <th align="left">Relay</th>
          </tr>
        </thead>
        <tbody>
          {diagnostics.map((d) => (
            <tr key={d.connectionKey}>
              <td>{d.role === "transmissor" ? `→ ${d.espectadorId.slice(0, 8)}` : `← ${d.transmissorId.slice(0, 8)}`}</td>
              <td>{formatBitrate(d.outboundBitrateBps)}</td>
              <td>{formatBitrate(d.inboundBitrateBps)}</td>
              <td>{d.packetsLost ?? "—"}</td>
              <td>{d.framesPerSecond ?? "—"}</td>
              <td>{d.encoderImplementation ?? "—"}</td>
              <td>{d.qualityLimitationReason ?? "—"}</td>
              <td>{d.relay.isRelay ? "sua rede exige um servidor de retransmissão" : "direto"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button style={{ marginTop: 8 }} onClick={onExport}>
        Exportar diagnóstico
      </button>
    </div>
  );
}
