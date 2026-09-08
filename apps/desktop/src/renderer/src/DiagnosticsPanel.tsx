import type { ConnectionDiagnostics } from "./media/meshManager.js";
import type { QualityWarning } from "./useSessao.js";
import { IconDownload, IconX } from "./components/icons/index.js";

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
    <div className="card flex flex-col gap-4">
      {warnings.length > 0 && (
        <div className="flex flex-col gap-2">
          {warnings.map((w) => (
            <div key={w.id} className="card card-warn flex items-center justify-between gap-3 text-sm">
              <span>{w.text}</span>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onDismissWarning(w.id)} title="Dispensar">
                <IconX label="Dispensar aviso" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Conexão</th>
              <th>Saída</th>
              <th>Entrada</th>
              <th>Perdidos</th>
              <th>FPS</th>
              <th>Encoder</th>
              <th>Limitação</th>
              <th>Relay</th>
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
      </div>

      <div className="flex justify-end">
        <button type="button" className="btn btn-secondary" onClick={onExport}>
          <IconDownload />
          Exportar diagnóstico
        </button>
      </div>
    </div>
  );
}
