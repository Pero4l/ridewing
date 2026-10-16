"use client";

import { useCallback, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";

/**
 * Follow/unfollow toggle. Reads the initial state off the profile and keeps the
 * button in sync optimistically. Shows "Follow Back" when the profile user
 * follows the current user.
 */
export function FollowButton({
  user,
  onChanged,
  followedByViewer,
}: {
  user: { username: string; viewerIsFollowing?: boolean };
  onChanged?: (following: boolean) => void;
  followedByViewer?: boolean;
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

  const label =
    followedByViewer && !following
      ? "Follow Back"
      : following
      ? "Following"
      : "Follow";

  return (
    <Button size="sm" variant={following ? "secondary" : "primary"} onClick={toggle} disabled={busy}>
      {label}
    </Button>
  );
}