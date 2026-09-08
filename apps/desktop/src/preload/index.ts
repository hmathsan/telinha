import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { AppToSignalerMessage, SignalerToAppMessage } from "@pvt-broadcast/protocol";
import {
  IPC_CHANNELS,
  type ConnectAction,
  type DiagnosticsExportRequest,
  type DiagnosticsExportResult,
  type FontePickerItem,
  type PickerApi,
  type PvtBroadcastApi,
  type SignalingConnectionState,
} from "../shared/ipc.js";

/**
 * Preload único para a janela principal e para a grade de Fontes (spec 0003, "Captura"): expor
 * as duas APIs aqui é inofensivo em qualquer uma das janelas que não usa a outra, e evita manter
 * dois bundles de preload separados.
 */
const pvtBroadcast: PvtBroadcastApi = {
  getSignalerUrl: () => ipcRenderer.invoke(IPC_CHANNELS.signalerUrl) as Promise<string>,
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
};

const picker: PickerApi = {
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

contextBridge.exposeInMainWorld("pvtBroadcast", pvtBroadcast);
contextBridge.exposeInMainWorld("picker", picker);
