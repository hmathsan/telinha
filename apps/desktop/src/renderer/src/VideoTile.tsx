import { useEffect, useRef } from "react";

export type VideoTileVariant = "stage" | "thumbnail" | "cell";

/**
 * Quanto o clique simples espera para ver se vira duplo. Sem isso, um duplo clique numa célula da
 * Grade dispara primeiro o clique — que troca o Palco para Foco e desmonta a célula — e o segundo
 * clique cai em outro elemento, então o duplo nunca acontece e a tela cheia nunca abre.
 */
const DOUBLE_CLICK_DELAY_MS = 250;

export interface VideoTileProps {
  readonly stream: MediaStream;
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

export function VideoTile({ stream, label, variant = "stage", meta = null, onClick, onDoubleClick }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pendingClickRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Um `<video>` de MediaStream não retoma sozinho depois de ser interrompido: fica no último
   * quadro, ou preto. É o que acontece com quem continua transmitindo quando outra pessoa para —
   * `stopTransmitting` fecha as peer connections de saída e chama `track.stop()` na captura no
   * mesmo instante, e o elemento trava. Quem força elemento novo é a `mediaEpoch` na `key`
   * (`Palco.tsx`), porque quando quem parou era a miniatura nada no layout deste elemento muda.
   * O que fica aqui é o resto: garantir que um elemento novo comece a tocar, e devolver ao ar um
   * que se interrompa por conta própria.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;

    const play = (): void => {
      void video.play().catch(() => {
        // `play()` rejeita quando o elemento é desmontado no meio da promessa; nada a fazer.
      });
    };
    play();
    // `loadedmetadata` cobre o primeiro quadro; `pause` e `emptied`, a parada que o elemento
    // anuncia sozinho — essa volta sem depender de nenhum re-render.
    const events: readonly string[] = ["loadedmetadata", "pause", "emptied"];
    for (const event of events) video.addEventListener(event, play);
    return () => {
      for (const event of events) video.removeEventListener(event, play);
    };
  }, [stream]);

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
      <video ref={videoRef} autoPlay playsInline muted />
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
