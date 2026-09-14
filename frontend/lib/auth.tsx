"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AUTH_EXPIRED_EVENT,
  getAccessToken,
  postLogin,
  postLogout,
  postRegister,
  refreshSession,
  setAccessToken,
} from "./api";
import type { Me } from "./types";
import { disconnectSocket } from "./socket";

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

  // Restore a cookie-backed session on boot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const restored = await refreshSession();
        if (cancelled) return;
        setStatus(restored ? "authed" : "guest");
      } catch {
        if (!cancelled) setStatus("guest");
      }
    })();
    return () => {
      cancelled = true;
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
  }, []);

  const register = useCallback(async (payload: Record<string, unknown>) => {
    const session = await postRegister(payload);
    setUser(session.user);
    setStatus("authed");
  }, []);

  const logout = useCallback(async () => {
    try {
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