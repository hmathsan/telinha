import { PROTOCOL_VERSION } from "@scrn-broadcast/protocol";
import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import type { Env } from "../src/env.js";
import { connect, nextMessage, send } from "./helpers.js";

function stubFor(codigoDeSessao: string) {
  const typedEnv = env as unknown as Env;
  const id = typedEnv.SESSAO.idFromName(codigoDeSessao);
  return typedEnv.SESSAO.get(id);
}

test("uma sessao sem nenhum participante agenda o alarme de autodestruicao", async () => {
  const host = await connect("/sessao/create");
  send(host, { type: "create-sessao", name: "Ana", protocolVersion: PROTOCOL_VERSION });
  const created = await nextMessage(host);
  if (created.type !== "sessao-created") throw new Error("expected sessao-created");
  await nextMessage(host); // ice-servers

  host.close();
  // O fechamento se propaga ao Durable Object de forma assíncrona; dá tempo do seu
  // `webSocketClose` rodar e agendar o alarme antes de checarmos.
  await new Promise((resolve) => setTimeout(resolve, 50));

  const ranAlarm = await runDurableObjectAlarm(stubFor(created.codigoDeSessao));
  expect(ranAlarm).toBe(true);
});

test("create-sessao recusado por versao incompativel tambem agenda o alarme", async () => {
  const codigoDeSessao = "TESTAB";
  const attempt = await connect(`/sessao/join?codigoDeSessao=${codigoDeSessao}`);
  send(attempt, {
    type: "create-sessao",
    name: "Ana",
    protocolVersion: PROTOCOL_VERSION + 1,
  });
  const refused = await nextMessage(attempt);
  expect(refused).toEqual({ type: "entry-refused", reason: "incompatible-version" });

  const ranAlarm = await runDurableObjectAlarm(stubFor(codigoDeSessao));
  expect(ranAlarm).toBe(true);
});
