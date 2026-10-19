import { Platform } from "react-native";

import type { ApiErrorBody, ConnectedUser } from "./types";

/**
 * Generous enough to survive a cold start on a free-tier host (Render spins down
 * after inactivity and the first request can take tens of seconds), while still
 * failing fast enough on a genuinely dead host that the UI does not look frozen.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * The API client.
 *
 * Mirrors `frontend/lib/api.ts` deliberately: same refresh discipline, same
 * single-flight lock, same 401 recovery. The differences are all platform ones —
 * tokens live in the Keychain / Keystore via `expo-secure-store` rather than
 * `sessionStorage`, and cookies are handled by `credentials: "include"`.
 */

/** Compile-time default, baked in by `EXPO_PUBLIC_API_URL`. */
const API_URL_DEFAULT =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

/**
 * The base URL can be overridden at runtime and is persisted in secure storage.
 *
 * `EXPO_PUBLIC_API_URL` is inlined at build time, which makes the wrong value
 * unfixable without a rebuild — and `localhost` is wrong on an Android emulator
 * (needs 10.0.2.2) and on a physical device (needs your machine's LAN IP). Being
 * able to fix it from Settings, on the device, is the difference between "the app
 * is broken" and "one field to change".
 */
const BASE_URL_KEY = "ridewing.api-base-url";

let baseUrlOverride: string | null = null;
const baseUrlListeners = new Set<() => void>();

export function getBaseUrl(): string {
  return baseUrlOverride ?? API_URL_DEFAULT;
}

export function onBaseUrlChange(listener: () => void): () => void {
  baseUrlListeners.add(listener);
  return () => baseUrlListeners.delete(listener);
}

export async function setBaseUrl(value: string | null): Promise<void> {
  const trimmed = value?.trim().replace(/\/+$/, "") ?? "";
  const next = trimmed.length > 0 ? trimmed : null;
  if (next === baseUrlOverride) return;
  baseUrlOverride = next;
  await writeSecure(BASE_URL_KEY, next);
  for (const listener of baseUrlListeners) listener();
}

/** True when the current value is one that cannot work on this device. */
export function unreachableBaseUrlHint(): string | null {
  const url = getBaseUrl();
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(url);
  if (!isLocal) return null;
  if (Platform.OS === "android") {
    return "On an Android emulator the host machine is 10.0.2.2, not localhost.";
  }
  if (Platform.OS === "ios") {
    return "On the iOS simulator localhost is the host. On a real iPhone use your computer's LAN IP.";
  }
  if (Platform.OS === "web") {
    // The browser already runs on the host, so localhost is correct here.
    return null;
  }
  return "localhost points at the device itself. Use your computer's LAN IP.";
}

const ACCESS_TOKEN_KEY = "ridewing.access-token";
const DEVICE_ID_KEY = "ridewing.device-id";

// ── storage ──────────────────────────────────────────────────────────────────

/**
 * `expo-secure-store` and `expo-crypto` are native modules, so they are required
 * on demand rather than imported at the top of the file.
 *
 * This module is in the app's *startup* graph (session bootstrap → here), and an
 * eagerly-imported native module that the running binary does not contain throws
 * during module evaluation — which takes down the entire app, not just the
 * feature that needed it. Loading them inside already-async helpers removes them
 * from the critical mount path entirely.
 */
type SecureStoreModule = typeof import("expo-secure-store");
type CryptoModule = typeof import("expo-crypto");

let secureStore: SecureStoreModule | null = null;
let cryptoModule: CryptoModule | null = null;

function loadSecureStore(): SecureStoreModule {
  if (!secureStore) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    secureStore = require("expo-secure-store") as SecureStoreModule;
  }
  return secureStore;
}

function loadCrypto(): CryptoModule {
  if (!cryptoModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cryptoModule = require("expo-crypto") as CryptoModule;
  }
  return cryptoModule;
}

/**
 * Keychain / Keystore-backed storage, so the access token is not sitting in a
 * world-readable preference file the way AsyncStorage would leave it.
 */
async function readSecure(key: string): Promise<string | null> {
  try {
    return await loadSecureStore().getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeSecure(key: string, value: string | null): Promise<void> {
  try {
    const store = loadSecureStore();
    if (value === null) await store.deleteItemAsync(key);
    else await store.setItemAsync(key, value);
  } catch {
    // Best-effort persistence — a lost token only costs one extra refresh.
  }
}

let accessToken: string | null = null;
let deviceId: string | null = null;

/** Loads the persisted token + device id, minting one on first launch. */
export async function hydrateSession(): Promise<void> {
  const [token, device, base] = await Promise.all([
    readSecure(ACCESS_TOKEN_KEY),
    readSecure(DEVICE_ID_KEY),
    readSecure(BASE_URL_KEY),
  ]);
  accessToken = token;
  baseUrlOverride = base ?? null;
  // `expo-crypto` gives a UUID from the platform CSPRNG, so the binding is not
  // guessable. The backend constrains the shape and fails closed when absent.
  deviceId = device ?? loadCrypto().randomUUID();
  if (!device) await writeSecure(DEVICE_ID_KEY, deviceId);
}

export function getAccessToken() {
  return accessToken;
}

export async function setAccessToken(token: string | null) {
  accessToken = token;
  await writeSecure(ACCESS_TOKEN_KEY, token);
}

export function getDeviceId() {
  return deviceId;
}

export async function setDeviceId(id: string | null) {
  deviceId = id;
  await writeSecure(DEVICE_ID_KEY, id);
}

export function clearSession() {
  accessToken = null;
  deviceId = null;
}

// ── events ───────────────────────────────────────────────────────────────────

/**
 * The socket layer listens for this to rebuild itself, and the navigator listens
 * for it to re-evaluate auth. Both login *and* refresh must fire it — dispatching
 * only from refresh left every listener bound to a dead socket after a
 * sign-out/sign-in round trip in the same app session.
 */
export const SESSION_EVENT = "ridewing:session";
export const AUTH_EXPIRED_EVENT = "ridewing:auth-expired";

type Listener = (session: ConnectedUser | null) => void;
const listeners = new Set<Listener>();

export function onSession(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function announce(session: ConnectedUser | null) {
  for (const listener of listeners) {
    try {
      listener(session);
    } catch {
      // A misbehaving subscriber must not break auth.
    }
  }
}

// ── errors ───────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: { field?: string; message?: string }[];

  constructor(status: number, body: ApiErrorBody | null, fallback: string) {
    super(body?.error?.message || body?.message || fallback);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error?.code;
    const raw = body?.error?.details;
    this.details = Array.isArray(raw)
      ? (raw as { field?: string; message?: string }[])
      : undefined;
  }
}

function parseResponse<T>(status: number, text: string): T {
  const payload = text ? (JSON.parse(text) as T & ApiErrorBody) : ({} as T & ApiErrorBody);
  if (status >= 200 && status < 300) return payload as T;
  throw new ApiError(status, payload, `Request failed (${status})`);
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Skips the bearer header — used for the refresh exchange itself. */
  skipAuth?: boolean;
  /** Internal: prevents unbounded 401 recursion. */
  isRetry?: boolean;
};

// ── refresh ──────────────────────────────────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null;
let refreshRejected = false;

async function coreRefresh(): Promise<boolean> {
  try {
    const session = await request<ConnectedUser>("/api/auth/refresh", {
      method: "POST",
      skipAuth: true,
    });
    await setAccessToken(session.accessToken);
    announce(session);
    refreshRejected = false;
    return true;
  } catch (error) {
    // A 401/403 means the server actively refused the cookie — the session is
    // gone and the rider must sign in again. Anything else is a network blip, so
    // the session is left alone rather than logging someone out mid-ride.
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      refreshRejected = true;
      await setAccessToken(null);
      announce(null);
      return false;
    }
    return false;
  }
}

/**
 * Serializes refresh calls. A burst of 401s must present the cookie exactly
 * once: the backend treats a second rotation of the same token as a leak and
 * revokes the entire session family. Every refresh in the app goes through here.
 */
export function refreshSession(): Promise<boolean> {
  if (refreshRejected) return Promise.resolve(false);
  if (!refreshPromise) {
    refreshPromise = coreRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// ── request ──────────────────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, skipAuth = false, isRetry = false } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken && !skipAuth) headers.Authorization = `Bearer ${accessToken}`;
  // Binds refresh-token rotation to this install. The backend revokes the whole
  // token family on a replay from a different or unbound device.
  if (deviceId) headers["X-Device-Id"] = deviceId;

  const url = `${getBaseUrl()}${path}`;

  // Without a timeout an unreachable host leaves the promise pending for as long
  // as the OS keeps the socket open, so the screen sat on a spinner forever
  // instead of reporting a problem. Fail fast and say what to fix.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      credentials: "include",
      signal: controller.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    const aborted = controller.signal.aborted;
    throw new ApiError(
      0,
      null,
      aborted
        ? `RideWing did not respond within ${REQUEST_TIMEOUT_MS / 1000}s.`
        : `Cannot reach RideWing at ${getBaseUrl()}.`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (
    response.status === 401 &&
    accessToken &&
    !skipAuth &&
    !isRetry &&
    path !== "/api/auth/refresh"
  ) {
    const refetched = await refreshSession();
    // `skipAuth` must stay false: the retry carries the NEW bearer token.
    // Passing skipAuth sent it with no Authorization header, which 401'd again
    // and left the app permanently signed-in-but-dead.
    if (refetched) return request<T>(path, { method, body, isRetry: true });
  }

  return parseResponse<T>(response.status, await response.text());
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ── auth endpoints ───────────────────────────────────────────────────────────

export async function postLogin(identifier: string, password: string) {
  const session = await request<ConnectedUser>("/api/auth/login", {
    method: "POST",
    body: { identifier, password },
    skipAuth: true,
  });
  await setAccessToken(session.accessToken);
  announce(session);
  return session;
}

export async function postRegister(body: Record<string, unknown>) {
  const session = await request<ConnectedUser>("/api/auth/register", {
    method: "POST",
    body,
    skipAuth: true,
  });
  await setAccessToken(session.accessToken);
  announce(session);
  return session;
}

export async function postLogout() {
  try {
    await request<never>("/api/auth/logout", { method: "POST", skipAuth: true });
  } finally {
    await setAccessToken(null);
    announce(null);
  }
}

export async function postForgotPassword(email: string) {
  return request<{ sent: boolean }>("/api/auth/forgot-password", {
    method: "POST",
    body: { email },
    skipAuth: true,
  });
}

export async function postResetPassword(token: string, password: string) {
  return request<never>("/api/auth/reset-password", {
    method: "POST",
    body: { token, password },
    skipAuth: true,
  });
}

export async function verifyEmail(code: string) {
  return request<{ verified: boolean }>("/api/auth/verify-email", {
    method: "POST",
    body: { code },
    skipAuth: true,
  });
}
/** Cheap reachability probe used by Settings and the sign-in screen. */
export async function checkConnection(): Promise<{ ok: boolean; detail: string }> {
  const url = `${getBaseUrl()}/api/health`;
  // Longer than a normal request: on a free-tier host this probe is usually the
  // request that wakes it up.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, detail: `Server replied ${response.status}` };
    const body = (await response.json()) as { status?: string; database?: string };
    return {
      ok: true,
      detail: `Connected — API up, database ${body.database ?? "unknown"}`,
    };
  } catch {
    const aborted = controller.signal.aborted;
    return {
      ok: false,
      detail: aborted ? "No response within 45s (a free-tier host may still be waking up)" : `No answer from ${getBaseUrl()}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
