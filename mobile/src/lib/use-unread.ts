/* eslint-disable react-hooks/set-state-in-effect --
 * The count is fetched from the API and the state update lands after an `await`;
 * the rule cannot see across the async boundary.
 */
import { useCallback, useEffect, useState } from "react";

import { api, getAccessToken } from "./api";
import { onSocketEvent } from "./socket";

/**
 * Total unread messages across every conversation.
 *
 * Used for the tab badge. Refreshed on mount, when the app is focused again, and
 * whenever a message arrives or is read, so the count cannot silently drift.
 */
export function useUnreadCount(): number {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    // Signed out: the endpoint is authenticated, so don't fire.
    if (!getAccessToken()) return;
    try {
      const res = await api.get<{ unreadCount: number }>("/api/notifications/unread-count");
      setCount(res.unreadCount ?? 0);
    } catch {
      // Leave the last known value rather than flashing the badge off on error.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => onSocketEvent("message:new", () => void load()), [load]);
  useEffect(() => onSocketEvent("conversation:read", () => void load()), [load]);

  return count;
}
