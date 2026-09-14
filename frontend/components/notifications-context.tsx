"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { onSocketEvent } from "@/lib/socket";

type NotificationsContextValue = {
  unreadCount: number;
  refresh: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/**
 * Keeps the unread notification count fresh: fetched once, incremented on live
 * pushes, and fully re-synced whenever a notification page marks items read.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const mountedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const { unreadCount: count } = await api.get<{ unreadCount: number }>("/api/notifications/unread-count");
      setUnreadCount(count);
    } catch {
      // Non-fatal; the badge stays stale until the next refresh.
    }
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    refresh();

    const off = onSocketEvent<{ id: string }>("notification:new", () => {
      setUnreadCount((count) => count + 1);
    });
    return off;
  }, [refresh]);

  return (
    <NotificationsContext.Provider value={{ unreadCount, refresh }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("useNotifications must be used within NotificationsProvider");
  return value;
}