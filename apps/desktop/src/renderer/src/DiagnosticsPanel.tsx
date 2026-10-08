import type { ConnectionDiagnostics } from "./media/meshManager.js";
import type { QualityWarning } from "./useSessao.js";
import { IconDownload, IconX } from "./components/icons/index.js";

function formatMbps(bps: number | null): string {
  if (bps === null) return "—";
  return (bps / 1_000_000).toFixed(2);
}

function formatKbps(bps: number | null): string {
  if (bps === null) return "—";
  return String(Math.round(bps / 1000));
}

function formatRtt(ms: number | null): string {
  return ms === null ? "—" : `${ms} ms`;
}

/**
 * A coluna que o diagnóstico não tinha na noite em que uma perna ficou congelada por quatro
 * minutos: quanto tempo ela está quebrada e quantas vezes a escada já tentou consertá-la. Sem
 * ela, responder isso exigia cruzar o .json exportado com o `main.log` linha a linha.
 */
function formatRecuperacao(msUnhealthy: number, restartAttempts: number): string {
  if (msUnhealthy === 0 && restartAttempts === 0) return "—";
  const tentativas = restartAttempts > 0 ? `${restartAttempts}×` : "";
  if (msUnhealthy === 0) return tentativas;
  const quebradaHa = `${Math.round(msUnhealthy / 1000)} s`;
  return tentativas ? `${quebradaHa} · ${tentativas}` : quebradaHa;
}

export interface DiagnosticsPanelProps {
  readonly diagnostics: readonly ConnectionDiagnostics[];
  readonly warnings: readonly QualityWarning[];
  readonly nameOf: (participanteId: string) => string;
  readonly onDismissWarning: (id: string) => void;
  readonly onExport: () => void;
  readonly onClose: () => void;
}

/**
 * Gaveta inferior sobre a Sessão (spec 0008, "Diagnóstico"): avisos acumulados acima, cada um
 * dispensável, e uma linha por conexão abaixo.
 *
 * Além das colunas da 0008, `encoderImplementation` e `qualityLimitationReason` aparecem sempre:
 * a spec 0003 as chama de não opcionais, porque a queda para encoder por software acontece sem
 * erro e sem evento, e essa coluna é o único aviso que existe.
 */
export function DiagnosticsPanel(props: DiagnosticsPanelProps) {
  return (
    <section className="diagnostics-drawer flex flex-col gap-4 p-4" aria-label="Diagnóstico">
      <div className="flex flex-none items-center justify-between gap-3">
        <h3>Diagnóstico</h3>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={props.onExport}>
            <IconDownload />
            Exportar .json
          </button>
          {/* O arquivo de log fica fora da Sessão: é o que sobrevive ao app fechar sozinho. */}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.scrnBroadcast.openLogsFolder()}>
            Abrir pasta de logs
          </button>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={props.onClose} title="Fechar">
            <IconX label="Fechar diagnóstico" />
          </button>
        </div>
      </div>

      {props.warnings.length > 0 && (
        <div className="flex flex-none flex-col gap-2">
          {props.warnings.map((w) => (
            <div key={w.id} className="card card-warn flex items-center justify-between gap-3 text-sm">
              <span>{w.text}</span>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => props.onDismissWarning(w.id)}
                title="Dispensar"
              >
                <IconX label="Dispensar aviso" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Participante</th>
              <th>Mbps</th>
              <th>fps</th>
              <th>Perda</th>
              <th>Som kbps</th>
              <th>Som perda</th>
              <th>RTT</th>
              <th>Encoder</th>
              <th>Limitação</th>
              <th>Conexão</th>
              <th>Recuperação</th>
            </tr>
          </thead>
          <tbody>
            {props.diagnostics.map((d) => {
              const enviando = d.role === "transmissor";
              const outro = enviando ? d.espectadorId : d.transmissorId;
              return (
                <tr key={d.connectionKey}>
                  <td>{`${enviando ? "→" : "←"} ${props.nameOf(outro)}`}</td>
                  <td>{formatMbps(enviando ? d.outboundBitrateBps : d.inboundBitrateBps)}</td>
                  <td>{d.framesPerSecond ?? "—"}</td>
                  <td>{d.packetsLost ?? "—"}</td>
                  <td>{formatKbps(enviando ? d.somOutboundBitrateBps : d.somInboundBitrateBps)}</td>
                  <td>{d.somPacketsLost ?? "—"}</td>
                  <td>{formatRtt(d.roundTripTimeMs)}</td>
                  <td>{d.encoderImplementation ?? "—"}</td>
                  <td>{d.qualityLimitationReason ?? "—"}</td>
                  <td>{d.relay.isRelay ? "servidor de retransmissão" : "direto"}</td>
                  <td>{formatRecuperacao(d.msUnhealthy, d.restartAttempts)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
