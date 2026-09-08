import { app } from "electron";

/**
 * Sem isso, a captura de janela usa GDI (`PrintWindow`/`BitBlt`), que entrega quadro preto ou
 * congelado quando a janela está ocluída ou composta por GPU — exatamente o caso de um jogo
 * (spec 0003, "A captura de janela precisa de WGC"). Precisa rodar antes de `app.whenReady()`.
 *
 * A borda amarela que o WGC traz não tem como ser desligada a partir daqui — veja a
 * ADR 0006. Confirme empiricamente se estas flags já vêm ligadas por padrão na versão do
 * Electron em uso, capturando uma janela ocluída; a pesquisa da spec não conseguiu determinar
 * isso na fonte do M152.
 */
export function enableWindowsGraphicsCapture(): void {
  app.commandLine.appendSwitch(
    "enable-features",
    "AllowWgcDesktopCapturer,AllowWgcWindowCapturer,AllowWgcScreenCapturer,AllowWgcZeroHz",
  );
}
