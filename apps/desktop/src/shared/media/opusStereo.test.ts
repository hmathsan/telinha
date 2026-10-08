import { describe, expect, it } from "vitest";
import { withOpusStereo } from "./opusStereo.js";

const BITRATE = 128_000;
const STEREO = "stereo=1;sprop-stereo=1;maxaveragebitrate=128000";

function sdp(lines: readonly string[], eol = "\r\n"): string {
  return lines.join(eol) + eol;
}

const SESSION = ["v=0", "o=- 1 2 IN IP4 127.0.0.1", "s=-", "t=0 0", "a=group:BUNDLE 0 1"];
const VIDEO = ["m=video 9 UDP/TLS/RTP/SAVPF 96", "a=mid:0", "a=rtpmap:96 H264/90000", "a=fmtp:96 profile-level-id=42e01f"];

describe("withOpusStereo", () => {
  it("acrescenta os parâmetros ao fmtp existente", () => {
    const input = sdp([
      ...SESSION,
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=mid:1",
      "a=rtpmap:111 opus/48000/2",
      "a=fmtp:111 minptime=10;useinbandfec=1",
    ]);
    expect(withOpusStereo(input, BITRATE)).toContain(`a=fmtp:111 minptime=10;useinbandfec=1;${STEREO}\r\n`);
  });

  it("stereo=0 vira stereo=1, e um maxaveragebitrate anterior é substituído", () => {
    const input = sdp([
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=rtpmap:111 opus/48000/2",
      "a=fmtp:111 stereo=0;minptime=10;maxaveragebitrate=32000",
    ]);
    const output = withOpusStereo(input, BITRATE);
    expect(output).toContain(`a=fmtp:111 minptime=10;${STEREO}\r\n`);
    expect(output).not.toContain("stereo=0");
    expect(output).not.toContain("32000");
  });

  it("cria a linha fmtp logo após o rtpmap quando o payload Opus não tem uma", () => {
    const input = sdp(["m=audio 9 UDP/TLS/RTP/SAVPF 111 0", "a=rtpmap:111 opus/48000/2", "a=rtpmap:0 PCMU/8000"]);
    expect(withOpusStereo(input, BITRATE)).toBe(
      sdp(["m=audio 9 UDP/TLS/RTP/SAVPF 111 0", "a=rtpmap:111 opus/48000/2", `a=fmtp:111 ${STEREO}`, "a=rtpmap:0 PCMU/8000"]),
    );
  });

  it("devolve idêntico um SDP sem Opus", () => {
    const input = sdp([...SESSION, ...VIDEO]);
    expect(withOpusStereo(input, BITRATE)).toBe(input);
  });

  it("não mexe no fmtp de outra seção que reaproveita o número do payload", () => {
    const input = sdp([
      "m=video 9 UDP/TLS/RTP/SAVPF 111",
      "a=rtpmap:111 H264/90000",
      "a=fmtp:111 profile-level-id=42e01f",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111",
      "a=rtpmap:111 opus/48000/2",
      "a=fmtp:111 minptime=10",
    ]);
    const output = withOpusStereo(input, BITRATE);
    expect(output).toContain("a=fmtp:111 profile-level-id=42e01f\r\n");
    expect(output).toContain(`a=fmtp:111 minptime=10;${STEREO}\r\n`);
  });

  it("preserva \\r\\n", () => {
    const input = sdp([...SESSION, ...VIDEO, "m=audio 9 UDP/TLS/RTP/SAVPF 111", "a=rtpmap:111 opus/48000/2", "a=fmtp:111 minptime=10"]);
    const output = withOpusStereo(input, BITRATE);
    expect(output.endsWith("\r\n")).toBe(true);
    expect(output.replace(/\r\n/g, "")).not.toContain("\n");
    expect(output.split("\r\n")).toHaveLength(input.split("\r\n").length);
  });

  it("é idempotente", () => {
    const input = sdp([
      ...SESSION,
      ...VIDEO,
      "m=audio 9 UDP/TLS/RTP/SAVPF 111 63",
      "a=rtpmap:111 opus/48000/2",
      "a=fmtp:111 minptime=10;useinbandfec=1",
      "a=rtpmap:63 red/48000/2",
    ]);
    const once = withOpusStereo(input, BITRATE);
    expect(withOpusStereo(once, BITRATE)).toBe(once);

    const withoutFmtp = sdp(["m=audio 9 UDP/TLS/RTP/SAVPF 111", "a=rtpmap:111 opus/48000/2"]);
    const onceCreated = withOpusStereo(withoutFmtp, BITRATE);
    expect(withOpusStereo(onceCreated, BITRATE)).toBe(onceCreated);
  });
});
