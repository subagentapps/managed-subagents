// Tests for src/dispatch/autofix.ts. Mock-only.

import { describe, expect, it } from "vitest";

import { dispatchAutofix } from "../../src/dispatch/autofix.js";
import type { SdkMessage, SdkResultMessage } from "../../src/dispatch/local.js";
import type { Task } from "../../src/types.js";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "t",
    title: "x",
    prompt: "fix CI",
    disposition: "autofix",
    repo: "owner/repo",
    branch: "feat/x",
    automerge: false,
    deepReview: false,
    dependsOn: [],
    ...overrides,
  };
}

const successResult: SdkResultMessage = {
  type: "result",
  subtype: "success",
  result: "autofix launched",
  total_cost_usd: 0.20,
  session_id: "sess_test",
};

function mockQuery(messages: SdkMessage[]) {
  return {
    query: () =>
      (async function* () {
        for (const m of messages) yield m;
      })(),
  };
}

describe("dispatchAutofix", () => {
  it("returns dispatched + prNumber on success", async () => {
    const result = await dispatchAutofix(makeTask({ id: "ok" }), {
      prNumber: 42,
      sdkOverride: mockQuery([successResult]),
    });
    expect(result.taskId).toBe("ok");
    expect(result.status).toBe("dispatched");
    expect(result.prNumber).toBe(42);
    expect(result.costUsdEstimate).toBe(0.20);
  });

  it("uses default refinement that names the PR", async () => {
    let observedPrompt = "";
    await dispatchAutofix(makeTask({ id: "p" }), {
      prNumber: 99,
      sdkOverride: {
        query: (input) => {
          observedPrompt = input.prompt;
          return (async function* () {
            yield successResult;
          })();
        },
      },
    });
    expect(observedPrompt).toBe(
      "/autofix-pr address all CI failures and review comments on PR #99",
    );
  });

  it("supports custom refinement", async () => {
    let observedPrompt = "";
    await dispatchAutofix(makeTask({ id: "custom" }), {
      prNumber: 5,
      refinement: "only fix lint and type errors",
      sdkOverride: {
        query: (input) => {
          observedPrompt = input.prompt;
          return (async function* () {
            yield successResult;
          })();
        },
      },
    });
    expect(observedPrompt).toBe("/autofix-pr only fix lint and type errors");
  });

  it("returns failed when budget exceeded", async () => {
    const result = await dispatchAutofix(makeTask({ id: "expensive" }), {
      prNumber: 1,
      maxBudgetUsd: 0.5,
      sdkOverride: mockQuery([
        { type: "result", subtype: "success", total_cost_usd: 1.0 },
      ]),
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/exceeded budget/);
  });

  it("returns failed on SDK exception", async () => {
    const result = await dispatchAutofix(makeTask({ id: "throw" }), {
      prNumber: 1,
      sdkOverride: {
        query: () =>
          (async function* () {
            yield { type: "system" } as SdkMessage;
            throw new Error("network down");
          })(),
      },
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/SDK error during autofix/);
  });
});
