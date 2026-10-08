import { z } from "zod";

/**
 * O `payload` de `signal` é opaco para o sinalizador (spec 0001/0002): ele repassa sem inspecionar.
 * Isto é a fronteira em que este app valida sua própria forma para esse payload — SDP e ICE
 * candidates trocados entre cópias do app de Participantes diferentes, um binário que este lado
 * não controla.
 */
const sessionDescriptionLikeSchema = z.object({
  type: z.enum(["offer", "answer", "pranswer", "rollback"]),
  sdp: z.string().optional(),
});
export type SessionDescriptionLike = z.infer<typeof sessionDescriptionLikeSchema>;

const iceCandidateLikeSchema = z.object({
  candidate: z.string().optional(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});
export type IceCandidateLike = z.infer<typeof iceCandidateLikeSchema>;

export const meshSignalPayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("offer"),
    transmissorId: z.string(),
    espectadorId: z.string(),
    sdp: sessionDescriptionLikeSchema,
  }),
  z.object({
    kind: z.literal("answer"),
    transmissorId: z.string(),
    espectadorId: z.string(),
    sdp: sessionDescriptionLikeSchema,
  }),
  z.object({
    kind: z.literal("ice-candidate"),
    transmissorId: z.string(),
    espectadorId: z.string(),
    candidate: iceCandidateLikeSchema,
  }),
  // O único payload que anda no sentido contrário. Cada sentido da malha é uma
  // `RTCPeerConnection` própria, com detecção própria: quando o transporte morre, quem percebe
  // costuma ser o Espectador, e só o Transmissor pode ofertar. Sem isto, o lado que enxerga o
  // defeito não tem como pedir nada ao lado que consegue consertá-lo.
  z.object({
    kind: z.literal("recovery-request"),
    transmissorId: z.string(),
    espectadorId: z.string(),
    mode: z.enum(["ice-restart", "recreate"]),
  }),
  // Silenciar não aparece no fio: silêncio e "sem pacotes" não dizem ao Espectador que foi de
  // propósito (spec 0010, "Mensagem som-state"). Transmissor → Espectador.
  z.object({
    kind: z.literal("som-state"),
    transmissorId: z.string(),
    espectadorId: z.string(),
    ativo: z.boolean(),
  }),
]);

export type MeshSignalPayload = z.infer<typeof meshSignalPayloadSchema>;

export type ParsedMeshSignal =
  | { readonly ok: true; readonly payload: MeshSignalPayload }
  | { readonly ok: false; readonly issues: unknown };

/**
 * Valida a forma e, para `som-state`, o remetente: só o próprio Transmissor diz se o Som dele está
 * ativo. Qualquer outro remetente é descartado, e quem chama loga `mesh-signal-rejected`.
 */
export function parseMeshSignal(fromParticipanteId: string, raw: unknown): ParsedMeshSignal {
  const parsed = meshSignalPayloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues };
  if (parsed.data.kind === "som-state" && parsed.data.transmissorId !== fromParticipanteId) {
    return { ok: false, issues: "som-state-from-other-participante" };
  }
  return { ok: true, payload: parsed.data };
}

/** Chave de uma conexão da malha: uma por par (Transmissor, Espectador) — spec 0003, "Topologia". */
export function connectionKey(transmissorId: string, espectadorId: string): string {
  return `${transmissorId}>${espectadorId}`;
}
