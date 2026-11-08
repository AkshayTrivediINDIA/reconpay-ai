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

export async function apiFetch<T = unknown>(
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "same-origin",
  });
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
