import { test, expect } from "@playwright/test";

const PASSWORD = process.env.APP_PASSWORD ?? "test-password";

test.describe("Auth", () => {
  test("unauthenticated request to / redirects to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated request to /sent redirects to /login", async ({ page }) => {
    await page.goto("/sent");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login with correct password redirects to search", async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[type='password']", PASSWORD);
    await page.click("button[type='submit']");
    await expect(page).toHaveURL(/\/(search)?$/);
  });

  test("login with wrong password stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[type='password']", "wrong-password");
    await page.click("button[type='submit']");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Search view (authenticated)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[type='password']", PASSWORD);
    await page.click("button[type='submit']");
    await page.waitForURL(/\/(search)?$/);
  });

  test("search page renders filter panel and empty results state", async ({ page }) => {
    await expect(page.getByText("Filters")).toBeVisible();
    await expect(page.getByText(/Set filters and click Search/)).toBeVisible();
  });

  test("clicking Search shows loading skeleton then results or error", async ({ page }) => {
    await page.getByRole("button", { name: "Search" }).click();

    // Either skeleton appears briefly or we get results/error — all valid states
    const skeleton = page.locator(".animate-pulse").first();
    const noResultsText = page.getByText(/No results|Search failed|Rate limited/);
    const resultsTable = page.locator("table");

    await expect(skeleton.or(noResultsText).or(resultsTable)).toBeVisible({ timeout: 15000 });
  });

  test("sidebar nav has Search, Sent, Settings links", async ({ page }) => {
    await expect(page.getByRole("link", { name: /Search/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Sent/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Settings/i })).toBeVisible();
  });
});

test.describe("Settings (authenticated)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[type='password']", PASSWORD);
    await page.click("button[type='submit']");
    await page.waitForURL(/\/(search)?$/);
  });

  test("settings page shows token and week-cap sections", async ({ page }) => {
    await page.getByRole("link", { name: /Settings/i }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByText(/API Token/i)).toBeVisible();
    await expect(page.getByText(/Week Cap|Weekly cap/i)).toBeVisible();
  });
});
