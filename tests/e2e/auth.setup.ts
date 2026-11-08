import { expect, request, test as setup } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function loginAndSave(email: string, path: string) {
  const context = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const response = await context.post("/api/auth/login", {
    data: { email, password: "ReconPay!2026" },
  });
  expect(
    response.ok(),
    `Login failed for ${email}: ${response.status()} ${await response.text()}`,
  ).toBeTruthy();
  await context.storageState({ path });
  await context.dispose();
}

setup("authenticate demo administrator", async () => {
  await loginAndSave("admin@demo.reconpay.ai", ".auth/admin.json");
});

setup("authenticate demo vendor", async () => {
  await loginAndSave("vendor@demo.reconpay.ai", ".auth/vendor.json");
});
