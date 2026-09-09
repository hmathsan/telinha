import { app } from "electron";
import { disabledHardwareAccelSwitches } from "../shared/hardening.js";

/**
 * Aplica as flags do Chromium que desligam a aceleração por hardware quando
 * `SCRN_BROADCAST_DISABLE_HW_ACCEL=1`. A regra — inclusive por que uma variável só cobre encode e
 * decode — está em `shared/hardening.ts`. Precisa rodar antes de `app.whenReady()`.
 */
export function applyHardwareAccelOverrides(): void {
  for (const switchName of disabledHardwareAccelSwitches(process.env)) {
    app.commandLine.appendSwitch(switchName);
  }
}
