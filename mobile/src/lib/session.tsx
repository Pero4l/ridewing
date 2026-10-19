import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  ApiError,
  api,
  clearSession,
  hydrateSession,
  onSession,
  postLogin,
  postLogout,
  postRegister,
  refreshSession,
} from "./api";
import type { Me } from "./types";

/**
 * Session state for the app.
 *
 * `loading` is distinct from `guest` so the navigator can hold the splash screen
 * until the stored token has been checked, instead of flashing the sign-in screen
 * at an already-authenticated rider.
 */
export type SessionStatus = "loading" | "authed" | "guest" | "verify-email";

type SessionContextValue = {
  status: SessionStatus;
  user: Me | null;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-reads the profile without touching the stored token. */
  refreshUser: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<Me | null>(null);

  // Restore on launch: read the stored token, then prove it is still good
  // against the API rather than trusting that a token exists.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await hydrateSession();
      if (cancelled) return;

      const ok = await refreshSession();
      if (cancelled) return;

      // A network failure is not a sign-out — `refreshSession` only reports
      // failure of the server's refusal, so reaching here without a session
      // means the rider genuinely has to sign in.
      if (ok) {
        // Check if email is verified
        const me = await api.get<{ user: Me }>("/api/auth/me");
        setUser(me.user);
        if (me.user.email && !me.user.emailVerifiedAt) {
          setStatus("verify-email");
        } else {
          setStatus("authed");
        }
      } else {
        setStatus("guest");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep in sync with the api layer (login, refresh, expiry).
  useEffect(
    () =>
      onSession((session) => {
        setUser(session?.user ?? null);
        if (session) {
          if (session.user.email && !session.user.emailVerifiedAt) {
            setStatus("verify-email");
          } else {
            setStatus("authed");
          }
        } else {
          setStatus("guest");
          clearSession();
        }
      }),
    [],
  );

  const login = useCallback(async (identifier: string, password: string) => {
    await postLogin(identifier, password);
  }, []);

  const register = useCallback(async (payload: Record<string, unknown>) => {
    await postRegister(payload);
  }, []);

  const logout = useCallback(async () => {
    await postLogout();
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await api.get<{ user: Me }>("/api/auth/me");
    setUser(me.user);
    if (me.user.email && !me.user.emailVerifiedAt) {
      setStatus("verify-email");
    } else {
      setStatus("authed");
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ status, user, login, register, logout, refreshUser }),
    [status, user, login, register, logout, refreshUser],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export { ApiError };