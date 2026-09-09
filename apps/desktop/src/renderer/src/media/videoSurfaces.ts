import { useEffect, useRef } from "react";
import { shouldReattachVideo } from "../../../shared/media/videoRecovery.js";
import { logToMain } from "../log.js";

/** De quanto em quanto tempo o vigia pergunta se algum elemento parou de pintar. */
const WATCHDOG_INTERVAL_MS = 500;

interface Surface {
  readonly element: HTMLVideoElement;
  stream: MediaStream;
  lastFrameAt: number;
  attempts: number;
  frameCallbackId: number | null;
  readonly release: () => void;
}

export type SurfaceOf = (id: string) => HTMLVideoElement | null;

/**
 * Um `<video>` por Transmissor, criado quando a mídia dele chega e destruído só quando ela vai
 * embora. Fica **fora** da árvore do React de propósito: o `VideoTile` apenas hospeda o elemento
 * (`appendChild`), então trocar Foco por Grade, promover uma miniatura ou alguém entrar e sair do
 * Palco reparenta o mesmo nó em vez de criar outro.
 *
 * Essa é a correção do quadro preto. O `<video>` que o React recriava a cada mudança de layout
 * nascia preto de vez em quando — a `RTCPeerConnection` intacta, sem nenhuma transição de ICE no
 * log — e só um gesto que remontasse tudo de novo devolvia a imagem. Recriar era a causa, não a
 * cura: um elemento que já está pintando não tem como falhar em começar.
 *
 * O que reparenta não pausa: o HTML só manda pausar um elemento de mídia retirado do documento
 * depois de alcançar um estado estável, e reverifica se ele continua fora. O React aplica remoções
 * e inserções do mesmo commit na mesma tarefa, e os ref callbacks rodam na fase de layout desse
 * commit — o elemento já voltou ao documento antes da verificação.
 */
export function useVideoSurfaces(streamsById: ReadonlyMap<string, MediaStream>): SurfaceOf {
  const surfacesRef = useRef<Map<string, Surface>>(new Map());
  const surfaces = surfacesRef.current;

  // Reconcilia durante o render, não num efeito: um elemento criado depois do commit só chegaria
  // ao `VideoTile` no render seguinte, e ele montaria um quadro vazio antes. A operação é
  // idempotente — o `StrictMode` do `main.tsx` renderiza duas vezes em desenvolvimento.
  for (const [id, stream] of streamsById) {
    const existing = surfaces.get(id);
    if (!existing) surfaces.set(id, createSurface(id, stream));
    else if (existing.stream !== stream) attach(existing, stream);
  }

  useEffect(() => {
    for (const [id, surface] of surfaces) {
      if (streamsById.has(id)) continue;
      surface.release();
      surfaces.delete(id);
    }
  }, [streamsById, surfaces]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = performance.now();
      for (const [id, surface] of surfaces) {
        const track = surface.stream.getVideoTracks()[0];
        if (!track) continue;
        // `requestVideoFrameCallback` só dispara para quem chega ao compositor, então um elemento
        // fora do documento ou escondido (a faixa de miniaturas em tela cheia) parece parado sem
        // estar. O relógio só corre enquanto ele tem caixa na tela.
        if (!surface.element.isConnected || surface.element.getClientRects().length === 0) {
          surface.lastFrameAt = now;
          continue;
        }
        const msSinceLastFrame = now - surface.lastFrameAt;
        const health = {
          msSinceLastFrame,
          trackReadyState: track.readyState,
          trackMuted: track.muted,
          attempts: surface.attempts,
        };
        if (!shouldReattachVideo(health)) continue;
        surface.attempts += 1;
        logToMain("warn", "video-surface-reattached", {
          id,
          msSinceLastFrame: Math.round(msSinceLastFrame),
          attempt: surface.attempts,
        });
        attach(surface, surface.stream);
      }
    }, WATCHDOG_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [surfaces]);

  // Não existe um efeito que solte tudo na desmontagem, de propósito: o `StrictMode` do `main.tsx`
  // roda a limpeza de todo efeito uma vez em desenvolvimento, e essa limpeza esvaziaria o registro
  // sem nada para repovoá-lo — a criação acontece no render, e nenhum render vem depois. Sair da
  // Sessão desmonta esta tela sem passar pelo efeito acima, e o que fica são elementos já fora do
  // documento, sobre streams que o `MeshManager.close()` parou: coletáveis, sem sink vivo.

  return (id: string) => surfaces.get(id)?.element ?? null;
}

function createSurface(id: string, stream: MediaStream): Surface {
  const element = document.createElement("video");
  element.autoplay = true;
  element.playsInline = true;
  // Áudio de Fonte ainda não existe (spec 0003); sem `muted`, o autoplay seria recusado.
  element.muted = true;

  // Um `<video>` de MediaStream não retoma sozinho depois de ser interrompido: fica no último
  // quadro, ou preto. `pause` e `emptied` são as interrupções que o elemento anuncia; o quadro
  // preto que este módulo existe para resolver não anuncia nenhuma, e cai no vigia.
  const play = (): void => {
    void element.play().catch(() => {
      // `play()` rejeita quando o elemento sai do documento no meio da promessa; nada a fazer.
    });
  };
  const events: readonly string[] = ["loadedmetadata", "pause", "emptied"];
  for (const event of events) element.addEventListener(event, play);

  const surface: Surface = {
    element,
    stream,
    lastFrameAt: performance.now(),
    attempts: 0,
    frameCallbackId: null,
    release: () => {
      for (const event of events) element.removeEventListener(event, play);
      if (surface.frameCallbackId !== null) element.cancelVideoFrameCallback(surface.frameCallbackId);
      element.srcObject = null;
      element.remove();
      logToMain("info", "video-surface-released", { id });
    },
  };

  attach(surface, stream);
  return surface;
}

/**
 * (Re)aponta o elemento para a stream e o põe para tocar. Serve tanto para o primeiro vínculo
 * quanto para a reanexação do vigia — passar por `null` força o elemento a recarregar em vez de
 * ignorar a atribuição do mesmo objeto.
 */
function attach(surface: Surface, stream: MediaStream): void {
  surface.stream = stream;
  surface.lastFrameAt = performance.now();
  surface.element.srcObject = null;
  surface.element.srcObject = stream;
  // Descarregar a mídia descarta o callback de quadro pendente; sem re-registrar, o vigia veria
  // um elemento eternamente sem quadros logo depois de consertá-lo.
  watchFrames(surface);
  void surface.element.play().catch(() => {
    // Idem: desmontagem no meio da promessa.
  });
}

/**
 * `requestVideoFrameCallback` é o único sinal que distingue "preto" de "pintando": um elemento
 * travado continua com `readyState` alto e sem disparar `pause`, `stalled` nem `waiting`.
 */
function watchFrames(surface: Surface): void {
  if (surface.frameCallbackId !== null) surface.element.cancelVideoFrameCallback(surface.frameCallbackId);
  const onFrame = (): void => {
    surface.lastFrameAt = performance.now();
    surface.attempts = 0;
    surface.frameCallbackId = surface.element.requestVideoFrameCallback(onFrame);
  };
  surface.frameCallbackId = surface.element.requestVideoFrameCallback(onFrame);
}
