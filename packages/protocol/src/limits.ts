/** Não são metas de performance: são o contrato da ADR 0002 (malha P2P sem SFU). */
export const MAX_PARTICIPANTES = 7;
export const MAX_TRANSMISSORES = 2;
/** Quanto tempo a Sessão espera quem caiu antes de tratá-lo como saído (spec 0011, ADR 0012). */
export const RETOMADA_TIMEOUT_MS = 60_000;
