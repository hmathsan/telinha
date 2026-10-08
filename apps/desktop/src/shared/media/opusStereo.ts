/**
 * O Opus do libwebrtc sai mono por padrão, e o encoder do Transmissor só vai para estéreo se a
 * descrição **remota** que ele recebe tiver `stereo=1` — ou seja, quem precisa carregar o parâmetro
 * é a resposta do Espectador (spec 0009, "Estéreo"). A oferta também leva, para os dois lados
 * declararem a mesma coisa.
 *
 * Os payload types são escopados por seção de mídia: um `111` de outra `m=` não é Opus só porque o
 * da seção de áudio é.
 */

const OPUS_RTPMAP = /^a=rtpmap:(\d+) opus\//i;

/** Acrescenta `stereo=1;sprop-stereo=1;maxaveragebitrate=<n>` ao fmtp de todo payload Opus. */
export function withOpusStereo(sdp: string, maxAverageBitrateBps: number): string {
  const eol = sdp.includes("\r\n") ? "\r\n" : "\n";
  const lines = sdp.split(/\r\n|\n/);
  const forced: readonly (readonly [string, string])[] = [
    ["stereo", "1"],
    ["sprop-stereo", "1"],
    ["maxaveragebitrate", String(Math.round(maxAverageBitrateBps))],
  ];

  const output: string[] = [];
  let touched = false;
  for (const section of splitMediaSections(lines)) {
    const opusPayloads = new Set<string>();
    for (const line of section) {
      const match = OPUS_RTPMAP.exec(line);
      if (match?.[1]) opusPayloads.add(match[1]);
    }
    if (opusPayloads.size === 0) {
      output.push(...section);
      continue;
    }
    touched = true;

    const withFmtp = new Set<string>();
    for (const line of section) {
      const fmtp = /^a=fmtp:(\d+) (.*)$/.exec(line);
      if (fmtp?.[1] && opusPayloads.has(fmtp[1])) withFmtp.add(fmtp[1]);
    }

    for (const line of section) {
      const fmtp = /^a=fmtp:(\d+) (.*)$/.exec(line);
      if (fmtp?.[1] && fmtp[2] !== undefined && opusPayloads.has(fmtp[1])) {
        output.push(`a=fmtp:${fmtp[1]} ${mergeParams(fmtp[2], forced)}`);
        continue;
      }
      output.push(line);
      const rtpmap = OPUS_RTPMAP.exec(line);
      if (rtpmap?.[1] && !withFmtp.has(rtpmap[1])) {
        output.push(`a=fmtp:${rtpmap[1]} ${mergeParams("", forced)}`);
      }
    }
  }

  return touched ? output.join(eol) : sdp;
}

/** Linhas de sessão primeiro, depois uma fatia por `m=`. Juntas, recompõem a lista original. */
function splitMediaSections(lines: readonly string[]): string[][] {
  const sections: string[][] = [[]];
  for (const line of lines) {
    if (line.startsWith("m=")) sections.push([]);
    sections[sections.length - 1]?.push(line);
  }
  return sections;
}

/** Sobrescreve ou acrescenta os parâmetros forçados, mantendo os demais na ordem em que vieram. */
function mergeParams(raw: string, forced: readonly (readonly [string, string])[]): string {
  const params = raw
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const forcedKeys = new Map(forced);
  const kept = params.filter((p) => !forcedKeys.has(p.split("=")[0]?.trim().toLowerCase() ?? ""));
  return [...kept, ...forced.map(([key, value]) => `${key}=${value}`)].join(";");
}
