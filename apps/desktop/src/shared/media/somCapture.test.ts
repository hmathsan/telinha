import { describe, expect, it } from "vitest";
import {
  decideSomCapture,
  hwndFromSourceId,
  MIN_WINDOWS_BUILD_FOR_SOM,
  windowsBuildFrom,
  type SomCaptureInput,
} from "./somCapture.js";

const OWN_PID = 4242;

function input(overrides: Partial<SomCaptureInput> = {}): SomCaptureInput {
  return {
    fonteKind: "window",
    somRequested: true,
    windowsBuild: 22631,
    pid: 1000,
    ownPid: OWN_PID,
    forced: false,
    ...overrides,
  };
}

describe("decideSomCapture", () => {
  it("vai sem Som quando o Transmissor não pediu", () => {
    expect(decideSomCapture(input({ somRequested: false }))).toEqual({ audio: null, reason: "som-off" });
  });

  it("som-off vence os demais motivos", () => {
    expect(decideSomCapture(input({ somRequested: false, windowsBuild: 19045, pid: OWN_PID }))).toEqual({
      audio: null,
      reason: "som-off",
    });
  });

  it("vai sem Som no Windows 10, janela ou monitor", () => {
    expect(decideSomCapture(input({ windowsBuild: 19045 }))).toEqual({ audio: null, reason: "windows-10" });
    expect(decideSomCapture(input({ fonteKind: "screen", pid: null, windowsBuild: 19045 }))).toEqual({
      audio: null,
      reason: "windows-10",
    });
  });

  it("o limite é exatamente o build 22000", () => {
    expect(decideSomCapture(input({ windowsBuild: MIN_WINDOWS_BUILD_FOR_SOM - 1 }))).toEqual({
      audio: null,
      reason: "windows-10",
    });
    expect(decideSomCapture(input({ windowsBuild: MIN_WINDOWS_BUILD_FOR_SOM }))).toEqual({
      audio: "applicationLoopback:1000",
      mode: "applicationLoopback",
    });
  });

  it("build ilegível (0) conta como Windows 10", () => {
    expect(decideSomCapture(input({ windowsBuild: 0 }))).toEqual({ audio: null, reason: "windows-10" });
  });

  it("janela sem PID resolvido vai sem Som", () => {
    expect(decideSomCapture(input({ pid: null }))).toEqual({ audio: null, reason: "pid-not-found" });
    expect(decideSomCapture(input({ pid: 0 }))).toEqual({ audio: null, reason: "pid-not-found" });
  });

  it("janela do próprio app vai sem Som", () => {
    expect(decideSomCapture(input({ pid: OWN_PID }))).toEqual({ audio: null, reason: "own-app" });
  });

  // O caso que custa uma tarde dentro do handler: a válvula existe para o Windows 10, não para a
  // invariante.
  it("janela do próprio app vai sem Som mesmo com a válvula, no Windows 10 ou 11", () => {
    expect(decideSomCapture(input({ pid: OWN_PID, forced: true, windowsBuild: 19045 }))).toEqual({
      audio: null,
      reason: "own-app",
    });
    expect(decideSomCapture(input({ pid: OWN_PID, forced: true }))).toEqual({ audio: null, reason: "own-app" });
  });

  it("janela de outro processo pede o Som do aplicativo pelo PID", () => {
    expect(decideSomCapture(input())).toEqual({ audio: "applicationLoopback:1000", mode: "applicationLoopback" });
  });

  it("janela no Windows 10 com a válvula pede o Som do aplicativo", () => {
    expect(decideSomCapture(input({ windowsBuild: 19045, forced: true }))).toEqual({
      audio: "applicationLoopback:1000",
      mode: "applicationLoopback",
    });
  });

  it("monitor no Windows 11 pede loopback, ignorando o PID", () => {
    expect(decideSomCapture(input({ fonteKind: "screen", pid: null }))).toEqual({ audio: "loopback", mode: "loopback" });
    expect(decideSomCapture(input({ fonteKind: "screen", pid: OWN_PID }))).toEqual({
      audio: "loopback",
      mode: "loopback",
    });
  });

  it("monitor no Windows 11 com a válvula continua em loopback", () => {
    expect(decideSomCapture(input({ fonteKind: "screen", pid: null, forced: true }))).toEqual({
      audio: "loopback",
      mode: "loopback",
    });
  });

  it("monitor no Windows 10 com a válvula pede loopbackWithoutChrome", () => {
    expect(decideSomCapture(input({ fonteKind: "screen", pid: null, windowsBuild: 19045, forced: true }))).toEqual({
      audio: "loopbackWithoutChrome",
      mode: "loopbackWithoutChrome",
    });
  });
});

describe("windowsBuildFrom", () => {
  it("lê o terceiro segmento de os.release()", () => {
    expect(windowsBuildFrom("10.0.22631")).toBe(22631);
    expect(windowsBuildFrom("10.0.19045")).toBe(19045);
  });

  it("devolve 0 para o ilegível", () => {
    expect(windowsBuildFrom("")).toBe(0);
    expect(windowsBuildFrom("10.0")).toBe(0);
    expect(windowsBuildFrom("abc")).toBe(0);
    expect(windowsBuildFrom("10.x.22631")).toBe(0);
  });
});

describe("hwndFromSourceId", () => {
  it("extrai o HWND de uma Fonte de janela", () => {
    expect(hwndFromSourceId("window:132456:0")).toBe(132456);
  });

  it("devolve null para monitor", () => {
    expect(hwndFromSourceId("screen:0:0")).toBeNull();
    expect(hwndFromSourceId("screen:1:0")).toBeNull();
  });

  it("devolve null para o malformado", () => {
    expect(hwndFromSourceId("")).toBeNull();
    expect(hwndFromSourceId("window:")).toBeNull();
    expect(hwndFromSourceId("window:abc:0")).toBeNull();
    expect(hwndFromSourceId("window:0:0")).toBeNull();
    expect(hwndFromSourceId("window:-5:0")).toBeNull();
    expect(hwndFromSourceId("xwindow:132456:0")).toBeNull();
  });
});
