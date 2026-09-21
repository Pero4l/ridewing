"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { PostCreator } from "@/components/post-creator";
import { PostCard } from "@/components/post-card";
import { EmptyState } from "@/components/ui";
import { SectionTitle } from "@/components/ui";
import { InlineSpinner } from "@/components/spinner";
import type { Page, Post } from "@/lib/types";

export function Feed() {
  const toast = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await api.get<Page<Post>>("/api/posts");
        if (!cancelled) {
          setPosts(page.items);
          setHasMore(page.pageInfo.hasMore);
          setNextCursor(page.pageInfo.nextCursor);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load the feed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const page = await api.get<Page<Post>>("/api/posts");
      setPosts(page.items);
      setHasMore(page.pageInfo.hasMore);
      setNextCursor(page.pageInfo.nextCursor);
      setError(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not refresh the feed");
    }
  }, [toast]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.get<Page<Post>>(`/api/posts?cursor=${encodeURIComponent(nextCursor)}`);
      setPosts((current) => [...current, ...page.items]);
      setHasMore(page.pageInfo.hasMore);
      setNextCursor(page.pageInfo.nextCursor);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not load more posts");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <SectionTitle>Feed</SectionTitle>
      <PostCreator
        onPosted={(post) => {
          setPosts((current) => [post, ...current]);
        }}
      />
      {loading ? (
        <div className="grid place-items-center py-10">
          <InlineSpinner />
        </div>
      ) : error && posts.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
      ) : posts.length === 0 ? (
        <EmptyState
          title="Nothing on the road yet"
          description="Post a photo or a note — it will show up here for every rider."
        />
      ) : (
        <>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onChanged={() => void reload()} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center py-5">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                {loadingMore ? "Loading…" : "Show older posts"}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}