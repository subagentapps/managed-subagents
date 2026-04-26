// Tests for src/classify.ts (M2).

import { describe, expect, it } from "vitest";

import { classify } from "../src/classify.js";
import type { Task } from "../src/types.js";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "t",
    title: "x",
    prompt: "y",
    disposition: "auto",
    repo: "subagentapps/managed-subagents",
    branch: "main",
    automerge: false,
    deepReview: false,
    dependsOn: [],
    ...overrides,
  };
}

describe("classify", () => {
  it("returns explicit disposition unchanged when not auto", () => {
    const result = classify(makeTask({ disposition: "ultraplan" }));
    expect(result.disposition).toBe("ultraplan");
    expect(result.confidence).toBe(1.0);
    expect(result.signals).toEqual(["explicit-override"]);
  });

  it("classifies CI-fix language as autofix", () => {
    const result = classify(makeTask({
      title: "Fix the CI failures on the auth branch",
      prompt: "Get this PR green",
    }));
    expect(result.disposition).toBe("autofix");
    expect(result.signals).toContain("ci-or-pr-fix-language");
  });

  it("classifies architectural design language as ultraplan", () => {
    const result = classify(makeTask({
      title: "Design the migration from sessions to JWTs",
      prompt: "Want a full architectural decision document",
    }));
    expect(result.disposition).toBe("ultraplan");
    expect(result.signals).toContain("design-or-architecture-language");
  });

  it("classifies investigation language as local", () => {
    const result = classify(makeTask({
      title: "Investigate why /healthz is slow",
      prompt: "Read-only — just inspect the code",
    }));
    expect(result.disposition).toBe("local");
    expect(result.signals).toContain("read-only-or-test-language");
  });

  it("classifies @claude mentions as claude-mention", () => {
    const result = classify(makeTask({
      title: "Comment on the PR with a security check",
      prompt: "Trigger the action via @claude",
    }));
    expect(result.disposition).toBe("claude-mention");
    expect(result.signals).toContain("pr-comment-or-mention-language");
  });

  it("classifies remote / new-feature language as web", () => {
    const result = classify(makeTask({
      title: "Implement new feature: SSO",
      prompt: "Run this remotely in the cloud",
    }));
    expect(result.disposition).toBe("web");
    expect(result.signals).toContain("cloud-or-feature-language");
  });

  it("falls back to claude-mention with low confidence when nothing matches", () => {
    const result = classify(makeTask({
      title: "Pet the dog",
      prompt: "Pet the dog three times",
    }));
    expect(result.disposition).toBe("claude-mention");
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.signals).toEqual(["no-match-fallback"]);
  });

  it("first matching rule wins when multiple match", () => {
    // Both autofix ("get this pr green") and local ("run tests") would match.
    // autofix is listed first → wins.
    const result = classify(makeTask({
      title: "Get this PR green by running tests",
      prompt: "Make CI pass",
    }));
    expect(result.disposition).toBe("autofix");
    expect(result.signals.length).toBeGreaterThanOrEqual(1);
  });

  it("returns deterministic confidence per disposition", () => {
    const a = classify(makeTask({
      title: "Fix the CI",
      prompt: "x",
    }));
    const b = classify(makeTask({
      title: "Fix the CI",
      prompt: "y",
    }));
    expect(a.confidence).toBe(b.confidence);
    expect(a.disposition).toBe(b.disposition);
  });
});
