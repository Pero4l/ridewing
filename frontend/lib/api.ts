"use client";

import type { ApiErrorBody, ConnectedUser } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// The access token also lives in sessionStorage (this tab only), so a reload
// restores it instantly instead of bouncing through the cross-site cookie
// round-trip. The HttpOnly refresh cookie stays the source of truth for
// freshness — refresh rotates the token in the background; a genuine rejection
// clears the stored copy.
const ACCESS_SESSION_KEY = "ridewing:access-token";

function readStoredAccessToken(): string | null {
  try {
    if (typeof window !== "undefined") return window.sessionStorage.getItem(ACCESS_SESSION_KEY);
  } catch {
    // Storage unavailable — treat as signed out.
  }
  return null;
}

let accessToken: string | null = readStoredAccessToken();

export function setAccessToken(token: string | null) {
  accessToken = token;
  try {
    if (typeof window === "undefined") return;
    if (token) window.sessionStorage.setItem(ACCESS_SESSION_KEY, token);
    else window.sessionStorage.removeItem(ACCESS_SESSION_KEY);
  } catch {
    // Best-effort persistence.
  }
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
 * Idle tracking tells "switched away for a moment" apart from "genuinely walked
 * away". The stamp lives in *session* storage — scoped to the open tab — so a
 * fresh visit (new tab/reload from scratch) has no stamp and quietly restores
 * the cookie session instead of force-logging the rider out. The timeout only
 * applies to the minimize/return-and-leave-it case, which is what the product
 * meant by "log out after 20 minutes away". Stamps are throttled to 30s so
 * high-frequency events like scroll never hammer storage.
 */
export function markActive() {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const previous = Number(sessionStorage.getItem(LAST_ACTIVE_KEY) ?? 0);
    if (now - previous > 30_000) {
      sessionStorage.setItem(LAST_ACTIVE_KEY, String(now));
    }
  } catch {
    // Storage unavailable (private mode) — tracking is best-effort.
  }
}

export function idleMs(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = sessionStorage.getItem(LAST_ACTIVE_KEY);
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
    const refetched = await refreshSession();
    if (refetched) return request<T>(path, { method, body, skipAuth });
  }

  return parseResponse<T>(response);
}

/**
 * Serializes refresh calls: a burst of 401s (parallel page-load requests on an
 * expired token) all await the same exchange. Without this, each one presents
 * the same cookie and the backend's rotation logic treats the second as a leaked
 * token, revoking the whole session family. Every refresh in the app (the 401
 * cascade, the boot restore and the return-to-tab refresh) goes through this one
 * lock so two refreshes can never race each other's cookie rotation.
 */
let refreshPromise: Promise<boolean> | null = null;
let isRefreshRejected = false;

async function coreRefresh(): Promise<boolean> {
  try {
    const session = await request<ConnectedUser>("/api/auth/refresh", { method: "POST", skipAuth: true });
    setAccessToken(session.accessToken);
    window.dispatchEvent(new CustomEvent("ridewing:session", { detail: session }));
    isRefreshRejected = false;
    return true;
  } catch (error) {
    // A 401/403 means the server actively refused the cookie — the session is
    // over. Anything else (network drop, cold backend, 5xx) is transient and
    // must NOT end the session.
    isRefreshRejected = error instanceof ApiError && (error.status === 401 || error.status === 403);
    if (isRefreshRejected) setAccessToken(null);
    return false;
  }
}

function refreshLock(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = coreRefresh().finally(() => {
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

/**
 * Hard refresh: ends the session when the server actively rejected the cookie.
 * Used by the boot restore and the 401 retry path, where a permanently-dead
 * session should bounce to login rather than hang.
 */
export async function refreshSession(): Promise<boolean> {
  const ok = await refreshLock();
  if (!ok && isRefreshRejected) {
    setAccessToken(null);
    dispatchExpired();
  }
  return ok;
}

/**
 * Soft refresh for the return-to-tab path: never ends the session by itself.
 * Returns `false` on any failure (including a real rejection) and lets the
 * caller decide, so a transient blip on foregrounding never logs the rider out.
 */
export async function refreshSessionGentle(): Promise<boolean> {
  return refreshLock();
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