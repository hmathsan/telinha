export interface QualityIndicatorProps {
  readonly frameWidth: number | null;
  readonly frameHeight: number | null;
  readonly framesPerSecond: number | null;
  readonly degraded: boolean;
  readonly relayed: boolean;
  readonly onClick: () => void;
}

/**
 * Sempre visível e discreto (spec 0004, "Indicador de qualidade"): resolução, FPS e o sinal de
 * conexão degradada do Palco. Sem Mbps — o número por conexão fica só no diagnóstico (spec 0008).
 *
 * O aviso de relay não some no redesenho: sem ele, o amigo afetado só percebe que a experiência
 * dele é pior que a dos outros, sem saber por quê. Clicar abre o painel de diagnóstico.
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
      {degraded && <span>· conexão degradada</span>}
      {relayed && <span>· sua rede exige um servidor de retransmissão</span>}
    </button>
  );
}
