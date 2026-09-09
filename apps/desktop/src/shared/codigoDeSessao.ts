/**
 * Formatação do Código de Sessão para exibição e leitura do que a pessoa digita.
 *
 * São seis caracteres, e só seis: o schema do protocolo é `z.string().length(6)`
 * (`packages/protocol/src/messages.ts`). O respiro no meio (`ABC DEF`) é só visual — o valor que
 * viaja no protocolo nunca leva o separador.
 */

export const CODIGO_DE_SESSAO_LENGTH = 6;

const GROUP_SIZE = 3;

/** O que a pessoa digitou, reduzido ao que o protocolo aceita: A–Z e 0–9, maiúsculas, seis. */
export function normalizeCodigoDeSessao(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODIGO_DE_SESSAO_LENGTH);
}

/** `ABCDEF` -> `ABC DEF`. Aceita códigos parciais, para o campo poder formatar enquanto se digita. */
export function formatCodigoDeSessao(codigo: string): string {
  const normalized = normalizeCodigoDeSessao(codigo);
  if (normalized.length <= GROUP_SIZE) return normalized;
  return `${normalized.slice(0, GROUP_SIZE)} ${normalized.slice(GROUP_SIZE)}`;
}

export function isCodigoDeSessaoCompleto(codigo: string): boolean {
  return normalizeCodigoDeSessao(codigo).length === CODIGO_DE_SESSAO_LENGTH;
}
