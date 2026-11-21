import { shouldShowUpdateBanner, type UpdateDismissal, type UpdateStatus } from "../../shared/updateState.js";
import { IconDownload, IconX } from "./components/icons/index.js";

export interface UpdateBannerProps {
  readonly status: UpdateStatus;
  readonly dismissed: UpdateDismissal | null;
  readonly onInstall: () => void;
  readonly onDismiss: (dismissal: UpdateDismissal) => void;
}

/**
 * Faixa discreta de atualização no app (spec 0014): acompanha o download em segundo plano e,
 * quando a versão está pronta, oferece o botão para reiniciar e instalar sem modal nem interrupção.
 */
export function UpdateBanner({ status, dismissed, onInstall, onDismiss }: UpdateBannerProps) {
  if (!shouldShowUpdateBanner(status, dismissed) || status.kind === "idle") {
    return null;
  }

  const isReady = status.kind === "ready";
  const message = isReady
    ? `Telinha ${status.version} pronta para instalar.`
    : status.percent !== null
      ? `Baixando Telinha ${status.version}… ${status.percent}%`
      : `Baixando Telinha ${status.version}…`;

  return (
    <div
      className={`card ${isReady ? "card-accent" : "card-quiet"} flex flex-none items-center justify-between gap-3 text-sm`}
      role="status"
    >
      <span className="flex min-w-0 items-center gap-2">
        <IconDownload className="flex-none" />
        <span>{message}</span>
      </span>
      <span className="flex flex-none items-center gap-2">
        {isReady && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onInstall}>
            Reiniciar e instalar
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => onDismiss({ kind: status.kind, version: status.version })}
          title="Dispensar"
        >
          <IconX label="Dispensar" />
        </button>
      </span>
    </div>
  );
}
