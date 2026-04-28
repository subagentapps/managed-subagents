import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Stack } from "./Stack";

describe("Stack", () => {
  it("renders all three primitives", () => {
    render(<Stack />);
    expect(screen.getByText(/^ship$/i)).toBeDefined();
    expect(screen.getByText(/^review$/i)).toBeDefined();
    expect(screen.getByText(/^merge$/i)).toBeDefined();
  });

  it("renders with a section heading", () => {
    render(<Stack />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toBeDefined();
  });
});
