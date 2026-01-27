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

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch (networkError) {
    throw new ApiError(0, "Network error. Please check your connection.");
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

  return (await res.json()) as T;
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
