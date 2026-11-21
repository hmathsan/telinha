import { describe, expect, it } from "vitest";
import {
  DEVTOOLS_ENV_VAR,
  DISABLE_HW_ACCEL_ENV_VAR,
  FAKE_UPDATE_ENV_VAR,
  SOM_FORCE_ENV_VAR,
  devToolsAllowed,
  disabledHardwareAccelSwitches,
  fakeUpdateVersion,
  somForced,
} from "./hardening.js";

describe("somForced", () => {
  it("não força por padrão", () => {
    expect(somForced({})).toBe(false);
  });

  it("força com a válvula", () => {
    expect(somForced({ [SOM_FORCE_ENV_VAR]: "1" })).toBe(true);
  });

  it("só o valor '1' força — 'true' e '0' não", () => {
    expect(somForced({ [SOM_FORCE_ENV_VAR]: "true" })).toBe(false);
    expect(somForced({ [SOM_FORCE_ENV_VAR]: "0" })).toBe(false);
  });
});

describe("devToolsAllowed", () => {
  it("libera em desenvolvimento, com ou sem a variável", () => {
    expect(devToolsAllowed(false, {})).toBe(true);
    expect(devToolsAllowed(false, { [DEVTOOLS_ENV_VAR]: "1" })).toBe(true);
  });

  it("bloqueia no app empacotado", () => {
    expect(devToolsAllowed(true, {})).toBe(false);
  });

  it("a válvula reabre no app empacotado", () => {
    expect(devToolsAllowed(true, { [DEVTOOLS_ENV_VAR]: "1" })).toBe(true);
  });

  it("só o valor '1' abre — 'true' e '0' não", () => {
    expect(devToolsAllowed(true, { [DEVTOOLS_ENV_VAR]: "true" })).toBe(false);
    expect(devToolsAllowed(true, { [DEVTOOLS_ENV_VAR]: "0" })).toBe(false);
  });
});

describe("disabledHardwareAccelSwitches", () => {
  it("não desliga nada por padrão", () => {
    expect(disabledHardwareAccelSwitches({})).toEqual([]);
  });

  it("desliga encode e decode juntos, porque quem relata não sabe de que lado está o problema", () => {
    expect(disabledHardwareAccelSwitches({ [DISABLE_HW_ACCEL_ENV_VAR]: "1" })).toEqual([
      "disable-accelerated-video-encode",
      "disable-accelerated-video-decode",
    ]);
  });

  it("só o valor '1' desliga", () => {
    expect(disabledHardwareAccelSwitches({ [DISABLE_HW_ACCEL_ENV_VAR]: "0" })).toEqual([]);
  });
});

describe("fakeUpdateVersion", () => {
  it("devolve null no app empacotado, mesmo com a variável definida", () => {
    expect(fakeUpdateVersion(true, { [FAKE_UPDATE_ENV_VAR]: "1.1.0" })).toBeNull();
  });

  it("devolve null em desenvolvimento quando a variável está ausente ou vazia", () => {
    expect(fakeUpdateVersion(false, {})).toBeNull();
    expect(fakeUpdateVersion(false, { [FAKE_UPDATE_ENV_VAR]: "" })).toBeNull();
    expect(fakeUpdateVersion(false, { [FAKE_UPDATE_ENV_VAR]: "   " })).toBeNull();
  });

  it("devolve a versão aparada em desenvolvimento", () => {
    expect(fakeUpdateVersion(false, { [FAKE_UPDATE_ENV_VAR]: "1.1.0" })).toBe("1.1.0");
    expect(fakeUpdateVersion(false, { [FAKE_UPDATE_ENV_VAR]: "  1.2.0-rc.1  " })).toBe("1.2.0-rc.1");
  });
});
