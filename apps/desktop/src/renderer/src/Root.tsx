import { useSyncExternalStore } from "react";
import { App } from "./App.js";
import { PickerScreen } from "./PickerScreen.js";

function subscribeToHash(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

/**
 * A grade de Fontes é uma janela separada carregando o mesmo bundle com `#/picker` (spec 0003,
 * "Captura") — evita manter um segundo entry point de Vite só para uma UI pequena.
 */
export function Root() {
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash);
  return hash === "#/picker" ? <PickerScreen /> : <App />;
}
