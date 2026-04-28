import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Changelog } from "./Changelog";

describe("Changelog", () => {
  it("renders the section", () => {
    const { container } = render(<Changelog />);
    expect(container.querySelector("section")).toBeTruthy();
  });

  it("contains 'changelog' in a heading", () => {
    render(<Changelog />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent?.toLowerCase()).toContain("changelog");
  });

  it("renders 6 list items with PR links", () => {
    const { container } = render(<Changelog />);
    const items = container.querySelectorAll("li");
    expect(items.length).toBe(6);
    const prLinks = container.querySelectorAll(
      'a[href^="https://github.com/subagentapps/managed-subagents/pull/"]',
    );
    expect(prLinks.length).toBe(6);
  });
});
