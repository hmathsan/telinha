// Placeholder de andaime. Implementado pela spec 0002 (Durable Object por Sessão,
// credenciais TURN, desligador de gasto — ver docs/specs/0002-sinalizador.md).
export default {
  async fetch(): Promise<Response> {
    return new Response("not implemented", { status: 501 });
  },
};
