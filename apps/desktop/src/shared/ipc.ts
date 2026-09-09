import type { AppToSignalerMessage, SignalerToAppMessage } from "@scrn-broadcast/protocol";

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
  logsOpenFolder: "logs:open-folder",
  logWrite: "log:write",
  signalerUrl: "app:signaler-url",
  clipboardWrite: "app:clipboard-write",
  pickerOpen: "picker:open",
  pickerSources: "picker:sources",
  pickerChoose: "picker:choose",
  pickerCancel: "picker:cancel",
} as const;

/**
 * Uma Fonte candidata no seletor (main process, via `desktopCapturer.getSources`). A miniatura
 * já vem como data URL PNG, pronta para um `<img>`. O processo principal continua dono da
 * enumeração mesmo com o seletor virando modal na própria janela (spec 0008, "Seletor de Fonte").
 */
export interface FontePickerItem {
  readonly id: string;
  readonly name: string;
  readonly kind: "screen" | "window";
  readonly thumbnailDataUrl: string;
}

export interface PickerApi {
  /** O processo principal abre e fecha o modal: quem pede a Fonte é `getDisplayMedia`, não a UI. */
  onOpenChange(callback: (open: boolean) => void): () => void;
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
  /** Mensagem de falha ao gravar. Sem isto o botão parecia não fazer nada quando o disco recusava. */
  readonly error: string | null;
}

/**
 * Uma linha de log vinda do renderer. O arquivo é único e vive no processo principal (`main/log.ts`)
 * — o renderer não escreve em disco, manda por IPC como manda todo o resto.
 */
export interface LogEntry {
  readonly level: "info" | "warn" | "error";
  readonly message: string;
  readonly data?: unknown;
}

export interface ScrnBroadcastApi {
  getSignalerUrl(): Promise<string>;
  /**
   * `navigator.clipboard` depende de permissão do Chromium. O módulo `clipboard` do Electron não
   * depende — mas ele não existe no processo do renderer, então quem escreve é o principal.
   */
  copyToClipboard(text: string): void;
  connect(action: ConnectAction): void;
  send(message: AppToSignalerMessage): void;
  leave(): void;
  onMessage(callback: (message: SignalerToAppMessage) => void): () => void;
  onConnectionState(callback: (state: SignalingConnectionState) => void): () => void;
  exportDiagnostics(request: DiagnosticsExportRequest): Promise<DiagnosticsExportResult>;
  openLogsFolder(): void;
  log(entry: LogEntry): void;
}
