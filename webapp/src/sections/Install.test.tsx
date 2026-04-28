import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Install } from "./Install";

describe("Install", () => {
  it("renders the section", () => {
    const { container } = render(<Install />);
    expect(container.querySelector("section")).toBeTruthy();
  });

  it("contains 'Install' in a heading", () => {
    render(<Install />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent?.toLowerCase()).toContain("install");
  });

  it("has at least one element matching the .terminal class", () => {
    const { container } = render(<Install />);
    const terminals = container.querySelectorAll('[class*="terminal"]');
    expect(terminals.length).toBeGreaterThan(0);
  });
});
