/**
 * Limite de taxa por IP nas rotas de entrada do Worker.
 *
 * Existe porque `/sessao/create` cria um Durable Object sem autenticação nenhuma: a URL do
 * sinalizador é pública ([ADR 0005](../../../docs/adr/0005-repositorio-publico-por-causa-do-auto-update.md)),
 * e sem limite qualquer um cria Durable Objects sem teto — cada um com armazenamento e um alarme.
 *
 * O que ele **não** faz é proteger a cota diária de requisições: um `429` também é uma
 * requisição, e este código roda depois de ela já ter sido contada. Barrar antes exigiria regra
 * de WAF na borda, que não existe em `*.workers.dev`.
 *
 * As bindings são **opcionais de propósito**: o miniflare não simula `[[ratelimits]]`, então
 * `wrangler dev` e os testes rodam sem elas. Sem binding não há limite, e é por isso que a
 * decisão mora aqui, numa função pura, em vez de espalhada pelo `fetch`.
 */

/** O IP de quem chamou, segundo a Cloudflare. Ausente fora da borda (dev local). */
export function clientIp(request: Request): string | null {
  return request.headers.get("CF-Connecting-IP");
}

/**
 * `true` libera. Sem binding (dev local) ou sem IP (sem borda na frente), libera também: o limite
 * é uma proteção de produção, não uma regra do protocolo.
 */
export async function withinRateLimit(
  limiter: RateLimit | undefined,
  ip: string | null,
): Promise<boolean> {
  if (!limiter || !ip) {
    return true;
  }
  const { success } = await limiter.limit({ key: ip });
  return success;
}

export function tooManyRequestsResponse(): Response {
  return new Response("too many requests", {
    status: 429,
    headers: { "Retry-After": "60" },
  });
}
