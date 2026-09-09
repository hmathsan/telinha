/**
 * Duas decisões de endurecimento do app empacotado, isoladas aqui porque são regras — não
 * chamadas do Electron — e regras se testam sem abrir janela.
 */

/** Chave da válvula do DevTools. Ver `devToolsAllowed`. */
export const DEVTOOLS_ENV_VAR = "SCRN_BROADCAST_DEVTOOLS";

/** Chave que desliga a aceleração por hardware de vídeo, nos dois sentidos. */
export const DISABLE_HW_ACCEL_ENV_VAR = "SCRN_BROADCAST_DISABLE_HW_ACCEL";

/**
 * DevTools existe em desenvolvimento e some no app instalado. Não é fronteira de segurança:
 * a URL do sinalizador é pública ([ADR 0005](../../../../docs/adr/0005-repositorio-publico-por-causa-do-auto-update.md))
 * e o Código de Sessão é de quem está na Sessão. É acabamento — um app de release não tem menu
 * de View nem `Ctrl+Shift+I`.
 *
 * Como não protege nada, a válvula não custa nada: `SCRN_BROADCAST_DEVTOOLS=1` reabre num app
 * instalado, que é o que salva a tarde quando um problema só reproduz na máquina de outra pessoa.
 */
export function devToolsAllowed(isPackaged: boolean, env: Record<string, string | undefined>): boolean {
  if (!isPackaged) {
    return true;
  }
  return env[DEVTOOLS_ENV_VAR] === "1";
}

/**
 * As flags do Chromium que desligam a aceleração por hardware de vídeo. Uma chave só cobre os
 * dois lados de propósito: quem transmite depende do **encoder**, quem assiste depende do
 * **decoder**, e quem relata "a transmissão está ruim" quase nunca sabe de que lado está o
 * problema. Duas variáveis fariam a pessoa mexer na metade errada.
 *
 * Também é o que exercita manualmente a queda para encoder por software do "Pronto quando" da
 * spec 0003. Variável de ambiente, e não argumento de linha de comando, porque `npm run dev` não
 * repassa argumentos desconhecidos ao Electron (vira `EUNKNOWNCONFIG` no próprio npm).
 */
export function disabledHardwareAccelSwitches(
  env: Record<string, string | undefined>,
): readonly string[] {
  if (env[DISABLE_HW_ACCEL_ENV_VAR] !== "1") {
    return [];
  }
  return ["disable-accelerated-video-encode", "disable-accelerated-video-decode"];
}
