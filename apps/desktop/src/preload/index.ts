import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { AppToSignalerMessage, SignalerToAppMessage } from "@scrn-broadcast/protocol";
import {
  IPC_CHANNELS,
  type ConnectAction,
  type DiagnosticsExportRequest,
  type DiagnosticsExportResult,
  type FontePickerItem,
  type LogEntry,
  type PickerApi,
  type ScrnBroadcastApi,
  type SignalingConnectionState,
} from "../shared/ipc.js";

/**
 * Bridge de contexto da janela principal — a única que existe. O seletor de Fonte é um modal
 * dentro dela (spec 0008, "Seletor de Fonte"), então `picker` fala com o mesmo renderer.
 */
const scrnBroadcast: ScrnBroadcastApi = {
  getSignalerUrl: () => ipcRenderer.invoke(IPC_CHANNELS.signalerUrl) as Promise<string>,
  copyToClipboard: (text: string) => ipcRenderer.send(IPC_CHANNELS.clipboardWrite, text),
  connect: (action: ConnectAction) => ipcRenderer.send(IPC_CHANNELS.sessaoConnect, action),
  send: (message: AppToSignalerMessage) => ipcRenderer.send(IPC_CHANNELS.sessaoSend, message),
  leave: () => ipcRenderer.send(IPC_CHANNELS.sessaoLeave),
  onMessage: (callback: (message: SignalerToAppMessage) => void) => {
    const listener = (_event: IpcRendererEvent, message: SignalerToAppMessage): void => callback(message);
    ipcRenderer.on(IPC_CHANNELS.sessaoMessage, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.sessaoMessage, listener);
  },
  onConnectionState: (callback: (state: SignalingConnectionState) => void) => {
    const listener = (_event: IpcRendererEvent, state: SignalingConnectionState): void => callback(state);
    ipcRenderer.on(IPC_CHANNELS.sessaoConnectionState, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.sessaoConnectionState, listener);
  },
  exportDiagnostics: (request: DiagnosticsExportRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.diagnosticsExport, request) as Promise<DiagnosticsExportResult>,
  openLogsFolder: () => ipcRenderer.send(IPC_CHANNELS.logsOpenFolder),
  log: (entry: LogEntry) => ipcRenderer.send(IPC_CHANNELS.logWrite, entry),
};

const picker: PickerApi = {
  onOpenChange: (callback: (open: boolean) => void) => {
    const listener = (_event: IpcRendererEvent, open: boolean): void => callback(open);
    ipcRenderer.on(IPC_CHANNELS.pickerOpen, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.pickerOpen, listener);
  },
  onSources: (callback: (sources: readonly FontePickerItem[]) => void) => {
    const listener = (_event: IpcRendererEvent, sources: readonly FontePickerItem[]): void => callback(sources);
    ipcRenderer.on(IPC_CHANNELS.pickerSources, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.pickerSources, listener);
  },
  choose: (sourceId: string) => {
    void ipcRenderer.invoke(IPC_CHANNELS.pickerChoose, sourceId);
  },
  cancel: () => ipcRenderer.send(IPC_CHANNELS.pickerCancel),
};

contextBridge.exposeInMainWorld("scrnBroadcast", scrnBroadcast);
contextBridge.exposeInMainWorld("picker", picker);
