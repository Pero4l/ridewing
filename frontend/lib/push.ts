"use client";

/**
 * Web Push (RFC 8030) helpers.
 *
 * Everything here degrades to a no-op unless the environment advertises a
 * VAPID public key AND the browser supports the Push API — so a dev machine
 * with no `.env` VAPID keys never sees errors, console noise or a guard that
 * blocks the rest of the app.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function pushEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    Boolean(VAPID_PUBLIC_KEY)
  );
}

const SW_URL = "/sw.js";

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.ready;
  return registration;
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

/** Best-effort single-shot: returns true only when a subscription now exists. */
export async function subscribeToPush(): Promise<boolean> {
  if (!pushEnabled()) return false;
  try {
    await navigator.serviceWorker.register(SW_URL);
    const registration = await getRegistration();
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ?? (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    }));

    const raw = subscription.toJSON();
    if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) return false;

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/push/subscribe`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: raw.endpoint,
          p256dh: raw.keys.p256dh,
          auth: raw.keys.auth,
          deviceId: deviceId(),
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!pushEnabled()) return false;
  try {
    const registration = await getRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/push/subscribe`,
      { method: "DELETE", credentials: "include", body: JSON.stringify({ deviceId: deviceId() }) },
    );
    return res.status === 204;
  } catch {
    return false;
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
