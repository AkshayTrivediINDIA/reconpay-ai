import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function signOut(page: Page) {
  await page.getByRole("button", { name: /Asha Menon|Rohan Kapoor|Priya Nair/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

test("unauthenticated users are redirected to sign in", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/invoices");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.goto("/register");
  const createWorkspace = page.getByRole("button", { name: "Create workspace" });
  await expect(createWorkspace).toBeVisible();
  const colors = await createWorkspace.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(colors).toEqual({
    background: "rgb(67, 56, 202)",
    color: "rgb(255, 255, 255)",
  });
});

test("administrator sees live seeded metrics and permitted navigation", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Welcome, Asha/ })).toBeVisible();
  await expect(page.getByText("ReconPay Demo (INR)").first()).toBeVisible();
  await expect(page.getByText("Open discrepancy exposure")).toBeVisible();
  await expect(page.getByText("Invoice value in system")).toBeVisible();
  const sidebar = page.getByRole("navigation", { name: "Sidebar" });
  await expect(sidebar.getByRole("link", { name: "Invoices" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Evidence center" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Reports" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Audit trail" })).toBeVisible();
});

test("invoices and deterministic reconciliation pages expose seeded records", async ({
  page,
}) => {
  await page.goto("/invoices");
  await expect(page.getByRole("heading", { name: "Invoices", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "INV-2026-001", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: "INV-2026-001", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("ABC Office Supplies").first()).toBeVisible();
  await expect(page.getByText("Verified").first()).toBeVisible();

  await page
    .getByRole("navigation", { name: "Sidebar" })
    .getByRole("link", { name: "Reconciliation" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Reconciliation", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("INV-2026-001").first()).toBeVisible();
  await expect(page.getByText("PO-2026-001").first()).toBeVisible();
  const abcRunRow = page.getByRole("row").filter({ hasText: "INV-2026-001" });
  await abcRunRow.getByRole("link", { name: /^Run / }).click();
  await expect(page.getByText("Review signals, not a statement of amount owed")).toBeVisible();
  await expect(page.getByText(/50,000\.00 potential quantity exposure/).first()).toBeVisible();
  await expect(page.getByText(/Received 90 of 100 ordered/).first()).toBeVisible();
  await expect(page.getByText("RECEIVED_QTY_MISMATCH").first()).toBeVisible();
  const runId = page.url().split("/reconciliation/")[1]?.split("?")[0] ?? "";
  expect(runId).toBeTruthy();
  const pdf = await page.request.get(`/api/evidence/${runId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const pdfBytes = await pdf.body();
  expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
});

test("the pending approval queue is visible to an administrator", async ({ page }) => {
  await page.goto("/approvals");
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
  await expect(page.getByText("STL-2026-0001").first()).toBeVisible();
});

test("CSV exports return a spreadsheet-safe attachment", async ({ page }) => {
  const response = await page.request.get("/api/reports/invoices");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(response.headers()["content-disposition"]).toContain("attachment");
  const body = await response.text();
  expect(body.charCodeAt(0)).toBe(0xfeff);
  expect(body).toContain("INV-2026-001");
  expect(body).toContain("500000.00");
});

test.describe("vendor access", () => {
  test.use({ storageState: ".auth/vendor.json" });

  test("vendor users only receive vendor navigation and restricted pages", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Welcome, Priya/ })).toBeVisible();
    const sidebar = page.getByRole("navigation", { name: "Sidebar" });
    await expect(sidebar.getByRole("link", { name: "Your invoices" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Reports" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Audit trail" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Team" })).toHaveCount(0);

    await page.goto("/reports");
    await expect(page).toHaveURL(/\/dashboard\?denied=view_reports/);
    await expect(
      page.getByText("That area is restricted for your role"),
    ).toBeVisible();
  });
});

test("an administrator can switch to the separate USD demo organization", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /ReconPay Demo \(INR\)/ }).click();
  await page.getByRole("menuitem", { name: /ReconPay Demo \(USD\)/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("ReconPay Demo (USD)").first()).toBeVisible();
  await expect(page.getByText("USD").first()).toBeVisible();
  await page.goto("/settlements");
  await expect(page.getByText("STL-2026-0001").first()).toBeVisible();
  await expect(page.getByText("Ready for payment").first()).toBeVisible();
});

test("sign out revokes the browser session", async ({ page }) => {
  await page.goto("/dashboard");
  await signOut(page);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
