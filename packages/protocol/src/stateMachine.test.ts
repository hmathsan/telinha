import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { MAX_PARTICIPANTES, MAX_TRANSMISSORES } from "./limits.js";
import type { SessaoState } from "./stateMachine.js";
import { createSessao, processMessage } from "./stateMachine.js";
import { PROTOCOL_VERSION } from "./version.js";
import type { SignalerToAppMessage } from "./messages.js";

function newSessao(anfitriaoName = "Ana") {
  const anfitriaoId = randomUUID();
  const result = createSessao({
    participanteId: anfitriaoId,
    name: anfitriaoName,
    protocolVersion: PROTOCOL_VERSION,
    codigoDeSessao: "ABCDEF",
  });
  assert.ok(result.state, "sessao should have been created");
  return { state: result.state, anfitriaoId, codigoDeSessao: "ABCDEF" };
}

function messagesOfType<T extends SignalerToAppMessage["type"]>(
  effects: readonly { message: SignalerToAppMessage }[],
  type: T,
): Extract<SignalerToAppMessage, { type: T }>[] {
  return effects
    .map((e) => e.message)
    .filter((m): m is Extract<SignalerToAppMessage, { type: T }> => m.type === type);
}

/** Joins and gets approved by the anfitriao; returns the new state and the joiner's id. */
function joinAndApprove(
  state: SessaoState,
  anfitriaoId: string,
  name: string,
): { state: SessaoState; participanteId: string } {
  const participanteId = randomUUID();
  const request = processMessage(state, participanteId, {
    type: "join",
    codigoDeSessao: state.codigoDeSessao,
    name,
    protocolVersion: PROTOCOL_VERSION,
  });
  const approval = processMessage(request.state, anfitriaoId, {
    type: "respond-entry",
    participanteId,
    approved: true,
  });
  return { state: approval.state, participanteId };
}

test("handshake: create-sessao with an incompatible version is refused", () => {
  const result = createSessao({
    participanteId: randomUUID(),
    name: "Ana",
    protocolVersion: PROTOCOL_VERSION + 1,
    codigoDeSessao: "ABCDEF",
  });
  assert.equal(result.state, null);
  const [message] = messagesOfType(result.effects, "entry-refused");
  assert.equal(message?.reason, "incompatible-version");
});

test("handshake: join with an incompatible version is refused", () => {
  const { state } = newSessao();
  const result = processMessage(state, randomUUID(), {
    type: "join",
    codigoDeSessao: state.codigoDeSessao,
    name: "Bruno",
    protocolVersion: PROTOCOL_VERSION + 1,
  });
  const [message] = messagesOfType(result.effects, "entry-refused");
  assert.equal(message?.reason, "incompatible-version");
  assert.equal(result.state.participantes.size, 1, "nobody should have been added");
});

test("join with an invalid codigoDeSessao is refused", () => {
  const { state } = newSessao();
  const result = processMessage(state, randomUUID(), {
    type: "join",
    codigoDeSessao: "ZZZZZZ",
    name: "Bruno",
    protocolVersion: PROTOCOL_VERSION,
  });
  const [message] = messagesOfType(result.effects, "entry-refused");
  assert.equal(message?.reason, "invalid-code");
});

test("join admits as pending-approval and notifies only the anfitriao", () => {
  const { state, anfitriaoId } = newSessao();
  const participanteId = randomUUID();
  const result = processMessage(state, participanteId, {
    type: "join",
    codigoDeSessao: state.codigoDeSessao,
    name: "Bruno",
    protocolVersion: PROTOCOL_VERSION,
  });
  assert.equal(result.state.participantes.get(participanteId)?.state, "pending-approval");
  const [request] = messagesOfType(result.effects, "entry-request");
  assert.equal(request?.participanteId, participanteId);
  assert.equal(request?.name, "Bruno");
  assert.deepEqual(
    result.effects.find((e) => e.message.type === "entry-request")?.toParticipanteIds,
    [anfitriaoId],
  );
});

test("a participante pending approval can only send leave; anything else is discarded", () => {
  const { state, anfitriaoId } = newSessao();
  const pendingId = randomUUID();
  const { state: stateWithPending } = (() => {
    const r = processMessage(state, pendingId, {
      type: "join",
      codigoDeSessao: state.codigoDeSessao,
      name: "Pending",
      protocolVersion: PROTOCOL_VERSION,
    });
    return { state: r.state };
  })();

  const attemptRequestPalco = processMessage(stateWithPending, pendingId, {
    type: "request-palco",
  });
  assert.equal(attemptRequestPalco.effects.length, 0);
  assert.deepEqual(attemptRequestPalco.state, stateWithPending);

  const attemptExpel = processMessage(stateWithPending, pendingId, {
    type: "expel",
    participanteId: anfitriaoId,
  });
  assert.equal(attemptExpel.effects.length, 0);
  assert.deepEqual(attemptExpel.state, stateWithPending);

  const leave = processMessage(stateWithPending, pendingId, { type: "leave" });
  assert.equal(leave.state.participantes.has(pendingId), false);
});

test("respond-entry approved admits and notifies the roster and everyone else", () => {
  const { state, anfitriaoId } = newSessao();
  const { state: withBruno } = joinAndApprove(state, anfitriaoId, "Bruno");
  const carlosId = randomUUID();
  const request = processMessage(withBruno, carlosId, {
    type: "join",
    codigoDeSessao: withBruno.codigoDeSessao,
    name: "Carlos",
    protocolVersion: PROTOCOL_VERSION,
  });
  const result = processMessage(request.state, anfitriaoId, {
    type: "respond-entry",
    participanteId: carlosId,
    approved: true,
  });

  assert.equal(result.state.participantes.get(carlosId)?.state, "admitted");

  const [approved] = messagesOfType(result.effects, "entry-approved");
  assert.equal(approved?.participanteId, carlosId);
  assert.deepEqual(
    new Set(approved?.roster.map((p) => p.name)),
    new Set(["Ana", "Bruno", "Carlos"]),
  );

  const joinedEffect = result.effects.find((e) => e.message.type === "participante-joined");
  assert.ok(joinedEffect);
  assert.deepEqual(
    new Set(joinedEffect.toParticipanteIds),
    new Set([anfitriaoId, ...[...withBruno.participantes.keys()].filter((id) => id !== anfitriaoId)]),
  );
  assert.equal(
    joinedEffect.toParticipanteIds.includes(carlosId),
    false,
    "whoever joined does not get an echo of themselves",
  );
});

test("respond-entry refused removes the participante and notifies only them", () => {
  const { state, anfitriaoId } = newSessao();
  const participanteId = randomUUID();
  const request = processMessage(state, participanteId, {
    type: "join",
    codigoDeSessao: state.codigoDeSessao,
    name: "Bruno",
    protocolVersion: PROTOCOL_VERSION,
  });
  const result = processMessage(request.state, anfitriaoId, {
    type: "respond-entry",
    participanteId,
    approved: false,
  });

  assert.equal(result.state.participantes.has(participanteId), false);
  const [refused] = messagesOfType(result.effects, "entry-refused");
  assert.equal(refused?.reason, "refused-by-anfitriao");
  assert.deepEqual(
    result.effects.find((e) => e.message.type === "entry-refused")?.toParticipanteIds,
    [participanteId],
  );
});

test("respond-entry from someone who is not the anfitriao is discarded", () => {
  const { state, anfitriaoId } = newSessao();
  const { state: withBruno, participanteId: brunoId } = joinAndApprove(state, anfitriaoId, "Bruno");
  const carlosId = randomUUID();
  const request = processMessage(withBruno, carlosId, {
    type: "join",
    codigoDeSessao: withBruno.codigoDeSessao,
    name: "Carlos",
    protocolVersion: PROTOCOL_VERSION,
  });

  const result = processMessage(request.state, brunoId, {
    type: "respond-entry",
    participanteId: carlosId,
    approved: true,
  });

  assert.equal(result.effects.length, 0);
  assert.equal(result.state.participantes.get(carlosId)?.state, "pending-approval");
});

test("expel removes the participante and notifies everyone else, but not the one expelled", () => {
  const { state, anfitriaoId } = newSessao();
  const { state: withBruno, participanteId: brunoId } = joinAndApprove(state, anfitriaoId, "Bruno");
  const { state: withCarlos } = joinAndApprove(withBruno, anfitriaoId, "Carlos");

  const result = processMessage(withCarlos, anfitriaoId, {
    type: "expel",
    participanteId: brunoId,
  });

  assert.equal(result.state.participantes.has(brunoId), false);
  const effect = result.effects.find((e) => e.message.type === "participante-left");
  assert.ok(effect);
  assert.equal(effect.toParticipanteIds.includes(brunoId), false);
  assert.deepEqual((effect.message as { reason: string }).reason, "expelled");
});

test("expel from someone who is not the anfitriao is discarded", () => {
  const { state, anfitriaoId } = newSessao();
  const { state: withBruno, participanteId: brunoId } = joinAndApprove(state, anfitriaoId, "Bruno");
  const { state: withCarlos, participanteId: carlosId } = joinAndApprove(withBruno, anfitriaoId, "Carlos");

  const result = processMessage(withCarlos, brunoId, {
    type: "expel",
    participanteId: carlosId,
  });

  assert.equal(result.effects.length, 0);
  assert.equal(result.state.participantes.has(carlosId), true);
});

test("release-palco frees the slot and notifies everyone", () => {
  const { state, anfitriaoId } = newSessao();
  const request = processMessage(state, anfitriaoId, { type: "request-palco" });
  assert.deepEqual(request.state.transmissores, [anfitriaoId]);

  const result = processMessage(request.state, anfitriaoId, { type: "release-palco" });
  assert.deepEqual(result.state.transmissores, []);
  const [changed] = messagesOfType(result.effects, "transmissores-changed");
  assert.deepEqual(changed?.participanteIds, []);
});

test("leave from a regular participante notifies everyone else and frees their palco slot", () => {
  const { state, anfitriaoId } = newSessao();
  const { state: withBruno, participanteId: brunoId } = joinAndApprove(state, anfitriaoId, "Bruno");
  const withBrunoOnPalco = processMessage(withBruno, brunoId, { type: "request-palco" }).state;

  const result = processMessage(withBrunoOnPalco, brunoId, { type: "leave" });

  assert.equal(result.state.participantes.has(brunoId), false);
  assert.deepEqual(result.state.transmissores, []);
  const [left] = messagesOfType(result.effects, "participante-left");
  assert.equal(left?.reason, "left");
  const [changed] = messagesOfType(result.effects, "transmissores-changed");
  assert.deepEqual(changed?.participanteIds, []);
});

test("the anfitriao leaving ends the sessao for everyone", () => {
  const { state, anfitriaoId } = newSessao();
  const { state: withBruno, participanteId: brunoId } = joinAndApprove(state, anfitriaoId, "Bruno");

  const result = processMessage(withBruno, anfitriaoId, { type: "leave" });

  assert.equal(result.state.ended, true);
  const effect = result.effects.find((e) => e.message.type === "sessao-ended");
  assert.ok(effect);
  assert.deepEqual((effect.message as { reason: string }).reason, "anfitriao-left");
  assert.deepEqual(effect.toParticipanteIds, [brunoId]);
});

test("full mesh: 7 participantes, 2 transmissores, 8th refused, 3rd palco request denied", () => {
  const { state, anfitriaoId } = newSessao("Anfitriao");
  assert.equal(MAX_PARTICIPANTES, 7);
  assert.equal(MAX_TRANSMISSORES, 2);

  let current = state;
  const participanteIds: string[] = [anfitriaoId];
  for (let i = 0; i < MAX_PARTICIPANTES - 1; i++) {
    const r = joinAndApprove(current, anfitriaoId, `Participante ${i}`);
    current = r.state;
    participanteIds.push(r.participanteId);
  }
  assert.equal(current.participantes.size, MAX_PARTICIPANTES);

  const eighthId = randomUUID();
  const refusal = processMessage(current, eighthId, {
    type: "join",
    codigoDeSessao: current.codigoDeSessao,
    name: "Eighth",
    protocolVersion: PROTOCOL_VERSION,
  });
  const [entryRefused] = messagesOfType(refusal.effects, "entry-refused");
  assert.equal(entryRefused?.reason, "sessao-full");
  assert.equal(refusal.state.participantes.size, MAX_PARTICIPANTES);

  let withTransmissores = current;
  for (let i = 0; i < MAX_TRANSMISSORES; i++) {
    withTransmissores = processMessage(withTransmissores, participanteIds[i]!, {
      type: "request-palco",
    }).state;
  }
  assert.equal(withTransmissores.transmissores.length, MAX_TRANSMISSORES);

  const thirdRequest = processMessage(withTransmissores, participanteIds[MAX_TRANSMISSORES]!, {
    type: "request-palco",
  });
  const [denied] = messagesOfType(thirdRequest.effects, "palco-denied");
  assert.equal(denied?.reason, "palco-full");
  assert.equal(thirdRequest.state.transmissores.length, MAX_TRANSMISSORES);
});
