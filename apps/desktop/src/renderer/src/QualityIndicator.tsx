export interface QualityIndicatorProps {
  readonly frameWidth: number | null;
  readonly frameHeight: number | null;
  readonly framesPerSecond: number | null;
  readonly degraded: boolean;
  readonly relayed: boolean;
  readonly onClick: () => void;
}

/**
 * Sempre visível e discreto (spec 0004, "Indicador de qualidade"): resolução e FPS atuais do
 * Palco, mais um sinal de conexão degradada. É a distinção entre congestionamento (números caindo
 * mas o ponto continua) e defeito (o ponto fica âmbar). Clicar abre o painel expandido de onde sai
 * o "exportar diagnóstico".
 */
export function QualityIndicator({ frameWidth, frameHeight, framesPerSecond, degraded, relayed, onClick }: QualityIndicatorProps) {
  const resolution = frameWidth && frameHeight ? `${frameWidth}×${frameHeight}` : "—";
  const fps = framesPerSecond !== null ? `${framesPerSecond} fps` : "— fps";
  const isWarning = degraded || relayed;

  return (
    <button
      onClick={onClick}
      title="Ver diagnóstico"
      style={{
        alignSelf: "flex-start",
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "none",
        border: "1px solid #3a3c42",
        borderRadius: 999,
        padding: "4px 10px",
        color: isWarning ? "#f59e0b" : "#9ca3af",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: isWarning ? "#f59e0b" : "#22c55e",
          flex: "0 0 auto",
        }}
      />
      <span>
        {resolution} · {fps}
      </span>
      {relayed && <span>· sua rede exige um servidor de retransmissão</span>}
    </button>
  );
}
