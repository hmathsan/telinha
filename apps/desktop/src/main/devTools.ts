import { Menu, type BrowserWindow, app } from "electron";
import { devToolsAllowed } from "../shared/hardening.js";

/**
 * Fecha o DevTools no app instalado. São duas superfícies, e nenhuma delas é `openDevTools()` —
 * o app nunca chamou isso:
 *
 * 1. O **menu padrão** do Electron, que traz "Toggle Developer Tools" e o acelerador
 *    `Ctrl+Shift+I` mesmo com `autoHideMenuBar`. Sem menu, o acelerador não existe. No Windows os
 *    atalhos de edição (copiar, colar, selecionar tudo) continuam funcionando nos campos de
 *    texto, porque quem os trata é o Chromium, não o menu.
 * 2. Qualquer outro caminho que consiga abrir o painel — daí o `devtools-opened`, que fecha na
 *    hora.
 *
 * A política (e a válvula `SCRN_BROADCAST_DEVTOOLS=1`) está em `shared/hardening.ts`. Decidida em
 * runtime por `app.isPackaged`, o mesmo sinal que o auto-updater usa: um `electron-vite build`
 * rodado sem a variável de ambiente certa não deixa o DevTools escapar para dentro de um
 * instalador.
 */
export function applyDevToolsPolicy(window: BrowserWindow): void {
  if (devToolsAllowed(app.isPackaged, process.env)) {
    return;
  }
  Menu.setApplicationMenu(null);
  window.webContents.on("devtools-opened", () => {
    window.webContents.closeDevTools();
  });
}
