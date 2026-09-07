// No I, L, O, 0, 1 — characters people confuse when reading a code aloud.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 6;

export function generateCodigoDeSessao(): string {
  const indices = new Uint32Array(LENGTH);
  crypto.getRandomValues(indices);
  let codigoDeSessao = "";
  for (const index of indices) {
    codigoDeSessao += ALPHABET[index % ALPHABET.length];
  }
  return codigoDeSessao;
}
