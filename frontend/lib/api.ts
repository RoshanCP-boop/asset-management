const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

// User-friendly error messages for common HTTP errors
const ERROR_MESSAGES: Record<number, string> = {
  400: "Invalid request. Please check your input.",
  401: "Your session has expired. Please log in again.",
  403: "You don't have permission to perform this action.",
  404: "The requested resource was not found.",
  409: "This action conflicts with existing data.",
  422: "Please check your input and try again.",
  500: "Server error. Please try again later.",
  502: "Server is temporarily unavailable. Please try again.",
  503: "Service is temporarily unavailable. Please try again.",
};

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
    this.name = "ApiError";
  }

  // Get a user-friendly message
  get userMessage(): string {
    // If we have a specific detail from the server, use it
    if (this.detail && !this.detail.startsWith("Request failed")) {
      return this.detail;
    }
    // Otherwise, use a generic message based on status
    return ERROR_MESSAGES[this.status] || `An error occurred (${this.status})`;
  }
}

const inFlightRequests = new Map<string, Promise<unknown>>();
const responseCache = new Map<string, { timestamp: number; data: unknown }>();
const CACHE_TTL_MS = 5000;
const MAX_CACHE_SIZE = 100;

// Cleanup stale cache entries periodically
function cleanupCache() {
  const now = Date.now();
  for (const [key, entry] of responseCache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      responseCache.delete(key);
    }
  }
  // If still too large, remove oldest entries
  if (responseCache.size > MAX_CACHE_SIZE) {
    const entries = [...responseCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      responseCache.delete(key);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRequestKey(path: string, init: RequestInit, token?: string) {
  const method = (init.method ?? "GET").toUpperCase();
  const body = typeof init.body === "string" ? init.body : "";
  const auth = token ? `|auth:${token}` : "";
  return `${method}:${path}:${body}${auth}`;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    "Content-Type": "application/json",
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const method = (init.method ?? "GET").toUpperCase();
  const shouldRetry = method === "GET" || method === "HEAD";
  const maxRetries = shouldRetry ? 2 : 0;

  const requestKey = buildRequestKey(path, init, token);
  if (!shouldRetry) {
    responseCache.clear();
  } else {
    cleanupCache();
    const cached = responseCache.get(requestKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data as T;
    }
  }
  if (shouldRetry && inFlightRequests.has(requestKey)) {
    return (await inFlightRequests.get(requestKey)) as T;
  }

  const requestPromise = (async () => {
    let attempt = 0;
    while (true) {
      let res: Response;
      try {
        res = await fetch(`${API_BASE}${path}`, { ...init, headers });
      } catch {
        if (!shouldRetry || attempt >= maxRetries) {
          throw new ApiError(0, "Network error. Please check your connection.");
        }
        attempt += 1;
        await sleep(300 * 2 ** attempt);
        continue;
      }

      if (!res.ok && shouldRetry && [502, 503, 504].includes(res.status) && attempt < maxRetries) {
        attempt += 1;
        await sleep(300 * 2 ** attempt);
        continue;
      }

      // Try to parse error details
      if (!res.ok) {
        let detail = `Request failed (${res.status})`;
        try {
          const data = await res.json();
          detail =
            typeof data?.detail === "string"
              ? data.detail
              : JSON.stringify(data);
        } catch {
          // ignore JSON parse errors
          detail = await res.text().catch(() => detail);
        }
        throw new ApiError(res.status, detail);
      }

      const data = (await res.json()) as T;
      if (shouldRetry) {
        responseCache.set(requestKey, { timestamp: Date.now(), data });
      }
      return data;
    }
  })();

  if (shouldRetry) {
    inFlightRequests.set(requestKey, requestPromise);
    try {
      return await requestPromise;
    } finally {
      inFlightRequests.delete(requestKey);
    }
  }

  return await requestPromise;
}

// Helper to extract user-friendly error message
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.userMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred";
}
