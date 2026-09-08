/// <reference types="vite/client" />
import type { PickerApi, PvtBroadcastApi } from "../../shared/ipc.js";

declare global {
  interface Window {
    readonly pvtBroadcast: PvtBroadcastApi;
    readonly picker: PickerApi;
  }
}

export {};
