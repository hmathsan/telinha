import type { AppToSignalerMessage, SignalerToAppMessage } from "@pvt-broadcast/protocol";

/**
 * Nomes de canal IPC entre `main` e `renderer`. O WebSocket de sinalização vive no processo
 * principal (spec 0002, "Configuração": "O cliente é um WebSocket do processo principal do
 * Electron, não um navegador") — o renderer nunca fala com o sinalizador diretamente.
 */
export const IPC_CHANNELS = {
  sessaoConnect: "sessao:connect",
  sessaoSend: "sessao:send",
  sessaoLeave: "sessao:leave",
  sessaoMessage: "sessao:message",
  sessaoConnectionState: "sessao:connection-state",
  diagnosticsExport: "diagnostics:export",
  signalerUrl: "app:signaler-url",
  pickerSources: "picker:sources",
  pickerChoose: "picker:choose",
  pickerCancel: "picker:cancel",
} as const;

/**
 * Uma Fonte candidata no seletor (main process, via `desktopCapturer.getSources`). A miniatura
 * já vem como data URL PNG, pronta para um `<img>` — o grid é "estilo Discord" (spec 0003).
 */
export interface FontePickerItem {
  readonly id: string;
  readonly name: string;
  readonly kind: "screen" | "window";
  readonly thumbnailDataUrl: string;
}

export interface PickerApi {
  onSources(callback: (sources: readonly FontePickerItem[]) => void): () => void;
  choose(sourceId: string): void;
  cancel(): void;
}

export type ConnectAction =
  | { readonly kind: "create"; readonly name: string }
  | { readonly kind: "join"; readonly name: string; readonly codigoDeSessao: string };

export type SignalingConnectionState =
  | { readonly status: "connecting" }
  | { readonly status: "open" }
  | { readonly status: "reconnecting"; readonly attempt: number; readonly delayMs: number }
  | { readonly status: "closed"; readonly reason: string };

export interface DiagnosticsExportRequest {
  readonly suggestedFileName: string;
  readonly content: string;
}

export interface DiagnosticsExportResult {
  readonly savedPath: string | null;
}

export interface PvtBroadcastApi {
  getSignalerUrl(): Promise<string>;
  connect(action: ConnectAction): void;
  send(message: AppToSignalerMessage): void;
  leave(): void;
  onMessage(callback: (message: SignalerToAppMessage) => void): () => void;
  onConnectionState(callback: (state: SignalingConnectionState) => void): () => void;
  exportDiagnostics(request: DiagnosticsExportRequest): Promise<DiagnosticsExportResult>;
}
