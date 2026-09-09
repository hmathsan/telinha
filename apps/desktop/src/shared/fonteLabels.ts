/**
 * Os rótulos das Fontes no seletor (spec 0008, "Seletor de Fonte").
 *
 * O `desktopCapturer` devolve "Screen 1" / "Entire screen" no Windows, então o rótulo é reescrito
 * de qualquer forma — e "Tela" está na lista de termos a evitar para Fonte (CONTEXT.md). Monitores
 * viram **Monitor 1**, **Monitor 2**, na ordem em que o Electron os entrega; janelas ficam com o
 * nome que o sistema dá, que é o que a pessoa reconhece.
 */

export interface FonteRotulavel {
  readonly kind: "screen" | "window";
  readonly name: string;
}

export function rotularFontes<T extends FonteRotulavel>(items: readonly T[]): T[] {
  let monitorCount = 0;
  return items.map((item) => {
    if (item.kind !== "screen") return { ...item };
    monitorCount += 1;
    return { ...item, name: `Monitor ${monitorCount}` };
  });
}
