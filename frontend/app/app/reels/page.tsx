"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/avatar";
import { VerifiedBadge } from "@/components/verified-badge";
import { ShareSheet } from "@/components/share-sheet";
import { CommentIcon, HeartIcon, ShareIcon, Volume2Icon, VolumeXIcon } from "@/components/icons";
import { timeAgo } from "@/lib/format";
import { InlineSpinner } from "@/components/spinner";
import type { Post } from "@/lib/types";

const PAGE_SIZE = 6;

/**
 * How much of a reel has to be on screen before it counts as "the one you are
 * watching". High enough that a reel you are scrolling past does not fire up, low
 * enough that it has started by the time it has settled.
 */
const ACTIVE_THRESHOLD = 0.6;

/** Fetch a page earlier than the end, so the next reel is usually already decoded. */
const PREFETCH_MARGIN_PX = 800;

export default function ReelsPage() {
  const { user: me } = useSession();
  const toast = useToast();
  const router = useRouter();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [shareFor, setShareFor] = useState<Post | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Guards against two loads for the same cursor when the sentinel is crossed
  // twice while the first request is still open.
  const inFlight = useRef(false);

  /**
   * Fetches one page. Deliberately does not touch `loading`/`error` on the way in:
   * the caller owns those, so a mount-triggered load never sets state synchronously
   * and a retry can show its spinner the moment it is tapped.
   */
  const load = useCallback(async (nextCursor: string | null, replace: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!replace) setLoadingMore(true);

    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (nextCursor) params.set("cursor", nextCursor);
      const res = await api.get<{ items: Post[]; pageInfo: { hasMore: boolean; nextCursor: string | null } }>(
        `/api/posts/reels?${params.toString()}`,
      );
      setPosts((current) => {
        const merged = replace ? res.items : [...current, ...res.items];
        // The server paginates by cursor, so a repeated id would only mean the
        // page boundary moved under us; de-duplicating keeps the list and the
        // scroll height in step.
        return merged.filter((post, index) => merged.findIndex((other) => other.id === post.id) === index);
      });
      setCursor(res.pageInfo.nextCursor);
      setHasMore(res.pageInfo.hasMore);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load reels");
      setHasMore(false);
    } finally {
      inFlight.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    // Deferred to a microtask so the mount does not run the first load in the
    // same commit as the render — the page paints its spinner first, and the
    // fetch never blocks it. `loading` already starts true and `error` already
    // starts null, so there is nothing to announce before going to the network.
    queueMicrotask(() => void load(null, true));
  }, [load]);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    void load(null, true);
  }, [load]);

  // Infinite scroll: the sentinel sits after the last reel, so paging in starts
  // before the rider hits the end of the current one.
  useEffect(() => {
    if (!hasMore || loading) return;
    const target = sentinelRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void load(cursor, false);
      },
      { root: scrollRef.current, rootMargin: `${PREFETCH_MARGIN_PX}px` },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, cursor, load]);

  /**
   * A like is applied to local state immediately and written after, so the heart
   * fills on the tap rather than when the network gets around to it.
   */
  const likeQueue = useRef<Promise<unknown>>(Promise.resolve());

  const toggleLike = useCallback(
    (post: Post) => {
      if (!me) {
        toast.error("Create a free account to like posts");
        router.push(`/register?next=${encodeURIComponent("/app/reels")}`);
        return;
      }
      const nextLiked = !post.viewerLiked;
      setPosts((current) =>
        current.map((item) =>
          item.id === post.id
            ? { ...item, viewerLiked: nextLiked, likeCount: Math.max(0, item.likeCount + (nextLiked ? 1 : -1)) }
            : item,
        ),
      );

      const path = `/api/posts/${post.id}/like`;
      const request = nextLiked ? api.post(path) : api.delete(path);
      likeQueue.current = likeQueue.current
        .then(() => request)
        .catch((err) => {
          setPosts((current) => current.map((item) => (item.id === post.id ? post : item)));
          toast.error(err instanceof ApiError ? err.message : "Could not update like");
        });
    },
    [me, router, toast],
  );

  return (
    <div ref={scrollRef} className="h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain">
      {loading && posts.length === 0 ? (
        <div className="grid h-full place-items-center">
          <InlineSpinner />
        </div>
      ) : error && posts.length === 0 ? (
        <div className="grid h-full place-items-center px-6 text-center">
          <div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-3 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </div>
        </div>
      ) : posts.length === 0 ? (
        <div className="grid h-full place-items-center px-6 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No reels yet. Post a video and it shows up here.
          </p>
        </div>
      ) : (
        posts.map((post) => (
          <ReelCard
            key={post.id}
            post={post}
            rail={scrollRef}
            onToggleLike={() => toggleLike(post)}
            onShare={() => setShareFor(post)}
            onOpenComments={() => router.push(`/app/posts/${post.id}`)}
          />
        ))
      )}

      {!loading && posts.length > 0 && (
        <div ref={sentinelRef} className="flex h-16 items-center justify-center">
          {loadingMore ? <InlineSpinner /> : !hasMore ? <span className="text-xs text-zinc-400">You are all caught up</span> : null}
        </div>
      )}

      {shareFor && (
        <ShareSheet
          post={shareFor}
          onClose={() => setShareFor(null)}
          onSent={() =>
            setPosts((current) =>
              current.map((item) => (item.id === shareFor.id ? { ...item, shareCount: item.shareCount + 1 } : item)),
            )
          }
        />
      )}
    </div>
  );
}

function ReelCard({
  post,
  rail,
  onToggleLike,
  onShare,
  onOpenComments,
}: {
  post: Post;
  rail: React.RefObject<HTMLDivElement | null>;
  onToggleLike: () => void;
  onShare: () => void;
  onOpenComments: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);

  const media = post.media.find((item) => item.type === "video") ?? post.media[0];
  const videoUrl = media?.type === "video" ? media.url : null;
  const posterUrl = media?.posterUrl;

  /**
   * Only the reel in view plays.
   *
   * The page is a snap rail, so "in view" is a scroll position, not a click. A
   * reel that is mostly on screen starts (muted, which is the only kind of
   * autoplay browsers allow); one that scrolls away pauses, so audio from several
   * clips never overlaps and the decoder is not asked to hold N videos at once.
   */
  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;
    if (active && !paused) {
      // Autoplay is allowed only while muted, and can still be refused (low power
      // mode), so the poster simply stays put rather than erroring.
      node.play().catch(() => {});
    } else {
      node.pause();
    }
  }, [active, paused]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setActive(entry.intersectionRatio >= ACTIVE_THRESHOLD);
      },
      // The rail is the scroll container, not the window, so the observer has to
      // be rooted to it or every reel reports as visible at once.
      { root: rail.current, threshold: [0, 0.25, 0.6, 0.9] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [videoUrl, rail]);

  const togglePlay = () => {
    setPaused((value) => !value);
  };

  return (
    <article className="relative flex h-full snap-start snap-always flex-col bg-black">
      <div className="relative flex-1">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            poster={posterUrl}
            // Muted is what makes autoplay legal; the rider unmutes deliberately.
            muted={muted}
            loop
            playsInline
            // Nothing is fetched until the reel is near the viewport, so opening
            // the page does not start ten downloads at once.
            preload={active ? "auto" : "none"}
            onClick={togglePlay}
            className="absolute inset-0 h-full w-full cursor-pointer object-contain"
          />
        ) : (
          <div className="grid h-full place-items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media?.url} alt="Post photo" className="h-full w-full object-contain" />
          </div>
        )}

        {/* Tap target for play/pause, kept out of the way of the caption and actions. */}
        {videoUrl && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={paused ? "Play reel" : "Pause reel"}
            className="absolute inset-x-0 top-0 h-2/3 cursor-pointer"
          />
        )}

        {paused && videoUrl && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-5xl text-white/85">▶</span>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 pb-20">
        <div className="min-w-0 flex-1">
          {post.user && (
            <Link href={`/app/profile/${post.user.username}`} className="pointer-events-auto flex items-center gap-2 text-white">
              <Avatar name={post.user.displayName} username={post.user.username} image={post.user.profileImage} size={32} />
              <span className="truncate font-semibold">{post.user.displayName}</span>
              <VerifiedBadge user={post.user} size={14} />
            </Link>
          )}
          {post.content && <p className="pointer-events-auto mt-2 text-sm leading-relaxed text-white/95">{post.content}</p>}
          <p className="mt-1 text-xs text-white/60">{timeAgo(post.createdAt)}</p>
        </div>

        <div className="pointer-events-auto flex shrink-0 flex-col items-center gap-4">
          <ReelAction
            onClick={onToggleLike}
            label={post.viewerLiked ? "Unlike this reel" : "Like this reel"}
            count={post.likeCount}
          >
            <HeartIcon size={28} className={post.viewerLiked ? "fill-current text-red-500" : ""} />
          </ReelAction>
          <ReelAction onClick={onOpenComments} label="Open comments" count={post.commentCount}>
            <CommentIcon size={28} />
          </ReelAction>
          <ReelAction onClick={onShare} label="Share this reel" count={post.shareCount}>
            <ShareIcon size={28} />
          </ReelAction>
          {videoUrl && (
            <button
              type="button"
              onClick={() => setMuted((value) => !value)}
              aria-label={muted ? "Unmute" : "Mute"}
              className="grid h-11 w-11 place-items-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30"
            >
              {muted ? <VolumeXIcon size={20} /> : <Volume2Icon size={20} />}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function ReelAction({
  onClick,
  label,
  count,
  children,
}: {
  onClick: () => void;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex flex-col items-center gap-1 text-white transition-transform active:scale-90"
    >
      {children}
      {count > 0 && <span className="text-xs font-semibold">{count > 999 ? `${(count / 1000).toFixed(1)}k` : count}</span>}
    </button>
  );
}
