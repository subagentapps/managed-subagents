// Auth: read CLAUDE_CODE_OAUTH_TOKEN from the macOS keychain.
//
// Per the W13 SDK runbook (subagent-commands/whats-new/2026wk13/),
// the token is generated once via `claude setup-token` and stored in
// the keychain with `security add-generic-password`. This module reads
// it back at runtime.
//
// Two strategies, in order:
// 1. CLAUDE_CODE_OAUTH_TOKEN env var (used by CI / pre-resolved by caller)
// 2. macOS `security` CLI shellout (only on darwin; no-op elsewhere)

import { execFileSync } from "node:child_process";
import { platform, userInfo } from "node:os";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface ResolveTokenOptions {
  /** Override env var name; default CLAUDE_CODE_OAUTH_TOKEN */
  envVar?: string;
  /** Override keychain account; default current user */
  account?: string;
  /** Override keychain service; default 'claude-code-oauth-token' */
  service?: string;
}

/**
 * Resolve the CLAUDE_CODE_OAUTH_TOKEN. Throws AuthError if not found.
 *
 * Looks at process.env first; falls back to macOS keychain on darwin.
 */
export function resolveOAuthToken(options: ResolveTokenOptions = {}): string {
  const envVar = options.envVar ?? "CLAUDE_CODE_OAUTH_TOKEN";
  const fromEnv = process.env[envVar];
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  if (platform() === "darwin") {
    const account = options.account ?? userInfo().username;
    const service = options.service ?? "claude-code-oauth-token";
    try {
      const out = execFileSync(
        "security",
        ["find-generic-password", "-a", account, "-s", service, "-w"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      const trimmed = out.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    } catch {
      // fall through to throw below
    }
  }

  throw new AuthError(
    `${envVar} not found. Run \`claude setup-token\` to generate one, then either:\n` +
      `  export ${envVar}="<token>"\n` +
      `or store in the macOS keychain:\n` +
      `  security add-generic-password -a "$USER" -s "claude-code-oauth-token" -w "<token>" -U`,
  );
}
