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

const createSessaoSchema = z.object({
  type: z.literal("create-sessao"),
  name: z.string().min(1),
  protocolVersion: z.number().int(),
});

const joinSchema = z.object({
  type: z.literal("join"),
  codigoDeSessao: z.string().length(6),
  name: z.string().min(1),
  protocolVersion: z.number().int(),
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

export const appToSignalerMessageSchema = z.discriminatedUnion("type", [
  createSessaoSchema,
  joinSchema,
  respondEntrySchema,
  expelSchema,
  requestPalcoSchema,
  releasePalcoSchema,
  signalSentSchema,
  leaveSchema,
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

const entryApprovedSchema = z.object({
  type: z.literal("entry-approved"),
  participanteId: participanteIdSchema,
  roster: z.array(participanteSchema),
  transmissores: z.array(participanteIdSchema),
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
  entryApprovedSchema,
  entryRefusedSchema,
  participanteJoinedSchema,
  participanteLeftSchema,
  transmissoresChangedSchema,
  signalReceivedSchema,
  sessaoEndedSchema,
  palcoDeniedSchema,
  iceServersSchema,
]);

export type SignalerToAppMessage = z.infer<typeof signalerToAppMessageSchema>;

export type SessaoCreated = z.infer<typeof sessaoCreatedSchema>;
export type EntryRequest = z.infer<typeof entryRequestSchema>;
export type EntryApproved = z.infer<typeof entryApprovedSchema>;
export type EntryRefused = z.infer<typeof entryRefusedSchema>;
export type ParticipanteJoined = z.infer<typeof participanteJoinedSchema>;
export type ParticipanteLeft = z.infer<typeof participanteLeftSchema>;
export type TransmissoresChanged = z.infer<typeof transmissoresChangedSchema>;
export type SignalReceived = z.infer<typeof signalReceivedSchema>;
export type SessaoEnded = z.infer<typeof sessaoEndedSchema>;
export type PalcoDenied = z.infer<typeof palcoDeniedSchema>;
export type IceServers = z.infer<typeof iceServersSchema>;

export type Participante = z.infer<typeof participanteSchema>;
