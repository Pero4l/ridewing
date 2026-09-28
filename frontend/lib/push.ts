"use client";

import { api } from "./api";

/**
 * Web Push (RFC 8030) helpers.
 *
 * Every entry point returns a *reason* instead of a bare boolean. The old shape
 * (`pushEnabled() ? ... : ...`) reported the same `false` for "this browser has
 * no Push API", "the page is not HTTPS" and "the server has no VAPID key",
 * which left the settings toggle greyed out with no explanation at all.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

const SW_URL = "/sw.js";

export type PushUnavailable =
  | "no-vapid-key"
  | "insecure-context"
  | "no-service-worker"
  | "no-push-api"
  | "not-https";

export type PushSupport =
  | { supported: true }
  | { supported: false; reason: PushUnavailable; message: string };

const MESSAGES: Record<PushUnavailable, string> = {
  "no-vapid-key":
    "This server has no push key configured, so notifications cannot be delivered here.",
  "insecure-context":
    "Open RideWing over HTTPS (or on localhost) — browsers only allow notifications on secure connections.",
  "no-service-worker": "This browser does not support service workers, which push needs.",
  "no-push-api": "This browser does not support Web Push notifications.",
  "not-https": "Open RideWing over HTTPS to receive notifications on this device.",
};

export function pushSupport(): PushSupport {
  if (!VAPID_PUBLIC_KEY) return { supported: false, reason: "no-vapid-key", message: MESSAGES["no-vapid-key"] };
  if (typeof window === "undefined") return { supported: false, reason: "no-push-api", message: MESSAGES["no-push-api"] };

  const secure = window.isSecureContext;
  if (!("serviceWorker" in navigator)) {
    return { supported: false, reason: "no-service-worker", message: MESSAGES["no-service-worker"] };
  }
  if (!("PushManager" in window)) {
    // Safari exposes the Push API only in a secure context, so this branch is
    // what an iPhone on plain HTTP actually lands in.
    return {
      supported: false,
      reason: secure ? "no-push-api" : "not-https",
      message: MESSAGES[secure ? "no-push-api" : "not-https"],
    };
  }
  if (!secure) {
    return { supported: false, reason: "insecure-context", message: MESSAGES["insecure-context"] };
  }
  return { supported: true };
}

export function pushEnabled(): boolean {
  return pushSupport().supported;
}

export type PushResult = { ok: true } | { ok: false; message: string };

/**
 * Registers the worker if it is not already active.
 *
 * Callers used to await `navigator.serviceWorker.ready` directly, which never
 * resolves on a device that has never subscribed — so the settings page hung
 * silently instead of reporting "off". Registration happens first here.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    await navigator.serviceWorker.register(SW_URL);
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

function deviceId(): string {
  const key = "ridewing:push:deviceId";
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
  }
  return id;
}

/** The live subscription for this device, or null. Registers the worker first. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await registerServiceWorker();
  if (!registration) return null;
  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Subscribes this device and records it against the signed-in rider.
 *
 * Pass `requestPermission: false` to re-arm an already-granted permission
 * without triggering a browser prompt (used on boot, where there is no user
 * gesture to prompt from).
 */
export async function subscribeToPush({ requestPermission = true } = {}): Promise<PushResult> {
  const support = pushSupport();
  if (!support.supported) return { ok: false, message: support.message };

  const registration = await registerServiceWorker();
  if (!registration) {
    return { ok: false, message: "Notifications could not start on this device. Try reloading the page." };
  }

  let permission = Notification.permission;
  if (permission === "default" && requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return {
      ok: false,
      message:
        permission === "denied"
          ? "Notifications are blocked for this site. Allow them in your browser settings, then try again."
          : "Notifications were not allowed.",
    };
  }

  try {
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      }));

    const raw = subscription.toJSON();
    if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
      return { ok: false, message: "This browser returned an incomplete subscription." };
    }

    // Goes through the authenticated wrapper so the request carries the Bearer
    // token (the push routes require auth) and re-drives the refresh flow on a
    // stale token, just like every other API call.
    await api.post("/api/push/subscribe", {
      endpoint: raw.endpoint,
      p256dh: raw.keys.p256dh,
      auth: raw.keys.auth,
      deviceId: deviceId(),
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : "Could not enable notifications.",
    };
  }
}

export async function unsubscribeFromPush(): Promise<PushResult> {
  try {
    const subscription = await currentSubscription();
    if (subscription) await subscription.unsubscribe();
    await api.delete("/api/push/subscribe", { body: { deviceId: deviceId() } });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : "Could not turn notifications off.",
    };
  }
}

/** Standard VAPID key conversion: base64url → Uint8Array for the browser API. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64url = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64url);
  const array = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) array[i] = raw.charCodeAt(i);
  return array;
}
