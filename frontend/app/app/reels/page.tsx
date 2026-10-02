"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { Avatar } from "@/components/avatar";
import { VerifiedBadge } from "@/components/verified-badge";
import { MediaGrid, useVideoLightbox } from "@/components/media-grid";
import { HeartIcon, CommentIcon, ShareIcon, Volume2Icon, VolumeXIcon } from "@/components/icons";
import { timeAgo } from "@/lib/format";
import { InlineSpinner } from "@/components/spinner";
import type { Post, Me } from "@/lib/types";

export default function ReelsPage() {
  const { user: me } = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const observerTarget = useRef<HTMLDivElement>(null);
  const { video, open: openVideo, VideoLightbox } = useVideoLightbox();

  useEffect(() => {
    loadReels();
  }, []);

  async function loadReels() {
    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "10");
      const res = await api.get<{ items: Post[]; pageInfo: { hasMore: boolean; nextCursor: string | null } }>(
        `/api/posts?${params.toString()}`,
      );
      const videoPosts = res.items.filter((p) => p.media.some((m) => m.type === "video"));
      setPosts((prev) => [...prev, ...videoPosts]);
      setCursor(res.pageInfo.nextCursor);
      setHasMore(res.pageInfo.hasMore);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadReels();
        }
      },
      { threshold: 0.1 },
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  return (
    <div className="relative h-dvh flex flex-col overflow-hidden">
      <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 px-4 py-3 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/70">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Reels</h1>
      </header>

      <main className="flex-1 overflow-y-auto scroll-snap-y snap-mandatory">
        {loading && posts.length === 0 ? (
          <div className="flex h-full items-center justify-center"><InlineSpinner /></div>
        ) : (
          <div className="flex flex-col">
            {posts.map((post, index) => (
              <ReelCard
                key={post.id}
                post={post}
                index={index}
                viewer={me}
                onVideoClick={openVideo}
              />
            ))}
            {hasMore && <div ref={observerTarget} className="h-20" />}
          </div>
        )}
      </main>

      {VideoLightbox}
    </div>
  );
}

function ReelCard({
  post,
  index,
  viewer,
  onVideoClick,
}: {
  post: Post;
  index: number;
  viewer: Me | null;
  onVideoClick: (url: string, posterUrl?: string) => void;
}) {
  const videoMedia = post.media.find((m) => m.type === "video");
  const posterUrl = videoMedia?.posterUrl;
  const videoUrl = videoMedia?.url;

  return (
    <article className="relative flex-shrink-0 h-full snap-start snap-center snap-always flex flex-col" style={{ minHeight: "100vh" }}>
      {videoUrl && (
        <div className="relative flex-1" onClick={() => onVideoClick(videoUrl, posterUrl)}>
          <video
            src={videoUrl}
            poster={posterUrl}
            playsInline
            muted
            loop
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
            onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-4 pb-16 flex items-end justify-between">
        <div className="flex-1 mr-4">
          <Link
            href={`/app/profile/${post.user?.username}`}
            className="flex items-center gap-2 text-white"
          >
            <Avatar name={post.user?.displayName} username={post.user?.username} image={post.user?.profileImage} size={32} />
            <span className="font-semibold truncate">{post.user?.displayName}</span>
            <VerifiedBadge user={post.user} size={14} />
          </Link>
          {post.content && <p className="mt-2 text-white text-sm leading-relaxed">{post.content}</p>}
        </div>

        <div className="flex flex-col items-end gap-4">
          <ReelAction icon={<HeartIcon size={28} />} count={post.likeCount} />
          <ReelAction icon={<CommentIcon size={28} />} count={post.commentCount} />
          <ReelAction icon={<ShareIcon size={28} />} count={post.shareCount} />
          <ReelAction icon={post.viewerLiked ? <HeartIcon size={28} className="fill-current text-red-500" /> : <HeartIcon size={28} />} count={post.likeCount} />
        </div>
      </div>

      <div className="absolute bottom-20 right-4 flex flex-col items-end gap-2">
        <button
          className="grid h-12 w-12 place-items-center rounded-full bg-white/20 text-white backdrop-blur-sm hover:bg-white/30"
          aria-label="Share"
        >
          <ShareIcon size={24} />
        </button>
      </div>
    </article>
  );
}

function ReelAction({ icon, count }: { icon: React.ReactNode; count: number }) {
  return (
    <button className="flex flex-col items-center gap-1 text-white">
      {icon}
      {count > 0 && <span className="text-xs font-semibold">{count > 999 ? `${(count / 1000).toFixed(1)}k` : count}</span>}
    </button>
  );
}