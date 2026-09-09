import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { MAX_PARTICIPANTES, MAX_TRANSMISSORES } from "./limits.js";
import type { SessaoState } from "./stateMachine.js";
import { createSessao, processLeave, processMessage } from "./stateMachine.js";
import { PROTOCOL_VERSION } from "./version.js";
import type { SignalerToAppMessage } from "./messages.js";

function newSessao(anfitriaoName = "Ana") {
  const anfitriaoId = randomUUID();
  const result = createSessao({
    participanteId: anfitriaoId,
    name: anfitriaoName,
    protocolVersion: PROTOCOL_VERSION,
    joinNonce: randomUUID(),
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
    joinNonce: randomUUID(),
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
    joinNonce: randomUUID(),
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
    joinNonce: randomUUID(),
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
    joinNonce: randomUUID(),
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
    joinNonce: randomUUID(),
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
      joinNonce: randomUUID(),
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
    joinNonce: randomUUID(),
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
    joinNonce: randomUUID(),
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
    joinNonce: randomUUID(),
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

test("processLeave with reason 'disconnected' reports that instead of 'left'", () => {
  const { state, anfitriaoId } = newSessao();
  const { state: withBruno, participanteId: brunoId } = joinAndApprove(state, anfitriaoId, "Bruno");

  const result = processLeave(withBruno, brunoId, "disconnected");

  assert.equal(result.state.participantes.has(brunoId), false);
  const [left] = messagesOfType(result.effects, "participante-left");
  assert.equal(left?.reason, "disconnected");
});

test("processLeave with reason 'disconnected' for the anfitriao still ends the sessao as 'anfitriao-left'", () => {
  const { state, anfitriaoId } = newSessao();
  const { state: withBruno } = joinAndApprove(state, anfitriaoId, "Bruno");

  const result = processLeave(withBruno, anfitriaoId, "disconnected");

  assert.equal(result.state.ended, true);
  const effect = result.effects.find((e) => e.message.type === "sessao-ended");
  assert.deepEqual((effect?.message as { reason: string }).reason, "anfitriao-left");
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
    joinNonce: randomUUID(),
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

// ---------------------------------------------------------------------------
// Pedido de entrada: retirada e chave de pedido (ADR 0010)
// ---------------------------------------------------------------------------

test("a pending participante leaving withdraws the request from the anfitriao's queue", () => {
  const { state, anfitriaoId } = newSessao();
  const bruno = randomUUID();
  const joined = processMessage(state, bruno, {
    type: "join",
    codigoDeSessao: state.codigoDeSessao,
    name: "Bruno",
    protocolVersion: PROTOCOL_VERSION,
    joinNonce: randomUUID(),
  });

  const left = processLeave(joined.state, bruno, "disconnected");

  const [withdrawn] = messagesOfType(left.effects, "entry-request-withdrawn");
  assert.equal(withdrawn?.participanteId, bruno);
  assert.deepEqual(left.effects[0]?.toParticipanteIds, [anfitriaoId]);
  assert.equal(left.state.participantes.has(bruno), false);
});

test("joining again with the same joinNonce replaces the pending request instead of adding one", () => {
  const { state, anfitriaoId } = newSessao();
  const joinNonce = randomUUID();
  const first = randomUUID();
  const second = randomUUID();

  const one = processMessage(state, first, {
    type: "join",
    codigoDeSessao: state.codigoDeSessao,
    name: "Bruno",
    protocolVersion: PROTOCOL_VERSION,
    joinNonce,
  });
  const two = processMessage(one.state, second, {
    type: "join",
    codigoDeSessao: state.codigoDeSessao,
    name: "Bruno",
    protocolVersion: PROTOCOL_VERSION,
    joinNonce,
  });

  assert.equal(two.state.participantes.has(first), false);
  assert.equal(two.state.participantes.get(second)?.state, "pending-approval");
  assert.equal(two.state.participantes.size, 2, "anfitriao plus one pending, not two pending");

  const [withdrawn] = messagesOfType(two.effects, "entry-request-withdrawn");
  assert.equal(withdrawn?.participanteId, first);
  const [request] = messagesOfType(two.effects, "entry-request");
  assert.equal(request?.participanteId, second);
  assert.deepEqual(
    two.effects.map((e) => e.toParticipanteIds),
    [[anfitriaoId], [anfitriaoId]],
  );
});

test("an admitted ghost with the same joinNonce is replaced, and the roster does not duplicate", () => {
  const { state, anfitriaoId } = newSessao();
  const joinNonce = randomUUID();
  const ghost = randomUUID();

  const requested = processMessage(state, ghost, {
    type: "join",
    codigoDeSessao: state.codigoDeSessao,
    name: "Bruno",
    protocolVersion: PROTOCOL_VERSION,
    joinNonce,
  });
  const approved = processMessage(requested.state, anfitriaoId, {
    type: "respond-entry",
    participanteId: ghost,
    approved: true,
  });

  const fresh = randomUUID();
  const rejoined = processMessage(approved.state, fresh, {
    type: "join",
    codigoDeSessao: state.codigoDeSessao,
    name: "Bruno",
    protocolVersion: PROTOCOL_VERSION,
    joinNonce,
  });

  assert.equal(rejoined.state.participantes.has(ghost), false);
  assert.equal(rejoined.state.participantes.size, 2, "anfitriao plus the fresh pending request");
  const [left] = messagesOfType(rejoined.effects, "participante-left");
  assert.equal(left?.participanteId, ghost);
  assert.equal(left?.reason, "disconnected");
});

test("a ghost transmissor replaced by its own rejoin frees the palco slot", () => {
  const { state, anfitriaoId } = newSessao();
  const joinNonce = randomUUID();
  const ghost = randomUUID();

  const requested = processMessage(state, ghost, {
    type: "join",
    codigoDeSessao: state.codigoDeSessao,
    name: "Bruno",
    protocolVersion: PROTOCOL_VERSION,
    joinNonce,
  });
  const approved = processMessage(requested.state, anfitriaoId, {
    type: "respond-entry",
    participanteId: ghost,
    approved: true,
  });
  const transmitting = processMessage(approved.state, ghost, { type: "request-palco" });
  assert.deepEqual(transmitting.state.transmissores, [ghost]);

  const rejoined = processMessage(transmitting.state, randomUUID(), {
    type: "join",
    codigoDeSessao: state.codigoDeSessao,
    name: "Bruno",
    protocolVersion: PROTOCOL_VERSION,
    joinNonce,
  });

  assert.deepEqual(rejoined.state.transmissores, []);
  const [changed] = messagesOfType(rejoined.effects, "transmissores-changed");
  assert.deepEqual(changed?.participanteIds, []);
});

test("a ghost does not steal the last slot from its own rejoin", () => {
  let { state, anfitriaoId } = newSessao();
  const joinNonce = randomUUID();
  let ghost = "";

  // Enche a Sessao ate o limite, com o ultimo admitido carregando o joinNonce que voltara.
  for (let i = 0; i < MAX_PARTICIPANTES - 1; i += 1) {
    const participanteId = randomUUID();
    const requested = processMessage(state, participanteId, {
      type: "join",
      codigoDeSessao: state.codigoDeSessao,
      name: `P${i}`,
      protocolVersion: PROTOCOL_VERSION,
      joinNonce: i === MAX_PARTICIPANTES - 2 ? joinNonce : randomUUID(),
    });
    const approved = processMessage(requested.state, anfitriaoId, {
      type: "respond-entry",
      participanteId,
      approved: true,
    });
    state = approved.state;
    if (i === MAX_PARTICIPANTES - 2) ghost = participanteId;
  }
  assert.equal(state.participantes.size, MAX_PARTICIPANTES);

  const rejoined = processMessage(state, randomUUID(), {
    type: "join",
    codigoDeSessao: state.codigoDeSessao,
    name: "Voltei",
    protocolVersion: PROTOCOL_VERSION,
    joinNonce,
  });

  assert.equal(messagesOfType(rejoined.effects, "entry-refused").length, 0, "the rejoin is not sessao-full");
  assert.equal(messagesOfType(rejoined.effects, "entry-request").length, 1);
  assert.equal(rejoined.state.participantes.has(ghost), false);
});
