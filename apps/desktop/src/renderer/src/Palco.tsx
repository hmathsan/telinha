import type { ReactNode, RefObject } from "react";
import type { PalcoLayout } from "../../shared/palcoSelection.js";
import { IconMonitor } from "./components/icons/index.js";
import { VideoTile } from "./VideoTile.js";

export interface PalcoProps {
  readonly layout: PalcoLayout;
  readonly streamsById: ReadonlyMap<string, MediaStream>;
  /**
   * Muda quando a captura local é desmontada (`useSessao`). Entra na `key` de toda Fonte porque
   * parar de transmitir trava o `<video>` de quem continua, e só um elemento novo desengasga —
   * é a mesma cura de alternar Foco/Grade, que deixa de existir com um Transmissor só.
   */
  readonly mediaEpoch: number;
  readonly nameOf: (id: string) => string;
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
}

export function Palco(props: PalcoProps) {
  const { layout } = props;

  /** A identidade do elemento de mídia: o Transmissor, mais a época que força o remonte. */
  const tileKey = (id: string): string => `${props.mediaEpoch}:${id}`;

  if (layout.vazio) {
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
              key={tileKey(id)}
              variant="cell"
              stream={props.streamsById.get(id)!}
              label={props.nameOf(id)}
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
                key={tileKey(layout.stagedId)}
                stream={props.streamsById.get(layout.stagedId)!}
                label={props.nameOf(layout.stagedId)}
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
                  key={tileKey(id)}
                  variant="thumbnail"
                  stream={props.streamsById.get(id)!}
                  label={props.nameOf(id)}
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
