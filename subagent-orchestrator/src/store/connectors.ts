// connectors.ts — read the root connectors.toml that maps ~~category
// placeholders to MCP servers. Spec: subagent-cowork/cli-cowork-bridge.md §2.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import toml from "@iarna/toml";

export type Runtime = "cli" | "cowork" | "web";

/** A resolved connector entry — either points at an MCP server or names a fallback. */
export type ResolvedConnector =
  | { kind: "server"; server: string }
  | { kind: "fallback"; fallback: string; plugins?: string[]; note?: string };

export interface ConnectorsConfig {
  /** Default mappings: category → server name */
  default: Record<string, string>;
  /** Per-runtime overrides: runtime → category → server */
  runtime?: Partial<Record<Runtime, Record<string, string>>>;
  /** Per-plugin overrides: plugin name → category → server */
  plugin?: Record<string, Record<string, string>>;
  /** Categories with no MCP server today; falls back to manual */
  unconfigured?: Record<string, { fallback: string; plugins?: string[]; note?: string }>;
}

export class ConnectorsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorsConfigError";
  }
}

/**
 * Read connectors.toml from disk. Defaults to ../../../connectors.toml
 * relative to this file (repo root).
 */
export function loadConnectorsConfig(path?: string): ConnectorsConfig {
  const resolvedPath =
    path ?? resolve(import.meta.dirname, "../../../connectors.toml");
  const contents = readFileSync(resolvedPath, "utf8");
  return parseConnectorsToml(contents);
}

/** Pure: parse TOML string → ConnectorsConfig. Exported for tests. */
export function parseConnectorsToml(contents: string): ConnectorsConfig {
  let parsed: Record<string, unknown>;
  try {
    parsed = toml.parse(contents) as Record<string, unknown>;
  } catch (err) {
    throw new ConnectorsConfigError(`Invalid TOML: ${(err as Error).message}`);
  }

  const def = (parsed["default"] ?? {}) as Record<string, string>;
  if (typeof def !== "object" || Array.isArray(def)) {
    throw new ConnectorsConfigError("[default] must be a table of category → server");
  }

  const cfg: ConnectorsConfig = { default: def };

  if (parsed["runtime"]) {
    cfg.runtime = parsed["runtime"] as ConnectorsConfig["runtime"];
  }
  if (parsed["plugin"]) {
    cfg.plugin = parsed["plugin"] as ConnectorsConfig["plugin"];
  }
  if (parsed["unconfigured"]) {
    cfg.unconfigured = parsed["unconfigured"] as ConnectorsConfig["unconfigured"];
  }

  return cfg;
}

/**
 * Resolve one ~~category for a given runtime + plugin context.
 * Precedence: plugin override > runtime override > default > unconfigured fallback.
 */
export function resolveCategory(
  config: ConnectorsConfig,
  category: string,
  context: { runtime?: Runtime; plugin?: string } = {},
): ResolvedConnector | null {
  const { runtime, plugin } = context;

  if (plugin && config.plugin?.[plugin]?.[category]) {
    return { kind: "server", server: config.plugin[plugin][category] };
  }
  if (runtime && config.runtime?.[runtime]?.[category]) {
    return { kind: "server", server: config.runtime[runtime]![category]! };
  }
  if (config.default[category]) {
    return { kind: "server", server: config.default[category] };
  }
  if (config.unconfigured?.[category]) {
    const u = config.unconfigured[category];
    return { kind: "fallback", fallback: u.fallback, plugins: u.plugins, note: u.note };
  }
  return null;
}
