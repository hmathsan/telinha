import assert from "node:assert/strict";
import { test } from "node:test";
import { appToSignalerMessageSchema, signalerToAppMessageSchema } from "./messages.js";

const idA = "11111111-1111-4111-8111-111111111111";
const idB = "22222222-2222-4222-8222-222222222222";
const nonce = "33333333-3333-4333-8333-333333333333";

test("every App -> Signaler message from the spec has a valid schema", () => {
  const examples = [
    { type: "create-sessao", name: "Ana", protocolVersion: 1, joinNonce: nonce },
    { type: "join", codigoDeSessao: "ABCDEF", name: "Bruno", protocolVersion: 1, joinNonce: nonce },
    { type: "respond-entry", participanteId: idA, approved: true },
    { type: "expel", participanteId: idA },
    { type: "request-palco" },
    { type: "release-palco" },
    { type: "signal", toParticipanteId: idA, payload: { sdp: "..." } },
    { type: "leave" },
  ];
  for (const example of examples) {
    assert.deepEqual(appToSignalerMessageSchema.parse(example), example);
  }
});

test("every Signaler -> App message from the spec has a valid schema", () => {
  const examples = [
    { type: "sessao-created", codigoDeSessao: "ABCDEF", participanteId: idA },
    { type: "entry-request", participanteId: idA, name: "Bruno" },
    { type: "entry-request-withdrawn", participanteId: idA },
    {
      type: "entry-approved",
      participanteId: idA,
      roster: [{ id: idA, name: "Ana" }],
      transmissores: [],
    },
    { type: "entry-refused", reason: "sessao-full" },
    { type: "participante-joined", participante: { id: idA, name: "Ana" } },
    { type: "participante-left", participanteId: idA, reason: "expelled" },
    { type: "transmissores-changed", participanteIds: [idA, idB] },
    { type: "signal", fromParticipanteId: idA, payload: { candidate: "..." } },
    { type: "sessao-ended", reason: "anfitriao-left" },
    { type: "palco-denied", reason: "palco-full" },
    {
      type: "ice-servers",
      iceServers: [
        { urls: "stun:stun.cloudflare.com:3478" },
        { urls: "turn:turn.cloudflare.com:3478", username: "u", credential: "c" },
      ],
    },
  ];
  for (const example of examples) {
    assert.deepEqual(signalerToAppMessageSchema.parse(example), example);
  }
});

test("rejects an unknown type", () => {
  assert.throws(() => appToSignalerMessageSchema.parse({ type: "hack-the-sessao" }));
  assert.throws(() => signalerToAppMessageSchema.parse({ type: "hack-the-sessao" }));
});

test("rejects a reason outside the enum", () => {
  assert.throws(() =>
    signalerToAppMessageSchema.parse({ type: "entry-refused", reason: "because-i-said-so" }),
  );
});

test("rejects a codigoDeSessao with the wrong length", () => {
  assert.throws(() =>
    appToSignalerMessageSchema.parse({
      type: "join",
      codigoDeSessao: "ABC",
      name: "Bruno",
      protocolVersion: 1,
      joinNonce: nonce,
    }),
  );
});

test("rejects a participanteId that is not a UUID", () => {
  assert.throws(() =>
    appToSignalerMessageSchema.parse({
      type: "expel",
      participanteId: "not-a-uuid",
    }),
  );
});
