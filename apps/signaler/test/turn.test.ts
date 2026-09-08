import { expect, test, vi } from "vitest";
import { buildIceServers, shouldEmitTurnCredentials } from "../src/turn.js";

const STUN_ONLY = [{ urls: "stun:stun.cloudflare.com:3478" }];

test("limite de gasto zerado: nao emite credencial TURN nenhuma e nem consulta a rede", async () => {
  const fetchImpl = vi.fn(() => {
    throw new Error("nao deveria consultar a rede com o limite zerado");
  });
  const env = {
    TURN_SPEND_LIMIT_GB: 0,
    TURN_KEY_ID: "key",
    TURN_TOKEN: "token",
    CF_ACCOUNT_ID: "acc",
    CF_ANALYTICS_TOKEN: "tok",
  };

  await expect(shouldEmitTurnCredentials(env, fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
  expect(fetchImpl).not.toHaveBeenCalled();

  const iceServers = await buildIceServers(env, "participante-1", fetchImpl as unknown as typeof fetch);
  expect(iceServers).toEqual(STUN_ONLY);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("abaixo do limite, credenciais TURN sao mintadas e somadas ao STUN", async () => {
  const fetchImpl = vi.fn(async (url: string) => {
    if (url.includes("graphql")) {
      return new Response(
        JSON.stringify({
          data: {
            viewer: {
              accounts: [{ callsTurnUsageAdaptiveGroups: [{ sum: { egressBytes: 1_000_000_000 } }] }],
            },
          },
        }),
      );
    }
    return new Response(
      JSON.stringify({
        iceServers: { urls: "turn:turn.cloudflare.com:3478", username: "u", credential: "c" },
      }),
    );
  });
  const env = {
    TURN_SPEND_LIMIT_GB: 80,
    TURN_KEY_ID: "key",
    TURN_TOKEN: "token",
    CF_ACCOUNT_ID: "acc",
    CF_ANALYTICS_TOKEN: "tok",
  };

  const iceServers = await buildIceServers(env, "participante-1", fetchImpl as unknown as typeof fetch);
  expect(iceServers).toEqual([
    ...STUN_ONLY,
    { urls: "turn:turn.cloudflare.com:3478", username: "u", credential: "c" },
  ]);
});

test("acima do limite configurado, so devolve STUN e nunca minta credencial TURN", async () => {
  const fetchImpl = vi.fn(async (url: string) => {
    expect(url).toContain("graphql");
    return new Response(
      JSON.stringify({
        data: {
          viewer: {
            accounts: [{ callsTurnUsageAdaptiveGroups: [{ sum: { egressBytes: 100_000_000_000 } }] }],
          },
        },
      }),
    );
  });
  const env = {
    TURN_SPEND_LIMIT_GB: 80,
    TURN_KEY_ID: "key",
    TURN_TOKEN: "token",
    CF_ACCOUNT_ID: "acc",
    CF_ANALYTICS_TOKEN: "tok",
  };

  const iceServers = await buildIceServers(env, "participante-1", fetchImpl as unknown as typeof fetch);
  expect(iceServers).toEqual(STUN_ONLY);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("falha ao consultar o egresso nega TURN por seguranca, nao arrisca gasto", async () => {
  const fetchImpl = vi.fn(async () => new Response("service unavailable", { status: 503 }));
  const env = {
    TURN_SPEND_LIMIT_GB: 80,
    TURN_KEY_ID: "key",
    TURN_TOKEN: "token",
    CF_ACCOUNT_ID: "acc",
    CF_ANALYTICS_TOKEN: "tok",
  };

  await expect(shouldEmitTurnCredentials(env, fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
});
