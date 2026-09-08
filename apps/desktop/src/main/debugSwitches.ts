import { app } from "electron";

/**
 * Só para exercitar manualmente a queda para encoder por software do "Pronto quando" da spec
 * 0003. `--disable-accelerated-video-encode` é uma flag do Chromium, não do npm/electron-vite —
 * passá-la depois de `npm run dev` vira um flag do próprio npm (erro `EUNKNOWNCONFIG`), e mesmo
 * com `--` no meio, o `electron-vite dev` não repassa argumentos desconhecidos ao processo do
 * Electron que ele lança. Uma variável de ambiente evita esse problema por completo.
 */
export function applyDebugEncoderOverrides(): void {
  if (process.env["PVT_BROADCAST_DISABLE_HW_ENCODE"] === "1") {
    app.commandLine.appendSwitch("disable-accelerated-video-encode");
  }
}
