import { z } from "zod";

const bool = (value: string | undefined, fallback = false) =>
  value === undefined ? fallback : value === "true" || value === "1";

function appUrl(value: string | undefined): string {
  const trimmed = (value ?? "").trim().replace(/\/$/, "");
  if (!trimmed) return "http://localhost:3000";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export const env = {
  appUrl: appUrl(process.env.APP_URL),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  demoMode: bool(process.env.DEMO_MODE, false),
  authSecret: process.env.AUTH_SECRET ?? "",
  encryptionKey: process.env.APP_ENCRYPTION_KEY ?? "",
  storageDir: process.env.STORAGE_DIR ?? ".data/storage",
  supabaseUrl: process.env.SUPABASE_URL?.replace(/\/$/, "") ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  supabaseBucket: process.env.SUPABASE_STORAGE_BUCKET ?? "reconpay-evidence",
  openaiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  openaiTimeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 30000),
  paypalEnv: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox",
  paypalClientId: process.env.PAYPAL_CLIENT_ID ?? "",
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "",
  paypalWebhookId: process.env.PAYPAL_WEBHOOK_ID ?? "",
  resendKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "ReconPay AI <no-reply@localhost>",
  sentryDsn: process.env.SENTRY_DSN ?? "",
  runMigrations: bool(process.env.RUN_MIGRATIONS, false),
  enableRls: bool(process.env.ENABLE_RLS, false),
} as const;

export function assertProductionSecrets(): void {
  if (!env.isProduction) return;
  if (env.authSecret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters in production");
  }
}

export function getPaypalBaseUrl(): string {
  return env.paypalEnv === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function paypalConfigured(): boolean {
  return Boolean(env.paypalClientId && env.paypalClientSecret);
}

export function aiConfigured(): boolean {
  return Boolean(env.openaiKey);
}

export function supabaseStorageConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceKey);
}

export const paypalSupportedCurrencies = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "SGD",
  "HKD",
  "NZD",
] as const;

export function isPaypalSupportedCurrency(currency: string): boolean {
  return (paypalSupportedCurrencies as readonly string[]).includes(
    currency.toUpperCase(),
  );
}

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(320),
  password: z.string().min(1).max(200),
});

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200)
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[0-9]/, "Password must include a number");
