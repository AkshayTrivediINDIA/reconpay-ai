import { env, getPaypalBaseUrl, paypalConfigured } from "@/lib/env";

export class PaypalError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: string, message: string, status = 502, details?: unknown) {
    super(message);
    this.name = "PaypalError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type TokenCache = { token: string; expiresAt: number; appId?: string };
const globalForPaypal = globalThis as unknown as {
  __reconpayPaypalToken?: TokenCache;
};

async function getAccessToken(): Promise<TokenCache> {
  if (!paypalConfigured()) {
    throw new PaypalError(
      "PAYPAL_NOT_CONFIGURED",
      "PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to the server environment.",
      503,
    );
  }
  const cached = globalForPaypal.__reconpayPaypalToken;
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached;

  const credentials = Buffer.from(
    `${env.paypalClientId}:${env.paypalClientSecret}`,
  ).toString("base64");
  const response = await fetch(`${getPaypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new PaypalError(
      "PAYPAL_AUTH_FAILED",
      `PayPal authentication failed (${response.status}). Verify the sandbox client ID and secret.`,
      response.status === 401 ? 503 : 502,
      { providerStatus: response.status },
    );
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new PaypalError("PAYPAL_BAD_RESPONSE", "PayPal returned an invalid token response");
  }
  const token = typeof data.access_token === "string" ? data.access_token : "";
  if (!token) throw new PaypalError("PAYPAL_BAD_RESPONSE", "PayPal returned no access token");
  const cache: TokenCache = {
    token,
    expiresAt: Date.now() + (Number(data.expires_in ?? 300) - 60) * 1000,
    appId: typeof data.app_id === "string" ? data.app_id : undefined,
  };
  globalForPaypal.__reconpayPaypalToken = cache;
  return cache;
}

async function request<T>(
  path: string,
  init: {
    method: "GET" | "POST";
    body?: unknown;
    idempotencyKey?: string;
  },
): Promise<T> {
  const token = await getAccessToken();
  let lastError: unknown;
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(`${getPaypalBaseUrl()}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${token.token}`,
          "Content-Type": "application/json",
          ...(init.idempotencyKey ? { "PayPal-Request-Id": init.idempotencyKey } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(25_000),
      });
      const text = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        data = { raw: text.slice(0, 500) };
      }
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
          continue;
        }
        const details = Array.isArray(data.details) ? data.details : [];
        const first = details[0] as Record<string, unknown> | undefined;
        throw new PaypalError(
          "PAYPAL_API_ERROR",
          first && typeof first.issue === "string"
            ? `PayPal rejected the request: ${first.issue}`
            : `PayPal request failed (${response.status}).`,
          response.status === 401 ? 503 : 502,
          { providerStatus: response.status, issue: first?.issue, description: first?.description },
        );
      }
      return data as T;
    } catch (error) {
      lastError = error;
      if (
        attempt < 2 &&
        (error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError"))
      ) {
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new PaypalError("PAYPAL_API_ERROR", "PayPal request failed");
}

export type PaypalOrder = {
  id: string;
  status: string;
  links?: { href: string; rel: string; method?: string }[];
  purchase_units?: Record<string, unknown>[];
  payer?: Record<string, unknown>;
};

export async function createPaypalOrder(input: {
  amount: string;
  currency: string;
  settlementNumber: string;
  invoiceNumber: string;
  returnUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}): Promise<PaypalOrder> {
  return request<PaypalOrder>("/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.settlementNumber,
          custom_id: input.settlementNumber,
          invoice_id: input.invoiceNumber,
          description: `ReconPay settlement ${input.settlementNumber}`.slice(0, 127),
          amount: {
            currency_code: input.currency,
            value: input.amount,
          },
        },
      ],
      application_context: {
        brand_name: "ReconPay AI",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    },
  });
}

export async function capturePaypalOrder(
  orderId: string,
  idempotencyKey: string,
): Promise<PaypalOrder> {
  return request<PaypalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    idempotencyKey,
    body: {},
  });
}

export async function getPaypalOrder(orderId: string): Promise<PaypalOrder> {
  return request<PaypalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
  });
}

export async function verifyPaypalWebhook(input: {
  headers: Record<string, string | null>;
  body: Record<string, unknown>;
}): Promise<boolean> {
  if (!paypalConfigured()) {
    throw new PaypalError("PAYPAL_NOT_CONFIGURED", "PayPal is not configured", 503);
  }
  if (!env.paypalWebhookId) {
    throw new PaypalError(
      "PAYPAL_WEBHOOK_NOT_CONFIGURED",
      "PAYPAL_WEBHOOK_ID is not configured; the webhook cannot be verified",
      503,
    );
  }
  const required = {
    auth_algo: input.headers["paypal-auth-algo"],
    cert_url: input.headers["paypal-cert-url"],
    transmission_id: input.headers["paypal-transmission-id"],
    transmission_sig: input.headers["paypal-transmission-sig"],
    transmission_time: input.headers["paypal-transmission-time"],
  };
  if (Object.values(required).some((value) => !value)) {
    throw new PaypalError(
      "PAYPAL_WEBHOOK_HEADERS_MISSING",
      "Required PayPal webhook signature headers are missing",
      400,
    );
  }
  const result = await request<{ verification_status?: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: {
        ...required,
        webhook_id: env.paypalWebhookId,
        webhook_event: input.body,
      },
    },
  );
  return result.verification_status === "SUCCESS";
}

export async function testPaypalConnection(): Promise<{
  connected: boolean;
  environment: string;
  appId?: string;
  message: string;
}> {
  try {
    const token = await getAccessToken();
    return {
      connected: true,
      environment: env.paypalEnv,
      appId: token.appId,
      message: `OAuth token acquired from the PayPal ${env.paypalEnv} environment. REST API connectivity verified.`,
    };
  } catch (error) {
    return {
      connected: false,
      environment: env.paypalEnv,
      message: error instanceof Error ? error.message : "PayPal connectivity test failed",
    };
  }
}

export function clearPaypalTokenCache(): void {
  globalForPaypal.__reconpayPaypalToken = undefined;
}
