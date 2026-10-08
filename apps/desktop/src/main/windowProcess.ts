import { createRequire } from "node:module";
import { log } from "./log.js";

type GetWindowThreadProcessId = (hwnd: number, processId: [number]) => number;

let getWindowThreadProcessId: GetWindowThreadProcessId | null = null;

/**
 * `koffi` sai do `require` e não de um `import` no topo de propósito: o `import` carregaria o `.node`
 * junto com o processo principal, e um binário que não abre (asar, antivírus, arquitetura) derrubaria
 * o app no boot. Aqui ele carrega na primeira Fonte de janela, e uma falha fica nela.
 */
function loadGetWindowThreadProcessId(): GetWindowThreadProcessId {
  if (getWindowThreadProcessId) return getWindowThreadProcessId;
  const koffi: typeof import("koffi") = createRequire(import.meta.url)("koffi");
  const user32 = koffi.load("user32.dll");
  getWindowThreadProcessId = user32.func("__stdcall", "GetWindowThreadProcessId", "uint32", [
    "intptr",
    koffi.out(koffi.pointer("uint32")),
  ]);
  return getWindowThreadProcessId;
}

/**
 * O processo dono da janela, para o `applicationLoopback:<pid>` do Som (ADR 0011). Glue nativo, sem
 * teste unitário, como o `MeshManager`: o testável — `hwndFromSourceId` e a decisão — está em
 * `shared/media/somCapture.ts`.
 *
 * Nunca lança. `null` vira `pid-not-found`, e a Fonte vai sem Som.
 */
export function processIdOfWindow(hwnd: number): number | null {
  try {
    const out: [number] = [0];
    loadGetWindowThreadProcessId()(hwnd, out);
    return out[0] || null;
  } catch (error) {
    log.warn("window-process-lookup-failed", { message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
