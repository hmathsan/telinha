import { describe, expect, it } from "vitest";
import { initialClientSessaoState, sessaoReducer, type ClientSessaoState } from "./clientSessaoState.js";
import type { SignalerToAppMessage } from "@pvt-broadcast/protocol";

function signaler(state: ClientSessaoState, message: SignalerToAppMessage): ClientSessaoState {
  return sessaoReducer(state, { source: "signaler", message });
}

describe("sessaoReducer", () => {
  it("seeds the anfitriao's own roster entry from the name typed at connect time", () => {
    let state = sessaoReducer(initialClientSessaoState, {
      source: "connect-attempt",
      connectAction: { kind: "create", name: "Ana" },
    });
    state = signaler(state, { type: "sessao-created", codigoDeSessao: "ABC123", participanteId: "p1" });

    expect(state.screen).toBe("sessao");
    expect(state.isAnfitriao).toBe(true);
    expect(state.myId).toBe("p1");
    expect(state.roster).toEqual([{ id: "p1", name: "Ana" }]);
  });

  it("keeps the Codigo de Sessao typed at join time, so the barra superior can offer to copy it", () => {
    let state = sessaoReducer(initialClientSessaoState, {
      source: "connect-attempt",
      connectAction: { kind: "join", name: "Beto", codigoDeSessao: "ABC123" },
    });
    state = signaler(state, {
      type: "entry-approved",
      participanteId: "p2",
      roster: [{ id: "p2", name: "Beto" }],
      transmissores: [],
    });

    expect(state.codigoDeSessao).toBe("ABC123");
  });

  it("moves to the sessao screen on entry-approved, carrying the roster and transmissores", () => {
    const state = signaler(initialClientSessaoState, {
      type: "entry-approved",
      participanteId: "p2",
      roster: [
        { id: "p1", name: "Ana" },
        { id: "p2", name: "Beto" },
      ],
      transmissores: ["p1"],
    });

    expect(state.screen).toBe("sessao");
    expect(state.isAnfitriao).toBe(false);
    expect(state.myId).toBe("p2");
    expect(state.transmissores).toEqual(["p1"]);
  });

  it("records an entry-refused reason without leaving the entry screen", () => {
    const state = signaler(initialClientSessaoState, { type: "entry-refused", reason: "sessao-full" });
    expect(state.screen).toBe("entry");
    expect(state.entryError).toBe("sessao-full");
  });

  it("tracks a pending entry-request for the anfitriao to approve or refuse", () => {
    const state = signaler(initialClientSessaoState, {
      type: "entry-request",
      participanteId: "p3",
      name: "Caio",
    });
    expect(state.pendingEntryRequests).toEqual([{ participanteId: "p3", name: "Caio" }]);
  });

  it("clears a pending entry-request locally when the anfitriao responds, without waiting on the server", () => {
    let state = signaler(initialClientSessaoState, { type: "entry-request", participanteId: "p3", name: "Caio" });
    state = sessaoReducer(state, { source: "respond-entry", participanteId: "p3" });
    expect(state.pendingEntryRequests).toEqual([]);
  });

  it("adds a joined participante to the roster and clears any matching pending request", () => {
    let state = signaler(initialClientSessaoState, { type: "entry-request", participanteId: "p3", name: "Caio" });
    state = signaler(state, { type: "participante-joined", participante: { id: "p3", name: "Caio" } });
    expect(state.roster).toEqual([{ id: "p3", name: "Caio" }]);
    expect(state.pendingEntryRequests).toEqual([]);
  });

  it("does not duplicate a roster entry that arrives twice", () => {
    let state = signaler(initialClientSessaoState, {
      type: "participante-joined",
      participante: { id: "p3", name: "Caio" },
    });
    state = signaler(state, { type: "participante-joined", participante: { id: "p3", name: "Caio" } });
    expect(state.roster).toHaveLength(1);
  });

  it("removes a left participante from both roster and transmissores", () => {
    let state: ClientSessaoState = {
      ...initialClientSessaoState,
      roster: [
        { id: "p1", name: "Ana" },
        { id: "p2", name: "Beto" },
      ],
      transmissores: ["p2"],
    };
    state = signaler(state, { type: "participante-left", participanteId: "p2", reason: "disconnected" });
    expect(state.roster).toEqual([{ id: "p1", name: "Ana" }]);
    expect(state.transmissores).toEqual([]);
  });

  it("replaces transmissores wholesale on transmissores-changed", () => {
    const state = signaler(initialClientSessaoState, { type: "transmissores-changed", participanteIds: ["p1", "p2"] });
    expect(state.transmissores).toEqual(["p1", "p2"]);
  });

  it("records a palco-denied reason", () => {
    const state = signaler(initialClientSessaoState, { type: "palco-denied", reason: "palco-full" });
    expect(state.palcoDeniedReason).toBe("palco-full");
  });

  it("resets to the entry screen on sessao-ended, keeping the reason for display", () => {
    const populated: ClientSessaoState = { ...initialClientSessaoState, screen: "sessao", myId: "p1", roster: [{ id: "p1", name: "Ana" }] };
    const state = signaler(populated, { type: "sessao-ended", reason: "anfitriao-left" });
    expect(state.screen).toBe("entry");
    expect(state.myId).toBeNull();
    expect(state.roster).toEqual([]);
    expect(state.sessaoEndedReason).toBe("anfitriao-left");
  });

  it("resets to the entry screen with the disconnect reason when the connection is terminated mid-sessao", () => {
    const populated: ClientSessaoState = {
      ...initialClientSessaoState,
      screen: "sessao",
      myId: "p2",
      roster: [{ id: "p2", name: "Beto" }],
    };
    const state = sessaoReducer(populated, { source: "connection-terminated", reason: "removido-da-sessao" });
    expect(state.screen).toBe("entry");
    expect(state.myId).toBeNull();
    expect(state.lastDisconnectReason).toBe("removido-da-sessao");
  });

  it("ignores a connection-terminated action once already back on the entry screen with a more specific reason", () => {
    const alreadyOnEntry = signaler(initialClientSessaoState, { type: "entry-refused", reason: "sessao-full" });
    const state = sessaoReducer(alreadyOnEntry, { source: "connection-terminated", reason: "sessao-encerrada" });
    expect(state).toBe(alreadyOnEntry);
  });

  it("caches ice servers as they arrive", () => {
    const state = signaler(initialClientSessaoState, {
      type: "ice-servers",
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
    });
    expect(state.iceServers).toEqual([{ urls: "stun:stun.cloudflare.com:3478" }]);
  });
});
