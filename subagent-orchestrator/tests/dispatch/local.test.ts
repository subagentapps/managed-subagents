// Tests for src/dispatch/local.ts. Mock-only — no real SDK calls.

import { describe, expect, it } from "vitest";

import {
  dispatchLocal,
  resolvePermissionShape,
  type SdkMessage,
  type SdkResultMessage,
} from "../../src/dispatch/local.js";
import type { Task } from "../../src/types.js";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "t",
    title: "x",
    prompt: "y",
    disposition: "local",
    repo: "",
    branch: "main",
    automerge: false,
    deepReview: false,
    dependsOn: [],
    ...overrides,
  };
}

function mockQuery(messages: SdkMessage[]) {
  return {
    query: () =>
      (async function* () {
        for (const m of messages) yield m;
      })(),
  };
}

const successResult: SdkResultMessage = {
  type: "result",
  subtype: "success",
  result: "all good",
  total_cost_usd: 0.05,
  session_id: "sess_test",
};

describe("resolvePermissionShape", () => {
  it("returns plan + read-only tools for investigation language", () => {
    const r = resolvePermissionShape(
      makeTask({ title: "Investigate slow query", prompt: "read-only inspection" }),
    );
    expect(r.permissionMode).toBe("plan");
    expect(r.allowedTools).toEqual(["Read", "Glob", "Grep", "Bash"]);
  });

  it("returns acceptEdits + edit tools for everything else", () => {
    const r = resolvePermissionShape(makeTask({ title: "Fix the bug", prompt: "edit X" }));
    expect(r.permissionMode).toBe("acceptEdits");
    expect(r.allowedTools).toEqual(["Read", "Glob", "Grep", "Bash", "Edit", "Write"]);
  });
});

describe("dispatchLocal", () => {
  it("returns ready-for-merge on success", async () => {
    const result = await dispatchLocal(makeTask({ id: "happy" }), {
      sdkOverride: mockQuery([successResult]),
    });
    expect(result.taskId).toBe("happy");
    expect(result.status).toBe("ready-for-merge");
    expect(result.costUsdEstimate).toBe(0.05);
    expect(result.ultrareviewUsed).toBe(false);
  });

  it("returns failed when SDK returns no result message", async () => {
    const result = await dispatchLocal(makeTask({ id: "no-result" }), {
      sdkOverride: mockQuery([{ type: "assistant" }]),
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/no result/);
  });

  it("returns failed on non-success subtype", async () => {
    const result = await dispatchLocal(makeTask({ id: "max-turns" }), {
      sdkOverride: mockQuery([
        { type: "result", subtype: "error_max_turns", total_cost_usd: 0.2 },
      ]),
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/error_max_turns/);
    expect(result.costUsdEstimate).toBe(0.2);
  });

  it("returns failed when budget exceeded mid-stream", async () => {
    const result = await dispatchLocal(makeTask({ id: "expensive" }), {
      maxBudgetUsd: 1.0,
      sdkOverride: mockQuery([
        { type: "result", subtype: "success", total_cost_usd: 1.50 },
      ]),
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/Budget exceeded/);
    expect(result.costUsdEstimate).toBe(1.50);
  });

  it("wraps SDK exceptions", async () => {
    const result = await dispatchLocal(makeTask({ id: "throws" }), {
      sdkOverride: {
        query: () =>
          (async function* () {
            yield { type: "system" } as SdkMessage;
            throw new Error("network down");
          })(),
      },
    });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/SDK error: network down/);
  });

  it("respects maxTurns by passing it to the SDK", async () => {
    let observedOptions: unknown = null;
    const result = await dispatchLocal(makeTask({ id: "turns" }), {
      maxTurns: 7,
      sdkOverride: {
        query: (input) => {
          observedOptions = input.options;
          return (async function* () {
            yield successResult;
          })();
        },
      },
    });
    expect(result.status).toBe("ready-for-merge");
    expect((observedOptions as { maxTurns: number }).maxTurns).toBe(7);
  });

  it("passes resolved permissionMode to the SDK", async () => {
    let observedOptions: unknown = null;
    await dispatchLocal(makeTask({ id: "perm", title: "investigate slow query" }), {
      sdkOverride: {
        query: (input) => {
          observedOptions = input.options;
          return (async function* () {
            yield successResult;
          })();
        },
      },
    });
    expect((observedOptions as { permissionMode: string }).permissionMode).toBe("plan");
  });

  it("uses cwd override when provided", async () => {
    let observedOptions: unknown = null;
    await dispatchLocal(makeTask({ id: "cwd" }), {
      cwd: "/tmp/custom-cwd",
      sdkOverride: {
        query: (input) => {
          observedOptions = input.options;
          return (async function* () {
            yield successResult;
          })();
        },
      },
    });
    expect((observedOptions as { cwd: string }).cwd).toBe("/tmp/custom-cwd");
  });
});
