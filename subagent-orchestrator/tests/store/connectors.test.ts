// Tests for src/store/connectors.ts.

import { describe, expect, it } from "vitest";

import {
  ConnectorsConfigError,
  parseConnectorsToml,
  resolveCategory,
} from "../../src/store/connectors.js";

const SAMPLE_TOML = `
[default]
"~~chat" = "slack"
"~~CRM" = "hubspot"

[runtime.web."~~chat"]
server = "slack-web-allowlisted"

[plugin.legal."~~chat"]
server = "slack-legal-channel"

[unconfigured."~~CLM"]
fallback = "paste-contract-text"
plugins = ["legal"]
`;

describe("parseConnectorsToml", () => {
  it("parses default + runtime + plugin + unconfigured", () => {
    const cfg = parseConnectorsToml(SAMPLE_TOML);
    expect(cfg.default["~~chat"]).toBe("slack");
    expect(cfg.default["~~CRM"]).toBe("hubspot");
    expect(cfg.runtime?.web?.["~~chat"]).toEqual({ server: "slack-web-allowlisted" });
    expect(cfg.plugin?.legal?.["~~chat"]).toEqual({ server: "slack-legal-channel" });
    expect(cfg.unconfigured?.["~~CLM"]?.fallback).toBe("paste-contract-text");
    expect(cfg.unconfigured?.["~~CLM"]?.plugins).toEqual(["legal"]);
  });

  it("returns minimal config when only [default] present", () => {
    const cfg = parseConnectorsToml(`[default]\n"~~chat" = "slack"\n`);
    expect(cfg.default).toEqual({ "~~chat": "slack" });
    expect(cfg.runtime).toBeUndefined();
    expect(cfg.plugin).toBeUndefined();
    expect(cfg.unconfigured).toBeUndefined();
  });

  it("rejects malformed TOML with ConnectorsConfigError", () => {
    expect(() => parseConnectorsToml("not [valid] toml [[")).toThrow(ConnectorsConfigError);
  });
});

describe("resolveCategory", () => {
  // Build config from raw shape to skip the per-runtime/per-plugin
  // wrapping the parser produces (the resolver consumes pre-flattened maps).
  const cfg = {
    default: { "~~chat": "slack", "~~CRM": "hubspot" },
    runtime: { web: { "~~chat": "slack-web" } },
    plugin: { legal: { "~~chat": "slack-legal" } },
    unconfigured: { "~~CLM": { fallback: "paste-contract", plugins: ["legal"] } },
  };

  it("resolves default when no overrides match", () => {
    expect(resolveCategory(cfg, "~~CRM")).toEqual({ kind: "server", server: "hubspot" });
  });

  it("resolves runtime override when given", () => {
    expect(resolveCategory(cfg, "~~chat", { runtime: "web" })).toEqual({
      kind: "server",
      server: "slack-web",
    });
  });

  it("resolves plugin override before runtime override", () => {
    expect(resolveCategory(cfg, "~~chat", { runtime: "web", plugin: "legal" })).toEqual({
      kind: "server",
      server: "slack-legal",
    });
  });

  it("falls through to unconfigured when no default", () => {
    expect(resolveCategory(cfg, "~~CLM")).toEqual({
      kind: "fallback",
      fallback: "paste-contract",
      plugins: ["legal"],
      note: undefined,
    });
  });

  it("returns null for fully unknown category", () => {
    expect(resolveCategory(cfg, "~~unknown-xyz")).toBeNull();
  });
});
