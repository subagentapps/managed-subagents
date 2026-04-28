import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Hero } from "./Hero";

describe("Hero", () => {
  it("renders the brand", () => {
    render(<Hero />);
    expect(screen.getByText(/managedsubagents/i)).toBeDefined();
  });

  it("renders the headline mentioning autonomous orchestration", () => {
    render(<Hero />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /autonomous|orchestrat|merge|ship/i,
    );
  });

  it("renders a fake terminal prompt with $ marker", () => {
    render(<Hero />);
    // Two prompts: one starting line, one for the dispatch command
    expect(screen.getAllByText("$").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the primary CTA linking to GitHub", () => {
    render(<Hero />);
    const cta = screen.getByRole("link", { name: /install/i });
    expect(cta.getAttribute("href")).toMatch(/github\.com/);
  });
});
