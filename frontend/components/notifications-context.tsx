"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { onSocketEvent } from "@/lib/socket";

type NotificationsContextValue = {
  unreadCount: number;
  messageUnread: number;
  refresh: () => void;
  refreshMessages: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/**
 * Keeps the unread notification and message counts fresh: fetched once the
 * rider is authed (the boot restore holds the token), re-synced on live pushes,
 * on tab focus, and whenever a message lands. Counts are only fetched while
 * authed — a guest has no Bearer token, so firing these early would 401 on
 * every page load.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);
  const [messageUnread, setMessageUnread] = useState(0);
  const messageRefreshQueuedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const { unreadCount: count } = await api.get<{ unreadCount: number }>("/api/notifications/unread-count");
      setUnreadCount(count);
    } catch {
      // Non-fatal; the badge stays stale until the next refresh.
    }
  }, []);

  // Sums unread counts across every conversation the rider is in.
  const refreshMessages = useCallback(async () => {
    try {
      const res = await api.get<{ conversations: Array<{ unreadCount: number }> }>("/api/conversations");
      setMessageUnread(res.conversations.reduce((total, item) => total + item.unreadCount, 0));
    } catch {
      // Non-fatal.
    }
  }, []);

  const queueMessageRefresh = useCallback(() => {
    if (messageRefreshQueuedRef.current) return;
    messageRefreshQueuedRef.current = true;
    setTimeout(() => {
      messageRefreshQueuedRef.current = false;
      void refreshMessages();
    }, 500);
  }, [refreshMessages]);

  useEffect(() => {
    const authed = status === "authed";
    // Only fetch counts once the boot restore has put the token in memory.
    if (authed) {
      queueMicrotask(() => {
        refresh();
        void refreshMessages();
      });
    }

    const offNotification = onSocketEvent<{ id: string }>("notification:new", () => {
      setUnreadCount((count) => count + 1);
    });
    const offMessage = onSocketEvent("message:new", () => queueMessageRefresh());
    const onVisible = () => {
      if (authed && document.visibilityState === "visible") {
        refresh();
        void refreshMessages();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      offNotification();
      offMessage();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, refresh, refreshMessages, queueMessageRefresh]);

  return (
    <NotificationsContext.Provider value={{ unreadCount, messageUnread, refresh, refreshMessages }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("useNotifications must be used within NotificationsProvider");
  return value;
}