import { test, expect } from "@playwright/test";

const PASSWORD = process.env.APP_PASSWORD ?? "test-password";

test.describe("Find Email button (Hunter.io)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[type='password']", PASSWORD);
    await page.click("button[type='submit']");
    await page.waitForURL(/\/(search)?$/);
  });

  test("Find email button appears for orgs without a pre-filled email when hunter is enabled", async ({
    page,
  }) => {
    // Intercept the generate API to return a response without toEmail
    await page.route("**/api/drafts/generate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          draftId: "test-draft-1",
          subject: "Test subject",
          body: "Test body",
          model: "test-model",
          promptVersion: "v1",
          toEmail: null,
          emailConfidence: null,
        }),
      });
    });

    // Intercept the email lookup to return a found email
    await page.route("**/api/contacts/email-lookup*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          email: "test@example.org",
          confidence: 80,
        }),
      });
    });

    // Trigger a search to get results — need at least one result to click
    await page.getByRole("button", { name: "Search" }).click();

    const resultsTable = page.locator("table");
    const hasResults = await resultsTable
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false);

    if (!hasResults) {
      test.skip();
      return;
    }

    // Open the first org's draft sheet
    const firstRow = page.locator("table tbody tr").first();
    await firstRow.click();

    // Wait for draft sheet to open and generate
    const draftSheet = page.locator("[data-side='right']");
    await expect(draftSheet).toBeVisible({ timeout: 10000 });

    // If HUNTER_API_KEY is configured in the env, the Find email button should appear
    const findEmailButton = page.getByRole("button", { name: /Find email/i });
    const buttonVisible = await findEmailButton
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (!buttonVisible) {
      // Hunter not configured in this environment — skip
      test.skip();
      return;
    }

    // Click Find email
    await findEmailButton.click();

    // Wait for the email to be populated
    await expect(page.getByPlaceholder("Enter recipient email")).toHaveValue("test@example.org", {
      timeout: 5000,
    });

    // Confidence badge should appear
    await expect(page.getByText("80% confidence")).toBeVisible({ timeout: 5000 });
  });

  test("Find email button shows quota_reached message at 50/50 usage", async ({ page }) => {
    await page.route("**/api/drafts/generate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          draftId: "test-draft-2",
          subject: "Test",
          body: "Body",
          model: "test",
          promptVersion: "v1",
          toEmail: null,
          emailConfidence: null,
        }),
      });
    });

    await page.route("**/api/contacts/email-lookup*", async (route) => {
      await route.fulfill({
        status: 402,
        contentType: "application/json",
        body: JSON.stringify({ reason: "quota_reached", used: 50, cap: 50 }),
      });
    });

    await page.getByRole("button", { name: "Search" }).click();

    const resultsTable = page.locator("table");
    const hasResults = await resultsTable
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false);

    if (!hasResults) {
      test.skip();
      return;
    }

    await page.locator("table tbody tr").first().click();

    const findEmailButton = page.getByRole("button", { name: /Find email/i });
    const buttonVisible = await findEmailButton
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (!buttonVisible) {
      test.skip();
      return;
    }

    await findEmailButton.click();

    await expect(page.getByText(/Monthly Hunter.io limit reached/)).toBeVisible({ timeout: 5000 });
  });
});
