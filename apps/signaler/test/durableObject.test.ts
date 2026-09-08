import { MAX_PARTICIPANTES, PROTOCOL_VERSION } from "@pvt-broadcast/protocol";
import { expect, test } from "vitest";
import { connect, nextMessage, send } from "./helpers.js";

async function createSessao(name = "Ana") {
  const host = await connect("/sessao/create");
  send(host, { type: "create-sessao", name, protocolVersion: PROTOCOL_VERSION });
  const created = await nextMessage(host);
  if (created.type !== "sessao-created") throw new Error(`expected sessao-created, got ${created.type}`);
  await nextMessage(host); // ice-servers
  return { host, codigoDeSessao: created.codigoDeSessao };
}

async function joinAndApprove(codigoDeSessao: string, host: WebSocket, name: string) {
  const joiner = await connect(`/sessao/join?codigoDeSessao=${codigoDeSessao}`);
  send(joiner, { type: "join", codigoDeSessao, name, protocolVersion: PROTOCOL_VERSION });
  const entryRequest = await nextMessage(host);
  if (entryRequest.type !== "entry-request") throw new Error(`expected entry-request, got ${entryRequest.type}`);
  send(host, { type: "respond-entry", participanteId: entryRequest.participanteId, approved: true });
  const approved = await nextMessage(joiner);
  if (approved.type !== "entry-approved") throw new Error(`expected entry-approved, got ${approved.type}`);
  await nextMessage(joiner); // ice-servers
  return { joiner, participanteId: entryRequest.participanteId };
}

test("um cliente WebSocket consegue criar e entrar numa Sessao", async () => {
  const { host, codigoDeSessao } = await createSessao("Ana");
  expect(codigoDeSessao).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);

  const { joiner } = await joinAndApprove(codigoDeSessao, host, "Bruno");
  const joinedNotice = await nextMessage(host);
  expect(joinedNotice).toEqual({
    type: "participante-joined",
    participante: { id: expect.any(String), name: "Bruno" },
  });
  expect(joiner).toBeDefined();
});

test("sem TURN configurado, o sinalizador emite só STUN ao admitir", async () => {
  const host = await connect("/sessao/create");
  send(host, { type: "create-sessao", name: "Ana", protocolVersion: PROTOCOL_VERSION });
  await nextMessage(host); // sessao-created
  const iceServers = await nextMessage(host);
  expect(iceServers).toEqual({
    type: "ice-servers",
    iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
  });
});

test("join com codigoDeSessao inexistente e recusado com invalid-code", async () => {
  const joiner = await connect("/sessao/join?codigoDeSessao=ZZZZZZ");
  send(joiner, { type: "join", codigoDeSessao: "ZZZZZZ", name: "Bruno", protocolVersion: PROTOCOL_VERSION });
  const refused = await nextMessage(joiner);
  expect(refused).toEqual({ type: "entry-refused", reason: "invalid-code" });
});

test("join recusado pelo anfitriao gera entry-refused", async () => {
  const { host, codigoDeSessao } = await createSessao("Ana");
  const joiner = await connect(`/sessao/join?codigoDeSessao=${codigoDeSessao}`);
  send(joiner, { type: "join", codigoDeSessao, name: "Bruno", protocolVersion: PROTOCOL_VERSION });
  const entryRequest = await nextMessage(host);
  if (entryRequest.type !== "entry-request") throw new Error("expected entry-request");

  send(host, { type: "respond-entry", participanteId: entryRequest.participanteId, approved: false });
  const refused = await nextMessage(joiner);
  expect(refused).toEqual({ type: "entry-refused", reason: "refused-by-anfitriao" });
});

test("anfitriao desconectando derruba a Sessao para todos", async () => {
  const { host, codigoDeSessao } = await createSessao("Ana");
  const { joiner } = await joinAndApprove(codigoDeSessao, host, "Bruno");
  await nextMessage(host); // participante-joined

  host.close();
  const ended = await nextMessage(joiner);
  expect(ended).toEqual({ type: "sessao-ended", reason: "anfitriao-left" });
});

test("o oitavo participante e recusado com sessao-full", async () => {
  const { host, codigoDeSessao } = await createSessao("Anfitriao");

  for (let i = 0; i < MAX_PARTICIPANTES - 1; i++) {
    await joinAndApprove(codigoDeSessao, host, `Participante ${i}`);
    await nextMessage(host); // participante-joined
  }

  const eighth = await connect(`/sessao/join?codigoDeSessao=${codigoDeSessao}`);
  send(eighth, { type: "join", codigoDeSessao, name: "Eighth", protocolVersion: PROTOCOL_VERSION });
  const refused = await nextMessage(eighth);
  expect(refused).toEqual({ type: "entry-refused", reason: "sessao-full" });
});

test("um participante desconectando libera a vaga de Palco e notifica os demais", async () => {
  const { host, codigoDeSessao } = await createSessao("Ana");
  const { joiner: bruno } = await joinAndApprove(codigoDeSessao, host, "Bruno");
  await nextMessage(host); // participante-joined

  send(bruno, { type: "request-palco" });
  const transmissoresChanged = await nextMessage(host);
  expect(transmissoresChanged.type).toBe("transmissores-changed");

  bruno.close();
  const left = await nextMessage(host);
  expect(left).toEqual({
    type: "participante-left",
    participanteId: expect.any(String),
    reason: "disconnected",
  });
  const palcoFreed = await nextMessage(host);
  expect(palcoFreed).toEqual({ type: "transmissores-changed", participanteIds: [] });
});
