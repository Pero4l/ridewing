"use client";

import type { ApiErrorBody, ConnectedUser } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let accessToken: string | null = null;

/** In-flight refresh — concurrent 401s share one exchange instead of racing. */
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown[];

  constructor(message: string, status: number, code?: string, details?: unknown[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const AUTH_EXPIRED_EVENT = "ridewing:auth-expired";

export const IDLE_LOGOUT_MS = 20 * 60 * 1000;

const LAST_ACTIVE_KEY = "ridewing:last-active";

/**
 * Idle tracking lets the app tell "switched away for a moment" apart from
 * "genuinely walked away". Stamps are throttled to 30s so high-frequency events
 * like scroll never hammer localStorage.
 */
export function markActive() {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const previous = Number(localStorage.getItem(LAST_ACTIVE_KEY) ?? 0);
    if (now - previous > 30_000) {
      localStorage.setItem(LAST_ACTIVE_KEY, String(now));
    }
  } catch {
    // Storage unavailable (private mode) — tracking is best-effort.
  }
}

export function idleMs(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_KEY);
    if (!raw) return 0;
    return Math.max(0, Date.now() - Number(raw));
  } catch {
    return 0;
  }
}

function dispatchExpired() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  skipAuth?: boolean;
};

async function request<T>(path: string, { method = "GET", body, skipAuth = false }: RequestOptions = {}): Promise<T> {
  markActive();

  const headers: Record<string, string> = {};

  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken && !skipAuth) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && accessToken && !skipAuth && path !== "/api/auth/refresh") {
    const refetched = await refreshLock();
    if (refetched) return request<T>(path, { method, body, skipAuth });
  }

  return parseResponse<T>(response);
}

/**
 * Serializes refresh calls: a burst of 401s (parallel page-load requests on an
 * expired token) all await the same exchange. Without this, each one presents
 * the same cookie and the backend's rotation logic treats the second as a leaked
 * token, revoking the whole session family.
 */
function refreshLock(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = tryRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as ApiErrorBody;
    const raw = body.error?.message ?? body.message ?? response.statusText;
    throw new ApiError(raw, response.status, body.error?.code, body.error?.details);
  }

  return payload as T;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const session = await request<ConnectedUser>("/api/auth/refresh", { method: "POST", skipAuth: true });
    setAccessToken(session.accessToken);
    window.dispatchEvent(new CustomEvent("ridewing:session", { detail: session }));
    return true;
  } catch {
    // Refused / no cookie. Drop the stale token and let the shell send us to login.
    setAccessToken(null);
    dispatchExpired();
    return false;
  }
}

export function refreshSession(): Promise<boolean> {
  return tryRefresh();
}

/**
 * Same refresh exchange but without the logout side effects: a failed attempt
 * returns `false` and leaves the session decision to the caller (used when a
 * backgrounded tab comes back to the foreground, where a transient network
 * blip should not bounce the user to the login screen).
 */
export async function refreshSessionGentle(): Promise<boolean> {
  try {
    const session = await request<ConnectedUser>("/api/auth/refresh", { method: "POST", skipAuth: true });
    setAccessToken(session.accessToken);
    window.dispatchEvent(new CustomEvent("ridewing:session", { detail: session }));
    return true;
  } catch {
    return false;
  }
}

export async function postLogin(identifier: string, password: string) {
  const session = await request<ConnectedUser>("/api/auth/login", {
    method: "POST",
    body: { identifier, password },
    skipAuth: true,
  });
  setAccessToken(session.accessToken);
  return session;
}

export async function postRegister(body: Record<string, unknown>) {
  const session = await request<ConnectedUser>("/api/auth/register", {
    method: "POST",
    body,
    skipAuth: true,
  });
  setAccessToken(session.accessToken);
  return session;
}

export async function postLogout() {
  try {
    await request<never>("/api/auth/logout", { method: "POST", skipAuth: true });
  } finally {
    setAccessToken(null);
  }
}

export const api = {
  get: <T>(path: string, init?: RequestOptions) => request<T>(path, { ...init, method: "GET" }),
  post: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: "PUT", body }),
  delete: <T>(path: string, init?: RequestOptions) => request<T>(path, { ...init, method: "DELETE" }),
};