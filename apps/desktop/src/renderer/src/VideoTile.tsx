import { useCallback, useEffect, useRef, type SyntheticEvent } from "react";
import { IconSpeakerHigh, IconSpeakerSlash } from "./components/icons/index.js";

export type VideoTileVariant = "stage" | "thumbnail" | "cell";

/**
 * O Som desta Fonte para quem assiste (spec 0010, "Controles na Fonte"). Ausente na própria Fonte
 * de quem transmite. `audivel` é o resultado de `selectSomAudivel`, não a escolha gravada.
 */
export type VideoTileSom =
  | {
      readonly kind: "com-som";
      readonly audivel: boolean;
      /** 0 a 1. */
      readonly volume: number;
      readonly onToggle: () => void;
      readonly onVolume: (volume: number) => void;
    }
  | { readonly kind: "sem-som" };

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
  readonly som?: VideoTileSom;
}

const VARIANT_CLASS: Record<VideoTileVariant, string> = {
  stage: "video-frame-stage",
  thumbnail: "video-frame-thumb",
  cell: "video-frame-cell",
};

/** Controles de Som nunca promovem nem abrem tela cheia. */
function stop(event: SyntheticEvent): void {
  event.stopPropagation();
}

export function VideoTile({ surface, label, variant = "stage", meta = null, onClick, onDoubleClick, som }: VideoTileProps) {
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

  const muteLabel = som?.kind === "com-som" ? (som.audivel ? `Silenciar ${label}` : `Ouvir ${label}`) : "";

  // A moldura é um `<div>`: botão dentro de botão não é HTML válido. Quem recebe clique, duplo
  // clique e o anel de foco é a camada que cobre a moldura; os controles de Som são irmãos dela,
  // por cima (spec 0010). Toda Fonte clicável continua sendo um `<button>` (spec 0007, "Regras").
  // Nome embaixo à esquerda, Som embaixo à direita, com as bases alinhadas.
  return (
    <div className={frameClass} onDoubleClick={onClick ? undefined : handleDoubleClick}>
      <div className="video-surface-slot" ref={slotRef} />
      {onClick && (
        <button
          type="button"
          className="video-frame-hit"
          aria-label={label}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        />
      )}
      <span className="video-frame-pill video-frame-label">
        <span className="dot dot-live" />
        <span className="min-w-0 truncate">{label}</span>
        {som?.kind === "sem-som" && <IconSpeakerSlash label="sem Som" className="video-frame-sem-som" />}
      </span>
      {som?.kind === "com-som" && (
        // O volume vem antes do mudo: ele abre para a esquerda, e a ordem do Tab segue a da tela.
        <div className="video-frame-pill video-frame-som" onClick={stop} onDoubleClick={stop}>
          {variant !== "thumbnail" && (
            <input
              type="range"
              className="range video-frame-volume"
              min={0}
              max={100}
              step={5}
              value={Math.round(som.volume * 100)}
              aria-label={`Volume de ${label}`}
              onChange={(event) => som.onVolume(Number(event.target.value) / 100)}
            />
          )}
          <button
            type="button"
            className="video-frame-mute"
            aria-pressed={!som.audivel}
            aria-label={muteLabel}
            title={muteLabel}
            onClick={som.onToggle}
          >
            {som.audivel ? <IconSpeakerHigh /> : <IconSpeakerSlash />}
          </button>
        </div>
      )}
      {meta && <span className="video-frame-meta">{meta}</span>}
    </div>
  );
}
