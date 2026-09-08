import { app } from "electron";
import electronUpdater from "electron-updater";

// electron-updater é CommonJS; a interop do ESM do Node não expõe `autoUpdater` como named
// export (SyntaxError em runtime), só o default.
const { autoUpdater } = electronUpdater;

/**
 * Checagem silenciosa em segundo plano: baixa a atualização sem perguntar nada, e ela só é
 * instalada quando o app fecha (`autoInstallOnAppQuit`, ligado por padrão) — o próximo início já
 * está na versão nova, sem diálogo interrompendo a Sessão em andamento (spec 0005,
 * "Atualização"). O `electron-updater` também não faz nada fora de um app empacotado (não há
 * `app-update.yml` em `npm run dev`), então checar sem `app.isPackaged` só geraria um erro sem
 * efeito prático — ainda assim, qualquer falha de rede/GitHub aqui não deve derrubar o app.
 */
export function startAutoUpdater(): void {
  if (!app.isPackaged) return;

  autoUpdater.on("error", () => {
    // Atualização silenciosa: uma falha aqui (rede, GitHub fora do ar) não deve virar UI.
  });

  autoUpdater.checkForUpdates().catch(() => {
    // Mesmo motivo: sem tela de erro para uma checagem em segundo plano.
  });
}
