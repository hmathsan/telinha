import { generateCodigoDeSessao } from "@scrn-broadcast/protocol";
import type { Env } from "./env.js";

export { SessaoDurableObject } from "./durableObject.js";

/**
 * O Worker só roteia: escolhe o Durable Object pelo `codigoDeSessao` e repassa o WebSocket. Toda
 * a semântica de Sessão (quem pode criar, entrar, o que cada mensagem faz) vive no Durable
 * Object, rodando a máquina de estados de `packages/protocol`.
 *
 * `/sessao/create` gera um `codigoDeSessao` novo e roteia para o Durable Object recém-nomeado.
 * `/sessao/join?codigoDeSessao=XXXXXX` roteia para o Durable Object já existente com esse nome;
 * se nunca houve uma Sessão com esse código, o Durable Object recusa com `'invalid-code'` ao
 * primeiro `join` recebido.
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected a websocket upgrade", { status: 426 });
    }

    const url = new URL(request.url);
    let codigoDeSessao: string;
    if (url.pathname === "/sessao/create") {
      codigoDeSessao = generateCodigoDeSessao();
    } else if (url.pathname === "/sessao/join") {
      const code = url.searchParams.get("codigoDeSessao");
      if (!code) {
        return new Response("missing codigoDeSessao", { status: 400 });
      }
      codigoDeSessao = code;
    } else {
      return new Response("not found", { status: 404 });
    }

    const id = env.SESSAO.idFromName(codigoDeSessao);
    const stub = env.SESSAO.get(id);
    const forwardUrl = new URL(request.url);
    forwardUrl.searchParams.set("codigoDeSessao", codigoDeSessao);
    return stub.fetch(new Request(forwardUrl, request));
  },
};
