import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SelfRef } from "./SelfRef";

describe("SelfRef", () => {
  it("renders the subagent count from BUILD_META", () => {
    render(<SelfRef />);
    // BUILD_META.builtBySubagents = 6
    expect(screen.getByText(/^6$/)).toBeDefined();
  });

  it("renders the cost figure", () => {
    render(<SelfRef />);
    expect(screen.getByText(/\$3\.35/)).toBeDefined();
  });

  it("links to one of the PRs that built this site", () => {
    render(<SelfRef />);
    const links = screen.getAllByRole("link");
    expect(links.some((a) => /pull\/57/.test(a.getAttribute("href") ?? ""))).toBe(true);
  });
});
