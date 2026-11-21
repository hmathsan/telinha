import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHeartbeat,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  HEARTBEAT_TIMEOUT_MS,
  isHeartbeatPong,
} from "./heartbeat.js";

describe("heartbeat constants & helpers", () => {
  it("uses the spec 0015 interval and timeout so detection stays inside Retomada", () => {
    expect(HEARTBEAT_PING).toBe("ping");
    expect(HEARTBEAT_PONG).toBe("pong");
    expect(HEARTBEAT_INTERVAL_MS).toBe(25_000);
    expect(HEARTBEAT_TIMEOUT_MS).toBe(10_000);
    expect(HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS).toBeLessThan(60_000);
  });

  it("recognizes only exact pong frames", () => {
    expect(isHeartbeatPong("pong")).toBe(true);
    expect(isHeartbeatPong("ping")).toBe(false);
    expect(isHeartbeatPong("pong\n")).toBe(false);
    expect(isHeartbeatPong('{"type":"pong"}')).toBe(false);
    expect(isHeartbeatPong("")).toBe(false);
  });
});

describe("createHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends ping every HEARTBEAT_INTERVAL_MS while active and receiving pong", () => {
    const sendPing = vi.fn();
    const onTimeout = vi.fn();
    const hb = createHeartbeat({ sendPing, onTimeout });

    expect(hb.isActive()).toBe(false);
    expect(hb.isAwaitingResponse()).toBe(false);

    hb.start();
    expect(hb.isActive()).toBe(true);

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS - 1);
    expect(sendPing).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(sendPing).toHaveBeenCalledTimes(1);
    expect(hb.isAwaitingResponse()).toBe(true);

    // Pong chega dentro do prazo.
    vi.advanceTimersByTime(200);
    hb.onActivity();
    expect(hb.isAwaitingResponse()).toBe(false);

    // Sem timeout falso após o prazo original de 10 s.
    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS);
    expect(onTimeout).not.toHaveBeenCalled();

    // Segundo ciclo de 25 s.
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS - HEARTBEAT_TIMEOUT_MS - 200);
    expect(sendPing).toHaveBeenCalledTimes(2);
    expect(hb.isAwaitingResponse()).toBe(true);

    hb.onActivity();
    expect(hb.isAwaitingResponse()).toBe(false);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("fires onTimeout once after HEARTBEAT_TIMEOUT_MS with no activity and stops further pings", () => {
    const sendPing = vi.fn();
    const onTimeout = vi.fn();
    const hb = createHeartbeat({ sendPing, onTimeout });

    hb.start();
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(sendPing).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(hb.isActive()).toBe(false);
    expect(hb.isAwaitingResponse()).toBe(false);

    // Nenhum novo ping ou timeout depois de expirar.
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);
    expect(sendPing).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("cancels pending timeout on any incoming activity before deadline", () => {
    const sendPing = vi.fn();
    const onTimeout = vi.fn();
    const hb = createHeartbeat({ sendPing, onTimeout });

    hb.start();
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS - 1);
    expect(hb.isAwaitingResponse()).toBe(true);

    hb.onActivity();
    expect(hb.isAwaitingResponse()).toBe(false);

    vi.advanceTimersByTime(5_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("ignores onActivity when no timeout is pending without disturbing the ping schedule", () => {
    const sendPing = vi.fn();
    const onTimeout = vi.fn();
    const hb = createHeartbeat({ sendPing, onTimeout });

    hb.start();
    vi.advanceTimersByTime(10_000);
    hb.onActivity();
    expect(hb.isAwaitingResponse()).toBe(false);

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS - 10_000);
    expect(sendPing).toHaveBeenCalledTimes(1);
  });

  it("clears both interval and timeout timers on stop()", () => {
    const sendPing = vi.fn();
    const onTimeout = vi.fn();
    const hb = createHeartbeat({ sendPing, onTimeout });

    hb.start();
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(sendPing).toHaveBeenCalledTimes(1);
    expect(hb.isAwaitingResponse()).toBe(true);

    hb.stop();
    expect(hb.isActive()).toBe(false);
    expect(hb.isAwaitingResponse()).toBe(false);

    // Chamar stop novamente é seguro.
    hb.stop();

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 2 + HEARTBEAT_TIMEOUT_MS);
    expect(sendPing).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("restarts cleanly when start() is called while already running", () => {
    const sendPing = vi.fn();
    const onTimeout = vi.fn();
    const hb = createHeartbeat({ sendPing, onTimeout });

    hb.start();
    vi.advanceTimersByTime(20_000);
    hb.start();

    vi.advanceTimersByTime(10_000);
    expect(sendPing).not.toHaveBeenCalled();

    vi.advanceTimersByTime(15_000);
    expect(sendPing).toHaveBeenCalledTimes(1);
  });

  it("handles synchronous pong or stop() triggered inside sendPing()", () => {
    let hb!: ReturnType<typeof createHeartbeat>;
    const onTimeout = vi.fn();
    const sendPing = vi.fn(() => {
      hb.onActivity();
    });
    hb = createHeartbeat({ sendPing, onTimeout });

    hb.start();
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(sendPing).toHaveBeenCalledTimes(1);
    expect(hb.isAwaitingResponse()).toBe(false);

    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS);
    expect(onTimeout).not.toHaveBeenCalled();

    // Caso sendPing() chame stop(), não reagenda o próximo ping.
    let hbStop!: ReturnType<typeof createHeartbeat>;
    const sendAndStop = vi.fn(() => {
      hbStop.stop();
    });
    hbStop = createHeartbeat({ sendPing: sendAndStop, onTimeout });
    hbStop.start();
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);
    expect(sendAndStop).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("does not extend an already pending timeout when intervalMs < timeoutMs", () => {
    const sendPing = vi.fn();
    const onTimeout = vi.fn();
    const hb = createHeartbeat({
      sendPing,
      onTimeout,
      intervalMs: 1_000,
      timeoutMs: 2_500,
    });

    hb.start();
    vi.advanceTimersByTime(1_000); // ping 1, timeout armado para t = 3500
    expect(sendPing).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000); // t = 2000: ping 2, timeout continua em t = 3500
    expect(sendPing).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1_500); // t = 3500: expira!
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(hb.isActive()).toBe(false);
  });
});
