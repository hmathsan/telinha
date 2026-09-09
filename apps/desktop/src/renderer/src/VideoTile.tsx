import { useCallback, useEffect, useRef } from "react";

export type VideoTileVariant = "stage" | "thumbnail" | "cell";

/**
 * Quanto o clique simples espera para ver se vira duplo. Sem isso, um duplo clique numa célula da
 * Grade dispara primeiro o clique — que troca o Palco para Foco e desmonta a célula — e o segundo
 * clique cai em outro elemento, então o duplo nunca acontece e a tela cheia nunca abre.
 */
const DOUBLE_CLICK_DELAY_MS = 250;

export interface VideoTileProps {
  /**
   * O `<video>` do Transmissor, vivo desde que a mídia dele chegou (`media/videoSurfaces.ts`).
   * Este componente o hospeda, não o cria: o quadro pode remontar à vontade que a imagem
   * continua — é isso que resolve o quadro preto ao começar ou parar de transmitir.
   */
  readonly surface: HTMLVideoElement | null;
  readonly label: string;
  /** "stage" ocupa o Palco; "thumbnail" é a faixa do Foco; "cell" é uma célula da Grade. */
  readonly variant?: VideoTileVariant;
  /** Resolução e taxa, no canto oposto ao nome. Só o Palco em Foco leva (spec 0008, "Palco"). */
  readonly meta?: string | null;
  readonly onClick?: () => void;
  readonly onDoubleClick?: () => void;
}

const VARIANT_CLASS: Record<VideoTileVariant, string> = {
  stage: "video-frame-stage",
  thumbnail: "video-frame-thumb",
  cell: "video-frame-cell",
};

export function VideoTile({ surface, label, variant = "stage", meta = null, onClick, onDoubleClick }: VideoTileProps) {
  const pendingClickRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slotRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !surface) return;
      if (surface.parentElement !== node) node.appendChild(surface);
      // Reparentar não pausa (ver `videoSurfaces.ts`), mas um elemento que já estava pausado por
      // outro motivo continuaria assim, e nada mais neste caminho o poria de volta no ar.
      if (surface.paused) {
        void surface.play().catch(() => {
          // `play()` rejeita quando o elemento sai do documento no meio da promessa.
        });
      }
    },
    [surface],
  );

  useEffect(
    () => () => {
      if (pendingClickRef.current) clearTimeout(pendingClickRef.current);
    },
    [],
  );

  function cancelPendingClick(): void {
    if (pendingClickRef.current) {
      clearTimeout(pendingClickRef.current);
      pendingClickRef.current = null;
    }
  }

  function handleClick(): void {
    if (!onClick) return;
    // Sem duplo clique concorrendo, o clique é imediato: adiar por nada só parece lentidão.
    if (!onDoubleClick) {
      onClick();
      return;
    }
    cancelPendingClick();
    pendingClickRef.current = setTimeout(() => {
      pendingClickRef.current = null;
      onClick();
    }, DOUBLE_CLICK_DELAY_MS);
  }

  function handleDoubleClick(): void {
    // Direto, sem adiar: `requestFullscreen` precisa da ativação do gesto que está acontecendo.
    cancelPendingClick();
    onDoubleClick?.();
  }

  const frameClass = `video-frame ${VARIANT_CLASS[variant]}`;
  const content = (
    <>
      <div className="video-surface-slot" ref={slotRef} />
      <span className="video-frame-label">
        <span className="dot dot-live" />
        {label}
      </span>
      {meta && <span className="video-frame-meta">{meta}</span>}
    </>
  );

  // Toda Fonte clicável é um `<button>`: foco de teclado e o anel de acento do Nocturne, como
  // qualquer outro elemento interativo (spec 0007, "Regras").
  if (onClick) {
    return (
      <button type="button" className={frameClass} onClick={handleClick} onDoubleClick={handleDoubleClick}>
        {content}
      </button>
    );
  }

  return (
    <div className={frameClass} onDoubleClick={handleDoubleClick}>
      {content}
    </div>
  );
}
