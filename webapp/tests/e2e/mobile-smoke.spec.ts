import { test, expect } from "@playwright/test";

test("loads with no horizontal scroll on iPhone 16 Pro Max", async ({ page, viewport }) => {
  await page.goto("/");
  // The page must not be horizontally scrollable. Inner elements with their own
  // overflow:auto (like the .terminal codeblock) are allowed — those don't push
  // <html> wider than the viewport.
  const htmlScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const htmlClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(htmlScrollWidth).toBeLessThanOrEqual(htmlClientWidth);
  expect(htmlClientWidth).toBeLessThanOrEqual(viewport!.width);
});

test("hero renders with brand and CTA above the fold", async ({ page, viewport }) => {
  await page.goto("/");
  await expect(page.getByText(/managedsubagents/i).first()).toBeVisible();
  const cta = page.getByRole("link", { name: /install/i });
  await expect(cta).toBeVisible();
  const box = await cta.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeLessThan(viewport!.height);
});

test("self-referential counter shows the build-meta numbers", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/this site was shipped by/i)).toBeVisible();
  await expect(page.getByText("$3.35")).toBeVisible();
});

test("at least one PR link is clickable", async ({ page }) => {
  await page.goto("/");
  const prLink = page.locator('a[href*="github.com/subagentapps/managed-subagents/pull/"]').first();
  await expect(prLink).toBeVisible();
  expect(await prLink.getAttribute("href")).toMatch(/pull\/\d+$/);
});
