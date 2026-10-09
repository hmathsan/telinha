import { z } from "zod";

const participanteIdSchema = z.string().uuid();

const entryRefusedReasonSchema = z.enum([
  "incompatible-version",
  "invalid-code",
  "sessao-full",
  "refused-by-anfitriao",
]);
export type EntryRefusedReason = z.infer<typeof entryRefusedReasonSchema>;

const participanteLeftReasonSchema = z.enum(["left", "expelled", "disconnected"]);
export type ParticipanteLeftReason = z.infer<typeof participanteLeftReasonSchema>;

const sessaoEndedReasonSchema = z.enum(["anfitriao-left"]);
export type SessaoEndedReason = z.infer<typeof sessaoEndedReasonSchema>;

// Não faz parte da tabela original da spec 0001 — é uma extensão mínima decidida nesta sessão
// para cobrir a negação de `request-palco`, que a spec descreve em prosa ("responde negando com
// 'palco-full'") sem definir um tipo de mensagem para ela.
const palcoDeniedReasonSchema = z.enum(["palco-full"]);
export type PalcoDeniedReason = z.infer<typeof palcoDeniedReasonSchema>;

const iceServerSchema = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});
export type IceServer = z.infer<typeof iceServerSchema>;

const participanteSchema = z.object({
  id: participanteIdSchema,
  name: z.string().min(1),
});

// ---------------------------------------------------------------------------
// App -> Signaler
// ---------------------------------------------------------------------------

/**
 * Chave do pedido de entrada: um UUID sorteado uma vez por processo do app, reenviado em toda
 * tentativa. Não é identidade — não persiste, não autentica e some quando o app fecha (ver
 * [ADR 0010](../../../docs/adr/0010-chave-de-pedido-de-entrada.md)). Serve para o sinalizador
 * reconhecer que o pedido que está chegando vem do mesmo app que o pedido anterior, e substituir
 * um pelo outro em vez de somar dois Participantes com o mesmo humano atrás.
 */
const joinNonceSchema = z.string().uuid();

const createSessaoSchema = z.object({
  type: z.literal("create-sessao"),
  name: z.string().min(1),
  protocolVersion: z.number().int(),
  joinNonce: joinNonceSchema,
});

const joinSchema = z.object({
  type: z.literal("join"),
  codigoDeSessao: z.string().length(6),
  name: z.string().min(1),
  protocolVersion: z.number().int(),
  joinNonce: joinNonceSchema,
});

const respondEntrySchema = z.object({
  type: z.literal("respond-entry"),
  participanteId: participanteIdSchema,
  approved: z.boolean(),
});

const expelSchema = z.object({
  type: z.literal("expel"),
  participanteId: participanteIdSchema,
});

const requestPalcoSchema = z.object({
  type: z.literal("request-palco"),
});

const releasePalcoSchema = z.object({
  type: z.literal("release-palco"),
});

const signalSentSchema = z.object({
  type: z.literal("signal"),
  toParticipanteId: participanteIdSchema,
  payload: z.unknown(),
});

const leaveSchema = z.object({
  type: z.literal("leave"),
});

/**
 * Retomada (spec 0011): a primeira mensagem de uma conexão nova de quem caiu. O `joinNonce` é a
 * prova — o `participanteId` sozinho está no roster de todo mundo (ADR 0012).
 */
const resumeSchema = z.object({
  type: z.literal("resume"),
  codigoDeSessao: z.string().length(6),
  participanteId: participanteIdSchema,
  joinNonce: joinNonceSchema,
  protocolVersion: z.number().int(),
});

export const appToSignalerMessageSchema = z.discriminatedUnion("type", [
  createSessaoSchema,
  joinSchema,
  respondEntrySchema,
  expelSchema,
  requestPalcoSchema,
  releasePalcoSchema,
  signalSentSchema,
  leaveSchema,
  resumeSchema,
]);

export type AppToSignalerMessage = z.infer<typeof appToSignalerMessageSchema>;

export type CreateSessao = z.infer<typeof createSessaoSchema>;
export type Join = z.infer<typeof joinSchema>;
export type RespondEntry = z.infer<typeof respondEntrySchema>;
export type Expel = z.infer<typeof expelSchema>;
export type RequestPalco = z.infer<typeof requestPalcoSchema>;
export type ReleasePalco = z.infer<typeof releasePalcoSchema>;
export type SignalSent = z.infer<typeof signalSentSchema>;
export type Leave = z.infer<typeof leaveSchema>;
export type Resume = z.infer<typeof resumeSchema>;

// ---------------------------------------------------------------------------
// Signaler -> App
// ---------------------------------------------------------------------------

const sessaoCreatedSchema = z.object({
  type: z.literal("sessao-created"),
  codigoDeSessao: z.string().length(6),
  participanteId: participanteIdSchema,
});

const entryRequestSchema = z.object({
  type: z.literal("entry-request"),
  participanteId: participanteIdSchema,
  name: z.string().min(1),
});

// Sem ela, o pedido de quem desistiu (ou caiu) fica pendurado na fila do Anfitrião para sempre, e
// aprová-lo não faz nada, em silêncio, porque o Participante já não existe no estado. Entrou na
// tabela da spec 0001 junto com a regra do `joinNonce`.
const entryRequestWithdrawnSchema = z.object({
  type: z.literal("entry-request-withdrawn"),
  participanteId: participanteIdSchema,
});

const entryApprovedSchema = z.object({
  type: z.literal("entry-approved"),
  participanteId: participanteIdSchema,
  roster: z.array(participanteSchema),
  transmissores: z.array(participanteIdSchema),
});

const entryRequestEntrySchema = z.object({
  participanteId: participanteIdSchema,
  name: z.string().min(1),
});

/** `entryRequests` só vem preenchido para o Anfitrião, e substitui a fila dele (spec 0011). */
const resumedSchema = z.object({
  type: z.literal("resumed"),
  participanteId: participanteIdSchema,
  roster: z.array(participanteSchema),
  transmissores: z.array(participanteIdSchema),
  entryRequests: z.array(entryRequestEntrySchema),
});

// Um motivo só, de propósito: Sessão inexistente, Participante desconhecido e nonce errado são
// indistinguíveis para quem tenta.
const resumeRefusedSchema = z.object({
  type: z.literal("resume-refused"),
  reason: z.enum(["not-resumable"]),
});

const entryRefusedSchema = z.object({
  type: z.literal("entry-refused"),
  reason: entryRefusedReasonSchema,
});

const participanteJoinedSchema = z.object({
  type: z.literal("participante-joined"),
  participante: participanteSchema,
});

const participanteLeftSchema = z.object({
  type: z.literal("participante-left"),
  participanteId: participanteIdSchema,
  reason: participanteLeftReasonSchema,
});

const transmissoresChangedSchema = z.object({
  type: z.literal("transmissores-changed"),
  participanteIds: z.array(participanteIdSchema),
});

const signalReceivedSchema = z.object({
  type: z.literal("signal"),
  fromParticipanteId: participanteIdSchema,
  payload: z.unknown(),
});

const sessaoEndedSchema = z.object({
  type: z.literal("sessao-ended"),
  reason: sessaoEndedReasonSchema,
});

const palcoDeniedSchema = z.object({
  type: z.literal("palco-denied"),
  reason: palcoDeniedReasonSchema,
});

// Não faz parte da tabela original da spec 0001 — extensão mínima decidida na spec 0002 para
// carregar as credenciais STUN/TURN que o sinalizador emite ao admitir um Participante (ver
// "Credenciais TURN e o desligador de gasto" em docs/specs/0002-sinalizador.md). Quando o
// desligador de gasto está ativo, `iceServers` só contém entradas STUN.
const iceServersSchema = z.object({
  type: z.literal("ice-servers"),
  iceServers: z.array(iceServerSchema),
});

export const signalerToAppMessageSchema = z.discriminatedUnion("type", [
  sessaoCreatedSchema,
  entryRequestSchema,
  entryRequestWithdrawnSchema,
  entryApprovedSchema,
  entryRefusedSchema,
  participanteJoinedSchema,
  participanteLeftSchema,
  transmissoresChangedSchema,
  signalReceivedSchema,
  sessaoEndedSchema,
  palcoDeniedSchema,
  iceServersSchema,
  resumedSchema,
  resumeRefusedSchema,
]);

export type SignalerToAppMessage = z.infer<typeof signalerToAppMessageSchema>;

export type SessaoCreated = z.infer<typeof sessaoCreatedSchema>;
export type EntryRequest = z.infer<typeof entryRequestSchema>;
export type EntryRequestWithdrawn = z.infer<typeof entryRequestWithdrawnSchema>;
export type EntryApproved = z.infer<typeof entryApprovedSchema>;
export type EntryRefused = z.infer<typeof entryRefusedSchema>;
export type ParticipanteJoined = z.infer<typeof participanteJoinedSchema>;
export type ParticipanteLeft = z.infer<typeof participanteLeftSchema>;
export type TransmissoresChanged = z.infer<typeof transmissoresChangedSchema>;
export type SignalReceived = z.infer<typeof signalReceivedSchema>;
export type SessaoEnded = z.infer<typeof sessaoEndedSchema>;
export type PalcoDenied = z.infer<typeof palcoDeniedSchema>;
export type IceServers = z.infer<typeof iceServersSchema>;
export type Resumed = z.infer<typeof resumedSchema>;
export type ResumeRefused = z.infer<typeof resumeRefusedSchema>;

export type Participante = z.infer<typeof participanteSchema>;
