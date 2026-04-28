import { describe, it, expect } from "vitest";
import { BUILD_META } from "./build-meta";

describe("BUILD_META", () => {
  it("has all required fields populated", () => {
    expect(BUILD_META.builtBySubagents).toBeGreaterThan(0);
    expect(BUILD_META.costUsd).toBeGreaterThan(0);
    expect(BUILD_META.wallTimeMinutes).toBeGreaterThan(0);
    expect(Array.isArray(BUILD_META.prNumbers)).toBe(true);
    expect(BUILD_META.prNumbers.length).toBeGreaterThan(0);
    expect(BUILD_META.workerVersionId).toMatch(/^[0-9a-f]{8}-/);
    expect(BUILD_META.deployedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("subagent count matches PR count", () => {
    expect(BUILD_META.builtBySubagents).toBe(BUILD_META.prNumbers.length);
  });
});
