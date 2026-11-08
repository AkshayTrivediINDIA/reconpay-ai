import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      APP_URL: "http://localhost:3000",
      DEMO_MODE: "true",
      AUTH_SECRET: "vitest-auth-secret-that-is-long-enough-123456",
      APP_ENCRYPTION_KEY: "vitest-encryption-key-that-is-long-enough-123",
      PAYPAL_CLIENT_ID: "test-client-id",
      PAYPAL_CLIENT_SECRET: "test-client-secret",
      PAYPAL_WEBHOOK_ID: "test-webhook-id",
      OPENAI_API_KEY: "",
      RESEND_API_KEY: "",
    },
  },
});
