import { PROTOCOL_VERSION, RETOMADA_TIMEOUT_MS, type InternalParticipante } from "@scrn-broadcast/protocol";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect, test, vi } from "vitest";
import type { Env } from "../src/env.js";
import { closeOf, connect, expectNoMessage, nextMessage, send } from "./helpers.js";

interface Stored {
  codigoDeSessao: string;
  protocolVersion: number;
  anfitriaoId: string;
  participantes: InternalParticipante[];
  transmissores: string[];
  ended: boolean;
}

function stubFor(codigoDeSessao: string) {
  const typedEnv = env as unknown as Env;
  return typedEnv.SESSAO.get(typedEnv.SESSAO.idFromName(codigoDeSessao));
}

function readSessao(codigoDeSessao: string): Promise<Stored | undefined> {
  return runInDurableObject(stubFor(codigoDeSessao), async (_instance, state) => {
    const raw = await state.storage.get<string>("sessao");
    return raw === undefined ? undefined : (JSON.parse(raw) as Stored);
  });
}

function writeSessao(codigoDeSessao: string, sessao: Stored): Promise<void> {
  return runInDurableObject(stubFor(codigoDeSessao), (_instance, state) =>
    state.storage.put("sessao", JSON.stringify(sessao)),
  );
}

/** O fechamento chega ao Durable Object de forma assíncrona; espera ele marcar a queda. */
async function waitUntilFallen(codigoDeSessao: string, participanteId: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    const sessao = await readSessao(codigoDeSessao);
    if (sessao?.participantes.find((p) => p.id === participanteId)?.state === "fallen") return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`${participanteId} never fell`);
}

/** Empurra o `fallenAt` de todo caído para antes do prazo, como se o tempo tivesse passado. */
async function expireFallen(codigoDeSessao: string): Promise<void> {
  const sessao = await readSessao(codigoDeSessao);
  if (!sessao) throw new Error("no sessao");
  for (const p of sessao.participantes) {
    if (p.state === "fallen") p.fallenAt = Date.now() - RETOMADA_TIMEOUT_MS - 1;
  }
  await writeSessao(codigoDeSessao, sessao);
}

async function createSessao() {
  const joinNonce = crypto.randomUUID();
  const host = await connect("/sessao/create");
  send(host, { type: "create-sessao", name: "Ana", protocolVersion: PROTOCOL_VERSION, joinNonce });
  const created = await nextMessage(host);
  if (created.type !== "sessao-created") throw new Error(`expected sessao-created, got ${created.type}`);
  await nextMessage(host); // ice-servers
  return { host, codigoDeSessao: created.codigoDeSessao, anfitriaoId: created.participanteId, joinNonce };
}

async function joinAndApprove(codigoDeSessao: string, host: WebSocket, name: string) {
  const joinNonce = crypto.randomUUID();
  const joiner = await connect(`/sessao/join?codigoDeSessao=${codigoDeSessao}`);
  send(joiner, { type: "join", codigoDeSessao, name, protocolVersion: PROTOCOL_VERSION, joinNonce });
  const request = await nextMessage(host);
  if (request.type !== "entry-request") throw new Error(`expected entry-request, got ${request.type}`);
  send(host, { type: "respond-entry", participanteId: request.participanteId, approved: true });
  const approved = await nextMessage(joiner);
  if (approved.type !== "entry-approved") throw new Error(`expected entry-approved, got ${approved.type}`);
  await nextMessage(joiner); // ice-servers
  await nextMessage(host); // participante-joined
  return { joiner, participanteId: request.participanteId, joinNonce };
}

async function resume(codigoDeSessao: string, participanteId: string, joinNonce: string) {
  const ws = await connect(`/sessao/join?codigoDeSessao=${codigoDeSessao}`);
  send(ws, { type: "resume", codigoDeSessao, participanteId, joinNonce, protocolVersion: PROTOCOL_VERSION });
  return ws;
}

test("o Espectador cai, retoma com o mesmo id, e o Anfitrião não vê saída", async () => {
  const { host, codigoDeSessao } = await createSessao();
  const bruno = await joinAndApprove(codigoDeSessao, host, "Bruno");

  bruno.joiner.close();
  await waitUntilFallen(codigoDeSessao, bruno.participanteId);

  const back = await resume(codigoDeSessao, bruno.participanteId, bruno.joinNonce);
  const resumed = await nextMessage(back);
  expect(resumed).toEqual({
    type: "resumed",
    participanteId: bruno.participanteId,
    roster: expect.arrayContaining([expect.objectContaining({ name: "Ana" }), { id: bruno.participanteId, name: "Bruno" }]),
    transmissores: [],
    entryRequests: [],
  });
  expect((await nextMessage(back)).type).toBe("ice-servers");
  await expectNoMessage(host);

  // A conexão nova fala pelo id retomado.
  send(host, { type: "signal", toParticipanteId: bruno.participanteId, payload: { ok: true } });
  expect(await nextMessage(back)).toEqual({ type: "signal", fromParticipanteId: expect.any(String), payload: { ok: true } });
});

test("o Anfitrião cai: ninguém vê o fim da Sessão até o prazo vencer", async () => {
  const { host, codigoDeSessao, anfitriaoId } = await createSessao();
  const bruno = await joinAndApprove(codigoDeSessao, host, "Bruno");

  host.close();
  await waitUntilFallen(codigoDeSessao, anfitriaoId);
  expect(await runDurableObjectAlarm(stubFor(codigoDeSessao))).toBe(true);
  await expectNoMessage(bruno.joiner);

  await expireFallen(codigoDeSessao);
  expect(await runDurableObjectAlarm(stubFor(codigoDeSessao))).toBe(true);
  expect(await nextMessage(bruno.joiner)).toEqual({ type: "sessao-ended", reason: "anfitriao-left" });
  expect(await readSessao(codigoDeSessao)).toBeUndefined();
});

test("um Transmissor caído perde a vaga de Palco quando o prazo vence", async () => {
  const { host, codigoDeSessao } = await createSessao();
  const bruno = await joinAndApprove(codigoDeSessao, host, "Bruno");
  send(bruno.joiner, { type: "request-palco" });
  expect((await nextMessage(host)).type).toBe("transmissores-changed");

  bruno.joiner.close();
  await waitUntilFallen(codigoDeSessao, bruno.participanteId);
  await expectNoMessage(host);

  await expireFallen(codigoDeSessao);
  await runDurableObjectAlarm(stubFor(codigoDeSessao));
  expect(await nextMessage(host)).toEqual({
    type: "participante-left",
    participanteId: bruno.participanteId,
    reason: "disconnected",
  });
  expect(await nextMessage(host)).toEqual({ type: "transmissores-changed", participanteIds: [] });
});

test("resume com nonce errado é recusado sem fechar, e um join na mesma conexão vira pedido", async () => {
  const { host, codigoDeSessao } = await createSessao();
  const bruno = await joinAndApprove(codigoDeSessao, host, "Bruno");
  bruno.joiner.close();
  await waitUntilFallen(codigoDeSessao, bruno.participanteId);

  const attempt = await resume(codigoDeSessao, bruno.participanteId, crypto.randomUUID());
  expect(await nextMessage(attempt)).toEqual({ type: "resume-refused", reason: "not-resumable" });

  send(attempt, { type: "join", codigoDeSessao, name: "Bruno", protocolVersion: PROTOCOL_VERSION, joinNonce: crypto.randomUUID() });
  const request = await nextMessage(host);
  expect(request).toEqual({ type: "entry-request", participanteId: expect.any(String), name: "Bruno" });
});

test("resume com o socket antigo ainda aberto fecha o antigo e ninguém vê saída", async () => {
  const { host, codigoDeSessao } = await createSessao();
  const bruno = await joinAndApprove(codigoDeSessao, host, "Bruno");

  const back = await resume(codigoDeSessao, bruno.participanteId, bruno.joinNonce);
  expect((await nextMessage(back)).type).toBe("resumed");
  expect((await closeOf(bruno.joiner)).reason).toBe("substituido-pela-retomada");

  await expectNoMessage(host);
  const sessao = await readSessao(codigoDeSessao);
  expect(sessao?.participantes.find((p) => p.id === bruno.participanteId)?.state).toBe("admitted");
});

test("o Anfitrião volta e recebe os pedidos que chegaram enquanto estava caído", async () => {
  const { host, codigoDeSessao, anfitriaoId, joinNonce } = await createSessao();
  host.close();
  await waitUntilFallen(codigoDeSessao, anfitriaoId);

  const carlos = await connect(`/sessao/join?codigoDeSessao=${codigoDeSessao}`);
  send(carlos, { type: "join", codigoDeSessao, name: "Carlos", protocolVersion: PROTOCOL_VERSION, joinNonce: crypto.randomUUID() });
  await expectNoMessage(carlos);

  const back = await resume(codigoDeSessao, anfitriaoId, joinNonce);
  const resumed = await nextMessage(back);
  if (resumed.type !== "resumed") throw new Error(`expected resumed, got ${resumed.type}`);
  expect(resumed.entryRequests).toEqual([{ participanteId: expect.any(String), name: "Carlos" }]);
});

test("reinício do objeto: a Sessão no storage sem sockets é retomada, e a vigia a encerra se o Anfitrião não volta", async () => {
  const codigoDeSessao = "RSTART";
  const [ana, bruno, carlos] = [0, 1, 2].map((i) => ({
    id: crypto.randomUUID(),
    name: ["Ana", "Bruno", "Carlos"][i]!,
    state: "admitted" as const,
    joinNonce: crypto.randomUUID(),
    fallenAt: null,
  }));
  await writeSessao(codigoDeSessao, {
    codigoDeSessao,
    protocolVersion: PROTOCOL_VERSION,
    anfitriaoId: ana!.id,
    participantes: [ana!, bruno!, carlos!],
    transmissores: [carlos!.id],
    ended: false,
  });

  const back = await resume(codigoDeSessao, bruno!.id, bruno!.joinNonce);
  const resumed = await nextMessage(back);
  expect(resumed).toEqual({
    type: "resumed",
    participanteId: bruno!.id,
    roster: [
      { id: ana!.id, name: "Ana" },
      { id: bruno!.id, name: "Bruno" },
      { id: carlos!.id, name: "Carlos" },
    ],
    transmissores: [carlos!.id],
    entryRequests: [],
  });
  const sessao = await readSessao(codigoDeSessao);
  expect(sessao?.participantes.map((p) => p.state)).toEqual(["fallen", "admitted", "fallen"]);

  await expireFallen(codigoDeSessao);
  await runDurableObjectAlarm(stubFor(codigoDeSessao));
  let message = await nextMessage(back);
  while (message.type === "ice-servers") message = await nextMessage(back);
  expect(message).toEqual({ type: "sessao-ended", reason: "anfitriao-left" });
});

test("um signal não grava no storage", async () => {
  const { host, codigoDeSessao } = await createSessao();
  const bruno = await joinAndApprove(codigoDeSessao, host, "Bruno");
  const put = await runInDurableObject(stubFor(codigoDeSessao), (_instance, state) => vi.spyOn(state.storage, "put"));

  send(host, { type: "signal", toParticipanteId: bruno.participanteId, payload: { sdp: "x" } });
  expect((await nextMessage(bruno.joiner)).type).toBe("signal");
  expect(put).not.toHaveBeenCalled();

  // O espião funciona: uma transição que muda o estado grava.
  send(bruno.joiner, { type: "request-palco" });
  await nextMessage(host);
  expect(put).toHaveBeenCalled();
  put.mockRestore();
});
