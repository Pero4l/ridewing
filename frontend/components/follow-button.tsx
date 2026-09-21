"use client";

import { useCallback, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";

/**
 * Follow/unfollow toggle. Reads the initial state off the profile and keeps the
 * button in sync optimistically.
 */
export function FollowButton({
  user,
  onChanged,
}: {
  user: { username: string; viewerIsFollowing?: boolean };
  onChanged?: (following: boolean) => void;
}) {
  const [following, setFollowing] = useState(user.viewerIsFollowing ?? false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const toggle = useCallback(async () => {
    if (busy) return;
    const next = !following;
    setFollowing(next);
    setBusy(true);
    try {
      if (next) {
        await api.post(`/api/users/${user.username}/follow`);
      } else {
        await api.delete(`/api/users/${user.username}/follow`);
      }
      onChanged?.(next);
    } catch (error) {
      setFollowing(!next);
      toast.error(error instanceof ApiError ? error.message : "Could not update follow");
    } finally {
      setBusy(false);
    }
  }, [following, busy, user.username, onChanged, toast]);

  return (
    <Button size="sm" variant={following ? "secondary" : "primary"} onClick={toggle} disabled={busy}>
      {following ? "Following" : "Follow"}
    </Button>
  );
}