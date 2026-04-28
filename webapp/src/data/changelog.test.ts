import { describe, it, expect } from "vitest";
import { CHANGELOG } from "./changelog";

describe("CHANGELOG", () => {
  it("has length 6", () => {
    expect(CHANGELOG).toHaveLength(6);
  });

  it("each entry has pr, title, mergedAt", () => {
    for (const entry of CHANGELOG) {
      expect(typeof entry.pr).toBe("number");
      expect(typeof entry.title).toBe("string");
      expect(entry.title.length).toBeGreaterThan(0);
      expect(typeof entry.mergedAt).toBe("string");
      expect(entry.mergedAt.length).toBeGreaterThan(0);
    }
  });

  it("PR numbers are strictly increasing", () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      const prev = CHANGELOG[i - 1]!;
      const curr = CHANGELOG[i]!;
      expect(curr.pr).toBeGreaterThan(prev.pr);
    }
  });
});
