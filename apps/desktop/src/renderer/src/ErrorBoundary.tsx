import { Component, type ErrorInfo, type ReactNode } from "react";
import { logToMain } from "./log.js";

interface ErrorBoundaryState {
  readonly message: string | null;
}

/**
 * Sem isto, um erro em qualquer componente desmontava a árvore inteira: janela em branco, sem
 * mensagem e sem nada em lugar nenhum. Agora o erro vai para o arquivo de log e a pessoa vê o que
 * fazer com ele.
 */
export class ErrorBoundary extends Component<{ readonly children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logToMain("error", "react-error-boundary", { message: error.message, stack: error.stack, componentStack: info.componentStack });
  }

  render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card card-danger flex flex-col items-start gap-3">
          <h3>O aplicativo encontrou um erro</h3>
          <p className="text-sm">{this.state.message}</p>
          <p className="field-hint">
            O erro foi gravado no log. Reinicie o Telinha e anexe o arquivo ao relatar o problema.
          </p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.scrnBroadcast.openLogsFolder()}>
            Abrir pasta de logs
          </button>
        </div>
      </div>
    );
  }
}
