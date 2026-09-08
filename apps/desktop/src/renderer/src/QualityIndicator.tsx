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
    <button type="button" className={`tag self-start ${isWarning ? "tag-warn" : "tag-ok"}`} onClick={onClick} title="Ver diagnóstico">
      <span className="dot" />
      <span>
        {resolution} · {fps}
      </span>
      {relayed && <span>· sua rede exige um servidor de retransmissão</span>}
    </button>
  );
}
