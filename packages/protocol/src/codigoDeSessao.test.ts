import assert from "node:assert/strict";
import { test } from "node:test";
import { generateCodigoDeSessao } from "./codigoDeSessao.js";

const VALID_ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

test("generates a 6-character code from the alphabet without I, L, O, 0, 1", () => {
  for (let i = 0; i < 100; i++) {
    const codigoDeSessao = generateCodigoDeSessao();
    assert.match(codigoDeSessao, VALID_ALPHABET);
  }
});

test("is not constant across calls", () => {
  const codes = new Set(Array.from({ length: 20 }, () => generateCodigoDeSessao()));
  assert.ok(codes.size > 1);
});
