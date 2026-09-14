"use client";

import { io, type Socket } from "socket.io-client";
import { API_URL, getAccessToken } from "./api";

let socket: Socket | null = null;
let currentToken: string | null = null;

export type ChatSocket = Socket;

/** Returns the connected socket, reconnecting with a new token if it changed. */
export function getSocket(): Socket {
  const token = getAccessToken();

  if (socket && currentToken !== token) {
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    if (!token) throw new Error("No access token available for socket connection");
    socket = io(API_URL, {
      transports: ["websocket", "polling"],
      auth: { token },
      withCredentials: true,
    });
    currentToken = token;
  }

  return socket;
}

/**
 * Binds a listener to the live socket. When the socket instance is rebuilt (token
 * change) the listener is reattached automatically. Returns an unsubscribe fn.
 */
export function onSocketEvent<T = unknown>(event: string, handler: (payload: T) => void): () => void {
  const attach = () => getSocket().on(event, handler);
  attach();

  const onRebuild = () => {
    // socket.io keeps listeners across reconnects, but not across a brand-new
    // instance (token rotation), so re-attach then.
    if (!socket?.hasListeners(event)) attach();
  };

  window.addEventListener("ridewing:session", onRebuild);
  return () => {
    window.removeEventListener("ridewing:session", onRebuild);
    socket?.off(event, handler);
  };
}

export function emitWithAck<TInput, TResponse = unknown>(
  event: string,
  payload: TInput,
  timeoutMs = 8000,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Socket request timed out"));
      }
    }, timeoutMs);

    try {
      s.timeout(timeoutMs).emit(event, payload, (_: unknown, response: TResponse) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(response);
      });
    } catch (error) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    }
  });
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  currentToken = null;
}

export function socketIsConnected() {
  return socket?.connected ?? false;
}

const SOCKET_CONNECT_TIMEOUT = 15000;

export function waitForSocket(): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (s.connected) return resolve();

    let settled = false;
    const onConnect = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      s.off("connect", onConnect);
      s.off("connect_error", onError);
    };
    s.once("connect", onConnect);
    s.once("connect_error", onError);
    setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("Socket connection timed out"));
      }
    }, SOCKET_CONNECT_TIMEOUT);
  });
}