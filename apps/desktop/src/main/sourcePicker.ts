import { type BrowserWindow, type DesktopCapturerSource, desktopCapturer, ipcMain } from "electron";
import { rotularFontes } from "../shared/fonteLabels.js";
import { IPC_CHANNELS, type FontePickerItem } from "../shared/ipc.js";

const REFRESH_INTERVAL_MS = 1000;
const THUMBNAIL_SIZE = { width: 320, height: 180 };

async function listSources(): Promise<{ items: FontePickerItem[]; bySourceId: Map<string, DesktopCapturerSource> }> {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: THUMBNAIL_SIZE,
  });
  const bySourceId = new Map(sources.map((s) => [s.id, s]));
  const items = rotularFontes(
    sources.map(
      (s): FontePickerItem => ({
        id: s.id,
        name: s.name,
        kind: s.id.startsWith("screen") ? "screen" : "window",
        thumbnailDataUrl: s.thumbnail.toDataURL(),
      }),
    ),
  );
  return { items, bySourceId };
}

/** Cancela o seletor anterior se `getDisplayMedia` for chamado duas vezes sem resposta da primeira. */
let cancelActive: (() => void) | null = null;

/**
 * Enumera as Fontes e conduz o modal do seletor na própria janela principal (spec 0008, "Seletor
 * de Fonte"): sem `BrowserWindow` separada e sem roteamento por hash. O processo principal continua
 * dono da enumeração — `desktopCapturer.getSources()` roda aqui e a lista vai por IPC (spec 0003,
 * "Captura") —, e a atualização a cada segundo continua enquanto o seletor está aberto.
 *
 * Resolve com a Fonte escolhida, ou `null` se cancelada.
 */
export function openFontePicker(window: BrowserWindow): Promise<DesktopCapturerSource | null> {
  cancelActive?.();

  return new Promise((resolve) => {
    let latestBySourceId = new Map<string, DesktopCapturerSource>();
    let settled = false;

    function send(channel: string, payload: unknown): void {
      if (!window.isDestroyed()) window.webContents.send(channel, payload);
    }

    async function refresh(): Promise<void> {
      const { items, bySourceId } = await listSources();
      latestBySourceId = bySourceId;
      if (!settled) send(IPC_CHANNELS.pickerSources, items);
    }

    const interval = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);

    function settle(result: DesktopCapturerSource | null): void {
      if (settled) return;
      settled = true;
      cancelActive = null;
      clearInterval(interval);
      ipcMain.removeListener(IPC_CHANNELS.pickerCancel, onCancel);
      ipcMain.removeHandler(IPC_CHANNELS.pickerChoose);
      window.off("closed", onCancel);
      send(IPC_CHANNELS.pickerOpen, false);
      resolve(result);
    }

    function onCancel(): void {
      settle(null);
    }

    cancelActive = onCancel;
    ipcMain.handle(IPC_CHANNELS.pickerChoose, (_event, sourceId: string) => {
      settle(latestBySourceId.get(sourceId) ?? null);
    });
    ipcMain.on(IPC_CHANNELS.pickerCancel, onCancel);
    window.once("closed", onCancel);

    send(IPC_CHANNELS.pickerOpen, true);
    void refresh();
  });
}
