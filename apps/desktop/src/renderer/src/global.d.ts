/// <reference types="vite/client" />
import type { PickerApi, ScrnBroadcastApi } from "../../shared/ipc.js";

declare global {
  interface Window {
    readonly scrnBroadcast: ScrnBroadcastApi;
    readonly picker: PickerApi;
  }
}

export {};
