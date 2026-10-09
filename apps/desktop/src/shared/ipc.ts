import type { AppToSignalerMessage, SignalerToAppMessage } from "@scrn-broadcast/protocol";
import type { SomCaptureDecision } from "./media/somCapture.js";

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
  somLastCapture: "som:last-capture",
  somRetryWithoutSom: "som:retry-without-som",
  somSupport: "som:support",
} as const;

/** O que o processo principal decidiu sobre o Som na última escolha do seletor (spec 0009). */
export interface SomCaptureReport {
  readonly fonteKind: "screen" | "window";
  readonly decision: SomCaptureDecision;
}

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
  /** `som: false` é o alternador "Transmitir com Som" desligado (spec 0010) — vira o motivo `som-off`. */
  choose(sourceId: string, options: PickerChooseOptions): void;
  cancel(): void;
}

export interface PickerChooseOptions {
  readonly som: boolean;
}

/** Se há Som possível para cada tipo de Fonte nesta máquina (spec 0010, "Seletor de Fonte"). */
export interface SomSupport {
  readonly window: boolean;
  readonly screen: boolean;
}

export type ConnectAction =
  | { readonly kind: "create"; readonly name: string }
  | { readonly kind: "join"; readonly name: string; readonly codigoDeSessao: string };

export type SignalingConnectionState =
  | { readonly status: "connecting" }
  | { readonly status: "open" }
  | { readonly status: "reconnecting"; readonly attempt: number; readonly delayMs: number }
  /** A Retomada foi recusada ou venceu, e o Espectador virou um pedido de entrada (spec 0011). */
  | { readonly status: "rejoining"; readonly codigoDeSessao: string; readonly name: string }
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
  /** `{ fonteKind, decision }` da última escolha do seletor, ou `null` se não houve uma com Som pedido. */
  getLastSomCapture(): Promise<SomCaptureReport | null>;
  /**
   * Arma um reenvio de uso único, válido por 10 s: o próximo `getDisplayMedia` recebe a mesma Fonte
   * só com vídeo, sem abrir o seletor. `false` quando a última escolha não tinha áudio a tirar — em
   * geral, porque a pessoa cancelou o seletor.
   */
  retryCaptureWithoutSom(): Promise<boolean>;
  getSomSupport(): Promise<SomSupport>;
}
