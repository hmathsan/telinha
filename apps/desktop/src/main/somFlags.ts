import { app } from "electron";

/**
 * Sem isso, o Chromium remixa na captura de Som o áudio de outros `WebContents` do próprio app — e o
 * Som nunca inclui o som do próprio app (spec 0009, invariante, ponto 4). Precisa rodar antes de
 * `app.whenReady()`.
 *
 * É o único ponto do app que anexa `disable-features`. Se outro passar a anexar, os valores precisam
 * ir numa chamada só: a segunda sobrescreve a primeira.
 */
export function disableOwnAudioMixBack(): void {
  app.commandLine.appendSwitch("disable-features", "RestrictOwnAudioAddChromiumBack");
}
