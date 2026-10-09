import { io, type Socket } from "socket.io-client";

import { getAccessToken, getBaseUrl, onBaseUrlChange, onSession } from "./api";

/**
 * Socket.IO client.
 *
 * Same shape as the web client: a single lazily-built connection, rebuilt when
 * the access token changes, and an `onSocketEvent` helper that transparently
 * re-subscribes across a rebuild. `onSession` is what makes that work — the
 * socket subscribes to it because the api layer dispatches on login *and*
 * refresh, so a sign-out/sign-in round trip re-attaches every listener instead
 * of leaving them bound to a dead socket.
 */

let socket: Socket | null = null;
let currentToken: string | null = null;
let currentBase: string | null = null;

// A changed API URL invalidates the connection, so drop the old one immediately.
onBaseUrlChange(() => disconnectSocket());

export function getSocket(): Socket {
  const token = getAccessToken();
  if (!token) throw new Error("No access token available for socket connection");

  const base = getBaseUrl();
  // The identity is the pair (token, host): changing the API URL in Settings must
  // tear the connection down, or the socket keeps talking to the old backend.
  if (socket && currentToken === token && currentBase === base) return socket;

  // A new token means a new identity: tear the old connection down rather than
  // trying to re-authenticate it, so no listener is ever left double-bound.
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  socket = io(getBaseUrl(), {
    transports: ["websocket"],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });

  currentToken = token;
  currentBase = base;
  return socket;
}

export function disconnectSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  currentToken = null;
  currentBase = null;
}

/**
 * Subscribes to a socket event and re-subscribes automatically if the connection
 * is rebuilt. Returns an unsubscribe function; every caller must use it, or the
 * screen will keep receiving events after unmount.
 */
export function onSocketEvent<T = unknown>(
  event: string,
  handler: (payload: T) => void,
): () => void {
  let live = getSocket();
  let bound: Socket | null = live;

  const attach = (target: Socket) => {
    target.on(event, handler);
    bound = target;
  };
  attach(live);

  const onRebuild = () => {
    try {
      bound?.off(event, handler);
      attach(getSocket());
    } catch {
      // Signed out — nothing to attach to. The listener simply goes quiet until
      // the next session, which is correct for a signed-out user.
    }
  };
  const offSession = onSession(onRebuild);

  return () => {
    offSession();
    bound?.off(event, handler);
  };
}

type Ack = { ok: boolean; error?: { message?: string; code?: string } };

/**
 * Emits with an acknowledgement and a timeout.
 *
 * `getSocket` throws synchronously when signed out, so the throw is converted to
 * a rejection here rather than escaping into a caller's event handler.
 */
export function emitWithAck<T = unknown>(
  event: string,
  payload?: unknown,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let live: Socket;
    try {
      live = getSocket();
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("The rider did not respond. Check your connection."));
    }, timeoutMs);

    live.emit(event, payload, (response: Ack & T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (response?.ok === false) {
        reject(new Error(response.error?.message ?? "Request failed"));
        return;
      }
      resolve(response);
    });
  });
}

/** Resolves once the socket is connected, or rejects on timeout. */
export function waitForSocket(timeoutMs = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    let live: Socket;
    try {
      live = getSocket();
    } catch (error) {
      reject(error);
      return;
    }

    if (live.connected) {
      resolve();
      return;
    }

    const cleanup = () => {
      clearTimeout(timer);
      live.off("connect", onConnect);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Could not reach the ride server."));
    }, timeoutMs);

    live.on("connect", onConnect);
  });
}