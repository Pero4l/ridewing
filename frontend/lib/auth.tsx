"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AUTH_EXPIRED_EVENT,
  getAccessToken,
  IDLE_LOGOUT_MS,
  idleMs,
  markActive,
  postLogin,
  postLogout,
  postRegister,
  refreshSession,
  refreshSessionGentle,
  setAccessToken,
} from "./api";
import type { Me } from "./types";
import { disconnectSocket } from "./socket";
import { subscribeToPush, unsubscribeFromPush } from "./push";

// Push priming is best-effort and never blocks the session transition. The
// browser asks for notification permission once per origin; subsequent logins
// reuse the stored decision and just re-arm the existing subscription.
function primePush() {
  void subscribeToPush();
}

type SessionState = {
  status: "loading" | "authed" | "guest";
  user: Me | null;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionState["status"]>("loading");
  const [user, setUser] = useState<Me | null>(null);
  const refreshingRef = useRef(false);
  const statusRef = useRef<SessionState["status"]>("loading");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Restore a cookie-backed session on boot. A single failed restore on a cold
  // reload would otherwise flip us to "guest" and bounce /app out to /login, so
  // retry once with a short backoff before giving up. Only the first attempt is
  // immediate; the retry waits out a spinning backend (e.g. a Render/Railway
  // cold start) without ever softening the guest gate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Reaching the app only happens through a fresh visit or a reload. If the
      // last activity stamp is older than the idle window, treat it as an honest
      // logout instead of silently restoring the session.
      if (idleMs() >= IDLE_LOGOUT_MS) {
        try {
          await postLogout();
        } catch {
          // Cookie may already be gone — nothing to revoke.
        }
        if (cancelled) return;
        setStatus("guest");
        return;
      }

      const attempt = async (): Promise<boolean> => {
        try {
          return await refreshSession();
        } catch {
          return false;
        }
      };

      let restored = await attempt();
      if (!restored) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (cancelled) return;
        restored = await attempt();
      }

      if (cancelled) return;
      setStatus(restored ? "authed" : "guest");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Idle tracking. Any interaction refreshes the "last active" stamp, and coming
  // back to the tab hot-refreshes the session so a cursor that went stale while
  // the page was backgrounded does not trigger a chain of 401s. A refresh that
  // fails twice falls through to the normal expired-session handling.
  useEffect(() => {
    const mark = () => markActive();
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((event) => window.addEventListener(event, mark, { passive: true }));

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      markActive();
      if (getAccessToken() && statusRef.current === "authed") {
        void (async () => {
          let ok = await refreshSessionGentle();
          if (!ok) {
            await new Promise((resolve) => setTimeout(resolve, 750));
            ok = await refreshSessionGentle();
          }
          if (!ok) {
            setAccessToken(null);
            window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
          }
        })();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      events.forEach((event) => window.removeEventListener(event, mark));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // A 401 that could not be refreshed drops the session.
  useEffect(() => {
    const onExpired = () => {
      disconn();
      setUser(null);
      setStatus("guest");
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  // Keep the in-memory user in sync when a refresh returns a fresh session.
  useEffect(() => {
    const onSession = (event: Event) => {
      const detail = (event as CustomEvent<{ user: Me }>).detail;
      if (detail?.user) {
        setUser(detail.user);
        setStatus("authed");
      }
    };
    window.addEventListener("ridewing:session", onSession);
    return () => window.removeEventListener("ridewing:session", onSession);
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const session = await postLogin(identifier, password);
    setUser(session.user);
    setStatus("authed");
    primePush();
  }, []);

  const register = useCallback(async (payload: Record<string, unknown>) => {
    const session = await postRegister(payload);
    setUser(session.user);
    setStatus("authed");
    primePush();
  }, []);

  const logout = useCallback(async () => {
    try {
      void unsubscribeFromPush();
      await postLogout();
    } finally {
      disconn();
      setAccessToken(null);
      setUser(null);
      setStatus("guest");
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      if (getAccessToken()) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/auth/me`, {
          headers: { Authorization: `Bearer ${getAccessToken()}` },
          credentials: "include",
        });
        if (res.ok) {
          const body = await res.json();
          setUser(body.user);
        }
      }
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  const value = useMemo<SessionState>(
    () => ({ status, user, login, register, logout, refreshUser }),
    [status, user, login, register, logout, refreshUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function disconn() {
  disconnectSocket();
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used within SessionProvider");
  return value;
}