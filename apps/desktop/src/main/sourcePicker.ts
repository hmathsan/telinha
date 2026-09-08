import { join } from "node:path";
import { BrowserWindow, type DesktopCapturerSource, desktopCapturer, ipcMain } from "electron";
import { IPC_CHANNELS, type FontePickerItem } from "../shared/ipc.js";

const REFRESH_INTERVAL_MS = 1000;
const THUMBNAIL_SIZE = { width: 320, height: 180 };

async function listSources(): Promise<{ items: FontePickerItem[]; bySourceId: Map<string, DesktopCapturerSource> }> {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: THUMBNAIL_SIZE,
  });
  const bySourceId = new Map(sources.map((s) => [s.id, s]));
  const items = sources.map(
    (s): FontePickerItem => ({
      id: s.id,
      name: s.name,
      kind: s.id.startsWith("screen") ? "screen" : "window",
      thumbnailDataUrl: s.thumbnail.toDataURL(),
    }),
  );
  return { items, bySourceId };
}

/**
 * Abre a grade de Fontes (monitores e janelas), atualizada enquanto está aberta, e resolve com a
 * Fonte escolhida ou `null` se cancelada. É este handler que substitui o seletor da Microsoft
 * (spec 0003, "Captura").
 */
export function openFontePicker(parent: BrowserWindow): Promise<DesktopCapturerSource | null> {
  return new Promise((resolve) => {
    let latestBySourceId = new Map<string, DesktopCapturerSource>();
    let settled = false;

    const picker = new BrowserWindow({
      width: 820,
      height: 600,
      minWidth: 480,
      minHeight: 360,
      parent,
      modal: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      autoHideMenuBar: true,
      title: "Escolher Fonte",
      webPreferences: {
        preload: join(__dirname, "../preload/index.mjs"),
        sandbox: false,
      },
    });

    const refresh = async (): Promise<void> => {
      const { items, bySourceId } = await listSources();
      latestBySourceId = bySourceId;
      if (!picker.isDestroyed()) {
        picker.webContents.send(IPC_CHANNELS.pickerSources, items);
      }
    };

    const interval = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    function settle(result: DesktopCapturerSource | null): void {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      ipcMain.removeListener(IPC_CHANNELS.pickerCancel, onCancel);
      ipcMain.removeHandler(IPC_CHANNELS.pickerChoose);
      resolve(result);
      if (!picker.isDestroyed()) picker.close();
    }

    function onCancel(): void {
      settle(null);
    }

    ipcMain.handle(IPC_CHANNELS.pickerChoose, (_event, sourceId: string) => {
      settle(latestBySourceId.get(sourceId) ?? null);
    });
    ipcMain.on(IPC_CHANNELS.pickerCancel, onCancel);

    picker.on("closed", () => settle(null));
    picker.once("ready-to-show", () => {
      picker.show();
      void refresh();
    });

    const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
    if (devServerUrl) {
      void picker.loadURL(`${devServerUrl}#/picker`);
    } else {
      void picker.loadFile(join(__dirname, "../renderer/index.html"), { hash: "/picker" });
    }
  });
}
