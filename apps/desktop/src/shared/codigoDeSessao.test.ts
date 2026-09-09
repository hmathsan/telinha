import { describe, expect, it } from "vitest";
import {
  CODIGO_DE_SESSAO_LENGTH,
  formatCodigoDeSessao,
  isCodigoDeSessaoCompleto,
  normalizeCodigoDeSessao,
} from "./codigoDeSessao.js";

describe("normalizeCodigoDeSessao", () => {
  it("uppercases what was typed", () => {
    expect(normalizeCodigoDeSessao("abcdef")).toBe("ABCDEF");
  });

  it("drops the separator so pasting a formatted code works", () => {
    expect(normalizeCodigoDeSessao("ABC DEF")).toBe("ABCDEF");
    expect(normalizeCodigoDeSessao("abc-def")).toBe("ABCDEF");
  });

  it("never yields more than the six characters the protocol accepts", () => {
    expect(normalizeCodigoDeSessao("ABCDEFGH")).toHaveLength(CODIGO_DE_SESSAO_LENGTH);
  });
});

describe("formatCodigoDeSessao", () => {
  it("splits a full code into two groups", () => {
    expect(formatCodigoDeSessao("ABCDEF")).toBe("ABC DEF");
  });

  it("leaves a partial code alone until the first group is full", () => {
    expect(formatCodigoDeSessao("AB")).toBe("AB");
    expect(formatCodigoDeSessao("ABCD")).toBe("ABC D");
  });

  it("is idempotent, so formatting an already formatted code is safe", () => {
    expect(formatCodigoDeSessao(formatCodigoDeSessao("ABCDEF"))).toBe("ABC DEF");
  });
});

describe("isCodigoDeSessaoCompleto", () => {
  it("accepts a formatted code as complete", () => {
    expect(isCodigoDeSessaoCompleto("ABC DEF")).toBe(true);
  });

  it("rejects anything short of six characters", () => {
    expect(isCodigoDeSessaoCompleto("ABCDE")).toBe(false);
  });
});
