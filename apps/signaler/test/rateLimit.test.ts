import { describe, expect, it } from "vitest";
import { clientIp, tooManyRequestsResponse, withinRateLimit } from "../src/rateLimit.js";

function fakeLimiter(outcomes: boolean[]): { limiter: RateLimit; keys: string[] } {
  const keys: string[] = [];
  let call = 0;
  const limiter: RateLimit = {
    limit: async ({ key }) => {
      keys.push(key);
      return { success: outcomes[call++] ?? false };
    },
  };
  return { limiter, keys };
}

describe("clientIp", () => {
  it("lê o IP que a Cloudflare põe no CF-Connecting-IP", () => {
    const request = new Request("https://example.com/sessao/create", {
      headers: { "CF-Connecting-IP": "203.0.113.7" },
    });
    expect(clientIp(request)).toBe("203.0.113.7");
  });

  it("devolve null fora da borda, onde o header não existe", () => {
    expect(clientIp(new Request("https://example.com/sessao/create"))).toBeNull();
  });
});

describe("withinRateLimit", () => {
  it("libera quando a binding não existe — é o caso de wrangler dev e dos testes", async () => {
    await expect(withinRateLimit(undefined, "203.0.113.7")).resolves.toBe(true);
  });

  it("libera quando não há IP, porque não há como formar a chave", async () => {
    const { limiter, keys } = fakeLimiter([false]);
    await expect(withinRateLimit(limiter, null)).resolves.toBe(true);
    expect(keys).toEqual([]);
  });

  it("consulta a binding usando o IP como chave", async () => {
    const { limiter, keys } = fakeLimiter([true]);
    await expect(withinRateLimit(limiter, "203.0.113.7")).resolves.toBe(true);
    expect(keys).toEqual(["203.0.113.7"]);
  });

  it("nega quando a binding diz que estourou", async () => {
    const { limiter } = fakeLimiter([false]);
    await expect(withinRateLimit(limiter, "203.0.113.7")).resolves.toBe(false);
  });

  it("cada IP tem seu próprio balde", async () => {
    const { limiter, keys } = fakeLimiter([true, true]);
    await withinRateLimit(limiter, "203.0.113.7");
    await withinRateLimit(limiter, "198.51.100.4");
    expect(keys).toEqual(["203.0.113.7", "198.51.100.4"]);
  });
});

describe("tooManyRequestsResponse", () => {
  it("é 429 com Retry-After, para o app poder dizer quanto esperar", () => {
    const response = tooManyRequestsResponse();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });
});
