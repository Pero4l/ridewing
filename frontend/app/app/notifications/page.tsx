"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useNotifications } from "@/components/notifications-context";
import { Avatar } from "@/components/avatar";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { InlineSpinner } from "@/components/spinner";
import { BellIcon } from "@/components/icons";
import { timeAgo } from "@/lib/format";
import type { NotificationItem, Page } from "@/lib/types";

type NotificationCopy = {
  text: string;
  href: string | null;
};

const PAD_BEFORE_READ_SECONDS = 3;

const postIdFrom = (data: Record<string, unknown>) =>
  typeof data.postId === "string" ? data.postId : null;

function describe(item: NotificationItem): NotificationCopy {
  const data = item.data ?? {};
  const actorLink = `/app/profile/${item.actor?.username ?? ""}`;
  const communitySlug =
    typeof data.communitySlug === "string" ? data.communitySlug : typeof data.slug === "string" ? data.slug : null;
  const communityLink = communitySlug ? `/app/communities/${communitySlug}` : null;
  const postId = postIdFrom(data);
  const postLink = postId ? `/app` : null;

  switch (item.type) {
    case "follow":
      return { text: "started following you", href: actorLink };
    case "community_join_request":
      return { text: communitySlug ? `requested to join ${communitySlug}` : "requested to join your community", href: communityLink };
    case "community_join_approved":
      return { text: communitySlug ? `approved your request to join ${communitySlug}` : "approved your request to join a community", href: communityLink };
    case "community_join_rejected":
      return { text: communitySlug ? `declined your request to join ${communitySlug}` : "declined your request to join a community", href: communityLink };
    case "community_role_changed":
      return { text: communitySlug ? `changed your role in ${communitySlug}` : "changed your role in a community", href: communityLink };
    case "ride_invite":
      return { text: "invited you to a ride", href: `/app/rides` };
    case "post_like":
      return { text: "liked your post", href: postLink };
    case "post_comment":
      return { text: "commented on your post", href: postLink };
    case "post_share":
      return { text: "shared your post", href: postLink };
    default:
      return { text: item.type.replaceAll("_", " "), href: actorLink || null };
  }
}

export default function NotificationsPage() {
  const { refresh: refreshCount } = useNotifications();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const markedRef = useRef(false);

  const load = useCallback(async (cursor: string | null = null) => {
    try {
      const page = await api.get<Page<NotificationItem>>(
        cursor ? `/api/notifications?cursor=${encodeURIComponent(cursor)}` : "/api/notifications",
      );
      setItems((current) => (cursor ? [...current, ...page.items] : page.items));
      setHasMore(page.pageInfo.hasMore);
      setNextCursor(page.pageInfo.nextCursor);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load notifications");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await api.get<Page<NotificationItem>>("/api/notifications");
        if (cancelled) return;
        setItems(page.items);
        setHasMore(page.pageInfo.hasMore);
        setNextCursor(page.pageInfo.nextCursor);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load notifications");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unreadIds = items.filter((item) => !item.readAt).map((item) => item.id);

  const markAllRead = useCallback(async () => {
    if (markedRef.current || unreadIds.length === 0) return;
    markedRef.current = true;
    try {
      await api.post("/api/notifications/read");
      setItems((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: new Date().toISOString() })));
      await refreshCount();
    } catch {
      // Re-sync next time the rider visits.
    } finally {
      markedRef.current = false;
    }
  }, [unreadIds.length, refreshCount]);

  useEffect(() => {
    if (!unreadIds.length) return;
    const started = Date.now();
    const timer = setTimeout(() => {
      void markAllRead();
    }, Math.max(0, PAD_BEFORE_READ_SECONDS * 1000 - started));
    return () => clearTimeout(timer);
  }, [unreadIds.length, markAllRead]);

  return (
    <div>
      <PageHeader>
        <h1 className="flex-1 text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Notifications</h1>
        {unreadIds.length > 0 && <Badge tone="blue">{unreadIds.length} new</Badge>}
      </PageHeader>

      {loading ? (
        <div className="grid place-items-center py-14">
          <InlineSpinner />
        </div>
      ) : error && items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BellIcon size={32} />}
          title="All quiet"
          description="Follows, join requests and role changes land here."
        />
      ) : (
        <>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.map((item) => {
              const copy = describe(item);
              const tinted = !item.readAt;
              return (
                <div key={item.id} className={`flex items-start gap-3 px-4 py-3 ${tinted ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}>
                  <Avatar
                    name={item.actor?.displayName ?? null}
                    username={item.actor?.username ?? "?"}
                    image={item.actor?.profileImage ?? null}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-zinc-700 dark:text-zinc-300">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{item.actor?.displayName ?? "Someone"}</span>{" "}
                      {copy.text}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">{timeAgo(item.createdAt)}</p>
                  </div>
                  {copy.href && (
                    <Link href={copy.href} className="shrink-0 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
                      View
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div className="flex justify-center py-5">
              <button
                type="button"
                onClick={() => {
                  setLoadingMore(true);
                  void load(nextCursor ?? undefined);
                }}
                disabled={loadingMore}
                className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                {loadingMore ? "Loading…" : "Show older"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}