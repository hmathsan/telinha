import type { ReactNode, RefObject } from "react";
import type { PalcoLayout } from "../../shared/palcoSelection.js";
import {
  IconEye,
  IconEyeSlash,
  IconMonitor,
  IconVideoCamera,
  IconVideoCameraSlash,
} from "./components/icons/index.js";
import type { SurfaceOf } from "./media/videoSurfaces.js";
import { VideoTile, type VideoTileSom } from "./VideoTile.js";

export interface PalcoProps {
  readonly layout: PalcoLayout;
  /**
   * O `<video>` vivo de cada Transmissor (`media/videoSurfaces.ts`). O Palco escolhe onde cada
   * Fonte aparece; quem é dono do elemento é o registro, e é por isso que mudar de Foco para
   * Grade não interrompe a imagem de ninguém.
   */
  readonly surfaceOf: SurfaceOf;
  readonly nameOf: (id: string) => string;
  /** Os controles de Som de cada Fonte; `undefined` na própria Fonte de quem transmite (spec 0010). */
  readonly somOf: (id: string) => VideoTileSom | undefined;
  /** Resolução e taxa do Palco, no canto oposto ao nome. */
  readonly stageMeta: string | null;
  /**
   * O alvo da tela cheia. É a raiz do Palco, e não o Palco em Foco, porque o duplo clique numa
   * célula da Grade precisa pedir tela cheia no mesmo instante em que troca de modo — o elemento
   * do Foco ainda não existe ali, e adiar o pedido perde a ativação do clique.
   */
  readonly palcoRef: RefObject<HTMLDivElement | null>;
  /** Um clique em qualquer Fonte do Palco; o que ele faz é `selectPalcoClick`. */
  readonly onTileClick: (id: string) => void;
  readonly onPromoteToFullscreen: (id: string) => void;
  readonly onToggleFullscreen: () => void;
  readonly transmitirButton: ReactNode;
  /** Transmissor ocultou a própria prévia local para economizar GPU (spec 0015, Parte 2.2). */
  readonly previaOculta?: boolean;
  readonly onMostrarPrevia?: () => void;
  /** Espectador pausou o vídeo remoto manualmente para economizar GPU (spec 0015, Parte 2.3). */
  readonly videoRemotoPausado?: boolean;
  readonly onRetomarVideo?: () => void;
}

export function Palco(props: PalcoProps) {
  const { layout } = props;

  if (props.videoRemotoPausado) {
    return (
      <div className="card card-quiet flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <IconVideoCameraSlash className="empty-palco-icon" />
        <h3>Vídeo remoto pausado</h3>
        <p className="field-hint">
          O vídeo remoto está pausado para economizar GPU. O Som continua tocando normalmente.
        </p>
        <div className="flex items-center gap-3">
          {props.onRetomarVideo && (
            <button type="button" className="btn btn-primary" onClick={props.onRetomarVideo}>
              <IconVideoCamera />
              Retomar vídeo
            </button>
          )}
          {props.previaOculta && props.onMostrarPrevia && (
            <button type="button" className="btn btn-secondary" onClick={props.onMostrarPrevia}>
              <IconEye />
              Mostrar prévia
            </button>
          )}
        </div>
      </div>
    );
  }

  if (layout.vazio) {
    if (props.previaOculta) {
      return (
        <div className="card card-quiet flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <IconEyeSlash className="empty-palco-icon" />
          <h3>Você está transmitindo</h3>
          <p className="field-hint">
            Prévia oculta para economizar GPU. Os demais Participantes continuam vendo sua Fonte.
          </p>
          {props.onMostrarPrevia && (
            <button type="button" className="btn btn-secondary" onClick={props.onMostrarPrevia}>
              <IconEye />
              Mostrar prévia
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="card card-quiet flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <IconMonitor className="empty-palco-icon" />
        <h3>O Palco está vazio</h3>
        <p className="field-hint">Ninguém está transmitindo agora. Escolha uma Fonte e apareça para os outros.</p>
        {props.transmitirButton}
      </div>
    );
  }

  return (
    <div ref={props.palcoRef} className="palco-surface flex min-h-0 flex-1 flex-col gap-3">
      {layout.modo === "grade" ? (
        <div className="palco-grade min-h-0 flex-1">
          {layout.cellIds.map((id) => (
            <VideoTile
              key={id}
              variant="cell"
              surface={props.surfaceOf(id)}
              label={props.nameOf(id)}
              som={props.somOf(id)}
              // Clique promove e volta para Foco; duplo clique faz o mesmo e entra em tela cheia —
              // duplo clique já significa "quero ver isto grande" (spec 0008, "Palco").
              onClick={() => props.onTileClick(id)}
              onDoubleClick={() => props.onPromoteToFullscreen(id)}
            />
          ))}
        </div>
      ) : (
        <>
          <div className="stage-surface flex min-h-0 flex-1">
            {layout.stagedId && (
              <VideoTile
                key={layout.stagedId}
                surface={props.surfaceOf(layout.stagedId)}
                label={props.nameOf(layout.stagedId)}
                som={props.somOf(layout.stagedId)}
                meta={props.stageMeta}
                // Clicar em quem já está no Palco abre a Grade. Sem alternador não há Grade a que
                // ir, e aí a Fonte não vira controle: um clique que não muda nada parece defeito.
                onClick={layout.alternadorVisivel ? () => props.onTileClick(layout.stagedId!) : undefined}
                onDoubleClick={props.onToggleFullscreen}
              />
            )}
          </div>
          {layout.thumbnailIds.length > 0 && (
            <div className="palco-thumbs flex flex-none gap-3 overflow-x-auto">
              {layout.thumbnailIds.map((id) => (
                <VideoTile
                  key={id}
                  variant="thumbnail"
                  surface={props.surfaceOf(id)}
                  label={props.nameOf(id)}
                  som={props.somOf(id)}
                  onClick={() => props.onTileClick(id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
