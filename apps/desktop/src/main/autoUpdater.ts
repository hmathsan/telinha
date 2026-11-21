import { app } from "electron";
import electronUpdater from "electron-updater";
import { fakeUpdateVersion } from "../shared/hardening.js";
import { normalizeDownloadPercent, type UpdateStatus } from "../shared/updateState.js";
import { log } from "./log.js";

// electron-updater é CommonJS; a interop do ESM do Node não expõe `autoUpdater` como named
// export (SyntaxError em runtime), só o default.
const { autoUpdater } = electronUpdater;

/** Intervalo entre checagens periódicas em segundo plano (spec 0014). */
export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** Passo entre avanços do progresso no modo simulado de desenvolvimento. */
const FAKE_UPDATE_STEP_MS = 600;
const FAKE_UPDATE_STEPS = [0, 15, 30, 45, 60, 75, 90, 100] as const;

export interface AutoUpdaterController {
  getStatus(): UpdateStatus;
  install(): void;
  stop(): void;
}

function sameStatus(a: UpdateStatus, b: UpdateStatus): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "idle") return true;
  if (a.kind === "ready" && b.kind === "ready") return a.version === b.version;
  if (a.kind === "downloading" && b.kind === "downloading") {
    return a.version === b.version && a.percent === b.percent;
  }
  return false;
}

/**
 * Atualização em segundo plano com estado visível na interface (spec 0014). Baixa automaticamente
 * com delta via blockmap, mantém `autoInstallOnAppQuit` ligado como rede de segurança e expõe o
 * estado para o renderer oferecer o botão de reiniciar e instalar.
 *
 * Fora do app empacotado, o `electron-updater` não tem `app-update.yml`, então a checagem real não
 * roda; em vez disso, `SCRN_BROADCAST_FAKE_UPDATE` permite exercitar o fluxo de UI sem empacotar.
 */
export function startAutoUpdater(options: {
  readonly onStatusChange: (status: UpdateStatus) => void;
  readonly beforeInstall: () => void;
}): AutoUpdaterController {
  let status: UpdateStatus = { kind: "idle" };
  let stopped = false;

  function setStatus(next: UpdateStatus): void {
    if (sameStatus(status, next)) return;
    status = next;
    options.onStatusChange(next);
  }

  if (!app.isPackaged) {
    const fakeVersion = fakeUpdateVersion(app.isPackaged, process.env);
    if (!fakeVersion) {
      return {
        getStatus: () => status,
        install: () => {},
        stop: () => {
          stopped = true;
        },
      };
    }

    log.info("update-check-started");
    log.info("update-available", { version: fakeVersion });
    let stepIndex = 0;
    setStatus({ kind: "downloading", version: fakeVersion, percent: FAKE_UPDATE_STEPS[0] });

    const timer = setInterval(() => {
      if (stopped) {
        clearInterval(timer);
        return;
      }
      stepIndex += 1;
      const nextPercent = FAKE_UPDATE_STEPS[stepIndex];
      if (nextPercent !== undefined) {
        setStatus({ kind: "downloading", version: fakeVersion, percent: nextPercent });
        return;
      }
      clearInterval(timer);
      log.info("update-downloaded", { version: fakeVersion });
      setStatus({ kind: "ready", version: fakeVersion });
    }, FAKE_UPDATE_STEP_MS);

    return {
      getStatus: () => status,
      install: () => {
        if (status.kind !== "ready") return;
        log.info("update-install-simulated", { version: status.version });
        setStatus({ kind: "idle" });
      },
      stop: () => {
        stopped = true;
        clearInterval(timer);
      },
    };
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const onUpdateAvailable = (info: { readonly version: string }): void => {
    log.info("update-available", { version: info.version });
    setStatus({ kind: "downloading", version: info.version, percent: null });
  };

  const onUpdateNotAvailable = (info: { readonly version: string }): void => {
    log.info("update-not-available", { version: info.version });
  };

  const onDownloadProgress = (progress: { readonly percent: number }): void => {
    // Sem log por tique: download-progress dispara muitas vezes e poluiria o main.log.
    if (status.kind !== "downloading") return;
    setStatus({
      kind: "downloading",
      version: status.version,
      percent: normalizeDownloadPercent(progress.percent),
    });
  };

  const onUpdateDownloaded = (event: { readonly version: string }): void => {
    log.info("update-downloaded", { version: event.version });
    setStatus({ kind: "ready", version: event.version });
  };

  const onError = (error: Error, message?: string): void => {
    const errorMessage = error instanceof Error && error.message ? error.message : (message ?? String(error));
    log.warn("update-error", { message: errorMessage });
    setStatus({ kind: "idle" });
  };

  autoUpdater.on("update-available", onUpdateAvailable);
  autoUpdater.on("update-not-available", onUpdateNotAvailable);
  autoUpdater.on("download-progress", onDownloadProgress);
  autoUpdater.on("update-downloaded", onUpdateDownloaded);
  autoUpdater.on("error", onError);

  function checkNow(): void {
    if (stopped || status.kind === "downloading") return;
    log.info("update-check-started");
    autoUpdater.checkForUpdates().catch(() => {
      // O electron-updater já emite o evento "error" antes de rejeitar a promise; não duplicar log.
    });
  }

  checkNow();
  const interval = setInterval(checkNow, UPDATE_CHECK_INTERVAL_MS);

  return {
    getStatus: () => status,
    install: () => {
      if (status.kind !== "ready") return;
      log.info("update-install-requested", { version: status.version });
      options.beforeInstall();
      // Mantém o instalador NSIS interativo (oneClick: false em electron-builder.yml) e reabre ao terminar.
      autoUpdater.quitAndInstall(false, true);
    },
    stop: () => {
      stopped = true;
      clearInterval(interval);
      autoUpdater.off("update-available", onUpdateAvailable);
      autoUpdater.off("update-not-available", onUpdateNotAvailable);
      autoUpdater.off("download-progress", onDownloadProgress);
      autoUpdater.off("update-downloaded", onUpdateDownloaded);
      autoUpdater.off("error", onError);
    },
  };
}
