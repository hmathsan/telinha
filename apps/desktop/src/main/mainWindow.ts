import { join } from "node:path";
import { app, BrowserWindow } from "electron";

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    // Empacotado, a janela herda o ícone do executável (electron-builder.yml); em dev, sem isto, viria o do Electron.
    icon: app.isPackaged ? undefined : join(__dirname, "../../build/telinha.ico"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
  });

  win.on("ready-to-show", () => win.show());

  const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}
