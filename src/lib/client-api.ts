export type ApiErrorShape = {
  error?: {
    code?: string;
    message?: string;
    details?: { issues?: { path: string; message: string }[] };
  };
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly issues?: { path: string; message: string }[];

  constructor(
    message: string,
    status: number,
    code?: string,
    issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

/**
 * Upper bound for a single API call. A sleeping host can take a while to wake
 * up, but the UI must never spin forever without telling the user what happened.
 */
const REQUEST_TIMEOUT_MS = 45_000;

export async function apiFetch<T = unknown>(
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, REQUEST_TIMEOUT_MS);
  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener("abort", abort, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers,
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch {
    const timedOut = controller.signal.aborted && !init.signal?.aborted;
    throw new ApiClientError(
      timedOut
        ? "The server did not respond in time. If the demo was asleep it should be awake now - please try again."
        : "Network error. Check your connection and try again.",
      0,
      timedOut ? "TIMEOUT" : "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json().catch(() => null)) as ApiErrorShape | T | null)
    : null;
  if (!response.ok) {
    const error = body as ApiErrorShape | null;
    throw new ApiClientError(
      error?.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      error?.error?.code,
      error?.error?.details?.issues,
    );
  }
  return body as T;
}
