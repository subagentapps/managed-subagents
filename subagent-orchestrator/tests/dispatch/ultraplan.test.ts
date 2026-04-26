// Tests for src/dispatch/ultraplan.ts. Mock-only.

import { describe, expect, it } from "vitest";

import { dispatchUltraplan } from "../../src/dispatch/ultraplan.js";
import type { SdkMessage, SdkResultMessage } from "../../src/dispatch/local.js";
import type { Task } from "../../src/types.js";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "t",
    title: "x",
    prompt: "design migration from sessions to JWTs",
    disposition: "ultraplan",
    repo: "owner/repo",
    branch: "main",
    automerge: false,
    deepReview: false,
    dependsOn: [],
    ...overrides,
  };
}

const successResult: SdkResultMessage = {
  type: "result",
  subtype: "success",
  result: "ultraplan launched",
  total_cost_usd: 0.15,
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

describe("dispatchUltraplan", () => {
  it("returns status='dispatched' on successful kickoff", async () => {
    const result = await dispatchUltraplan(makeTask({ id: "ok" }), {
      sdkOverride: mockQuery([successResult]),
    });
    expect(result.taskId).toBe("ok");
    expect(result.status).toBe("dispatched");
    expect(result.costUsdEstimate).toBe(0.15);
  });

  it("prefixes the prompt with /ultraplan", async () => {
    let observedPrompt = "";
    await dispatchUltraplan(makeTask({ id: "p", prompt: "do the thing" }), {
      sdkOverride: {
        query: (input) => {
          observedPrompt = input.prompt;
          return (async function* () {
            yield successResult;
          })();
        },
      },
    });
    expect(observedPrompt).toBe("/ultraplan do the thing");
  });

  it("returns failed when budget exceeded", async () => {
    const result = await dispatchUltraplan(makeTask({ id: "expensive" }), {
      maxBudgetUsd: 0.5,
      sdkOverride: mockQuery([
        { type: "result", subtype: "success", total_cost_usd: 1.0 },
      ]),
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/exceeded budget/);
  });

  it("returns failed on SDK exception", async () => {
    const result = await dispatchUltraplan(makeTask({ id: "throw" }), {
      sdkOverride: {
        query: () =>
          (async function* () {
            yield { type: "system" } as SdkMessage;
            throw new Error("network down");
          })(),
      },
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/SDK error during ultraplan/);
  });

  it("returns failed on non-success result subtype", async () => {
    const result = await dispatchUltraplan(makeTask({ id: "bad" }), {
      sdkOverride: mockQuery([
        { type: "result", subtype: "error_max_turns", total_cost_usd: 0.1 },
      ]),
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/error_max_turns/);
  });
});
