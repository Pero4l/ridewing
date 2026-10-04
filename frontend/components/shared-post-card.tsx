"use client";

import Link from "next/link";
import { MediaGrid } from "@/components/media-grid";
import { CommentIcon, HeartIcon } from "@/components/icons";
import { VerifiedBadge } from "@/components/verified-badge";
import { timeAgo } from "@/lib/format";
import type { SharedPost } from "@/lib/types";

/**
 * A post forwarded into a conversation.
 *
 * Sending a post to somebody is only worth doing if what lands is the post, not
 * a description of it — so the media, the caption, the author and the counts are
 * all rendered here, and the whole card opens the post itself where likes,
 * comments and the full-size video live. That also means the answer to "shared
 * post is not loading" is the same route the feed uses, rather than a DM-only
 * viewer that could drift from it.
 */
export function SharedPostCard({ post }: { post: SharedPost }) {
  const author = post.user;
  const firstVideo = post.media.find((item) => item.type === "video");

  return (
    <Link
      href={`/app/posts/${post.id}`}
      className="block w-[260px] max-w-[70vw] overflow-hidden rounded-xl border border-zinc-200 bg-white text-left transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800/70"
    >
      {post.media.length > 0 && (
        <div className="relative">
          <MediaGrid media={post.media} preview={post.media.length <= 4} />
          {firstVideo && (
            <span className="pointer-events-none absolute right-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
              Video
            </span>
          )}
        </div>
      )}

      <div className="space-y-1.5 px-3 py-2.5">
        {author && (
          <p className="flex items-center gap-1 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            <span className="truncate">{author.displayName}</span>
            <VerifiedBadge user={author} size={11} />
            <span className="font-normal text-zinc-400">· {timeAgo(post.createdAt)}</span>
          </p>
        )}
        {post.content && (
          <p className="line-clamp-3 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">{post.content}</p>
        )}
        <p className="flex items-center gap-3 text-[11px] font-medium text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <HeartIcon size={11} /> {post.likeCount}
          </span>
          <span className="inline-flex items-center gap-1">
            <CommentIcon size={11} /> {post.commentCount}
          </span>
          <span className="ml-auto text-emerald-700 dark:text-emerald-400">Open post</span>
        </p>
      </div>
    </Link>
  );
}
