"use client";

import { use } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-fetch";
import { PostCard } from "@/components/post-card";
import { useSession } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/ui";
import { InlineSpinner } from "@/components/spinner";
import { BackIcon } from "@/components/icons";
import type { Post } from "@/lib/types";

/**
 * A single post at a shareable URL.
 *
 * This is the destination the service worker opens when a rider taps a push
 * notification, and the target a shared link resolves to, so the route has to
 * exist independently of the feed. It reuses `PostCard` rather than
 * reimplementing a post view, which also means a guest reading it sees exactly
 * what a signed-in rider sees.
 */
export default function PostDetailPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = use(params);
  const { user } = useSession();
  const { data, loading, error, reload } = useApi<{ post: Post }>(
    () => api.get<{ post: Post }>(`/api/posts/${postId}`),
    [postId],
  );

  // A like, comment or share mutates the post in place, so `reload` re-runs the
  // loader to pick up the new counts. The URL stays the single source of truth.
  const post = data?.post ?? null;

  return (
    <div>
      <PageHeader className="flex items-center gap-3">
        <Link
          href="/app"
          aria-label="Back to the feed"
          className="grid h-9 w-9 place-items-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <BackIcon size={20} />
        </Link>
        <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Post</span>
      </PageHeader>

      {loading ? (
        <div className="grid place-items-center py-16">
          <InlineSpinner />
        </div>
      ) : error && !post ? (
        <EmptyState title="Post not available" description={error} />
      ) : post ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          <PostCard post={post} viewer={user} onChanged={() => void reload()} />
        </div>
      ) : null}
    </div>
  );
}
