// Tests for src/store/auth.ts.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthError, resolveOAuthToken } from "../../src/store/auth.js";

describe("resolveOAuthToken", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = savedEnv;
    } else {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
  });

  it("reads from env when CLAUDE_CODE_OAUTH_TOKEN is set", () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "tok_test_value_123";
    expect(resolveOAuthToken()).toBe("tok_test_value_123");
  });

  it("treats empty env value as missing and falls back", () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "";
    // No keychain item under a fake service name, so this should throw.
    expect(() =>
      resolveOAuthToken({ service: "definitely-does-not-exist-zzz" }),
    ).toThrow(AuthError);
  });

  it("supports custom env var name", () => {
    process.env.MY_CUSTOM_TOKEN = "tok_custom";
    try {
      expect(resolveOAuthToken({ envVar: "MY_CUSTOM_TOKEN" })).toBe("tok_custom");
    } finally {
      delete process.env.MY_CUSTOM_TOKEN;
    }
  });

  it("throws AuthError with helpful message when not found anywhere", () => {
    expect(() =>
      resolveOAuthToken({
        envVar: "DEFINITELY_UNSET_ZZZ_VAR",
        service: "definitely-does-not-exist-zzz",
      }),
    ).toThrow(/Run `claude setup-token`/);
  });
});
