import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { AppToSignalerMessage, SignalerToAppMessage } from "@scrn-broadcast/protocol";
import worker from "../src/index.js";
import type { Env } from "../src/env.js";

interface Inbox {
  readonly queue: SignalerToAppMessage[];
  readonly waiters: ((message: SignalerToAppMessage) => void)[];
}

const inboxes = new WeakMap<WebSocket, Inbox>();
const closes = new WeakMap<WebSocket, Promise<{ code: number; reason: string }>>();

/**
 * Connects as a real client would: WS upgrade to the Worker, which routes to the DO. A message
 * listener is attached right away and queues everything — a real WebSocket does not buffer
 * events for listeners added later, so `nextMessage` must never be the first thing to observe a
 * message.
 */
export async function connect(path: string): Promise<WebSocket> {
  const request = new Request(`http://sinalizador${path}`, {
    headers: { Upgrade: "websocket" },
  });
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env as unknown as Env, ctx);
  await waitOnExecutionContext(ctx);
  const ws = response.webSocket;
  if (!ws) {
    throw new Error(`expected a websocket response for ${path}, got status ${response.status}`);
  }
  const inbox: Inbox = { queue: [], waiters: [] };
  inboxes.set(ws, inbox);
  ws.addEventListener("message", (event: MessageEvent) => {
    const message = JSON.parse(event.data as string) as SignalerToAppMessage;
    const waiter = inbox.waiters.shift();
    if (waiter) {
      waiter(message);
    } else {
      inbox.queue.push(message);
    }
  });
  closes.set(
    ws,
    new Promise((resolve) => ws.addEventListener("close", (event: CloseEvent) => resolve({ code: event.code, reason: event.reason }))),
  );
  ws.accept();
  return ws;
}

export function send(ws: WebSocket, message: AppToSignalerMessage): void {
  ws.send(JSON.stringify(message));
}

export function nextMessage(ws: WebSocket, timeoutMs = 2000): Promise<SignalerToAppMessage> {
  const inbox = inboxes.get(ws);
  if (!inbox) {
    throw new Error("nextMessage called on a socket that was not opened via connect()");
  }
  const queued = inbox.queue.shift();
  if (queued) {
    return Promise.resolve(queued);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for a message")), timeoutMs);
    inbox.waiters.push((message) => {
      clearTimeout(timer);
      resolve(message);
    });
  });
}

export function closeOf(ws: WebSocket): Promise<{ code: number; reason: string }> {
  const closed = closes.get(ws);
  if (!closed) throw new Error("closeOf called on a socket that was not opened via connect()");
  return closed;
}

/** Nada chegou em `ms`. Um `nextMessage` que estoura o tempo não diz isso: ele consome a fila. */
export async function expectNoMessage(ws: WebSocket, ms = 200): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  const queued = inboxes.get(ws)?.queue ?? [];
  if (queued.length > 0) throw new Error(`expected no message, got ${JSON.stringify(queued)}`);
}
