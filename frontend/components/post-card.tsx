"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/avatar";
import { VerifiedBadge } from "@/components/verified-badge";
import { FollowButton } from "@/components/follow-button";
import { MediaGrid } from "@/components/media-grid";
import { PostEditDialog } from "@/components/post-edit-dialog";
import { CommentIcon, DotsHorizontalIcon, EditIcon, HeartIcon, LinkIcon, RepostIcon, ShareIcon, TrashIcon, XIcon } from "@/components/icons";
import { SpinnerIcon } from "@/components/spinner";
import { timeAgo } from "@/lib/format";
import type { Me, Post, PostCommentItem } from "@/lib/types";

type PostCardProps = {
  post: Post;
  onChanged: () => void;
  /**
   * The signed-in viewer, or null for a guest. Passed in rather than read from
   * context so a card in the guest feed and a card in a rider's feed behave
   * identically without a second source of truth for "am I signed in".
   */
  viewer?: Me | null;
};

export function PostCard({ post, onChanged, viewer }: PostCardProps) {
  const { user: me } = useSession();
  const toast = useToast();
  const router = useRouter();
  const [liking, setLiking] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [repostBusy, setRepostBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);

  const viewerUser = viewer !== undefined ? viewer : me;
  const liked = post.viewerLiked;
  const reposted = post.viewerReposted;
  const isMine = Boolean(post.user && viewerUser && post.user.id === viewerUser.id);

  /**
   * Guests can read a post but not act on it. Rather than letting the tap 401
   * and surface "Authentication required", the write is intercepted and the
   * rider is sent to the page where an account is one step away.
   */
  function requireViewer(next: string): boolean {
    if (viewerUser) return true;
    toast.error("Create a free account to " + next);
    router.push(`/register?next=${encodeURIComponent(`/app/posts/${post.id}`)}`);
    return false;
  }

  async function toggleLike() {
    if (liking) return;
    if (!requireViewer("like posts")) return;
    setLiking(true);
    try {
      if (liked) {
        await api.delete(`/api/posts/${post.id}/like`);
      } else {
        await api.post(`/api/posts/${post.id}/like`);
      }
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not update like");
    } finally {
      setLiking(false);
    }
  }

  async function share() {
    if (shareBusy) return;
    if (!requireViewer("share posts")) return;
    setShareBusy(true);
    try {
      await api.post(`/api/posts/${post.id}/share`);
      toast.success("Shared to your followers");
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not share post");
    } finally {
      setShareBusy(false);
    }
  }

  /**
   * Repost to the viewer's own profile. The toggle removes it again rather than
   * double-tapping, because a repost is a claim about what your profile says —
   * you have to be able to take it back.
   */
  async function toggleRepost() {
    if (repostBusy) return;
    if (!requireViewer("repost")) return;
    setRepostBusy(true);
    try {
      if (reposted) {
        await api.delete(`/api/posts/${post.id}/repost`);
        toast.success("Repost removed");
      } else {
        await api.post(`/api/posts/${post.id}/repost`);
        toast.success("Reposted to your profile");
      }
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not repost");
    } finally {
      setRepostBusy(false);
    }
  }

  /**
   * Copies a link to the post, and for a video post the direct media file too.
   *
   * The post link is what someone actually wants to open. The raw file link is
   * included because that is what "share this clip" means in practice — a rider
   * forwarding a video to a group chat wants the file, not the page wrapped
   * around it. Both are attempted independently so one failure does not lose
   * the other.
   */
  async function copyLink() {
    if (linkBusy) return;
    setLinkBusy(true);
    try {
      const postUrl = `${window.location.origin}/app/posts/${post.id}`;
      await navigator.clipboard.writeText(postUrl);
      const video = post.media.find((item) => item.type === "video");
      if (video) {
        try {
          await navigator.clipboard.writeText(video.url);
          toast.success("Post and video links copied");
        } catch {
          toast.success("Post link copied");
        }
      } else {
        toast.success("Link copied");
      }
    } catch {
      toast.error("Could not copy the link");
    } finally {
      setLinkBusy(false);
    }
  }

  async function removePost() {
    if (deleting) return;
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setDeleting(true);
    setMenuOpen(false);
    try {
      await api.delete(`/api/posts/${post.id}`);
      toast.success("Post deleted");
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not delete post");
    } finally {
      setDeleting(false);
    }
  }

  function handleEdited() {
    setEditing(false);
    onChanged();
  }

  const author = post.user;

  return (
    <article className="border-b border-zinc-100 px-4 py-4 dark:border-zinc-800">
      {author && (
        <div className="mb-2.5 flex items-start gap-2.5">
          <Link href={`/app/profile/${author.username}`} className="flex min-w-0 flex-1 items-center gap-2.5">
            <Avatar name={author.displayName} username={author.username} image={author.profileImage} size={38} />
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <span className="truncate">{author.displayName}</span>
                <VerifiedBadge user={author} size={13} />
              </p>
              <p className="text-xs text-zinc-400">
                @{author.username} · {timeAgo(post.createdAt)}
                {post.editedAt && <span> · edited</span>}
              </p>
            </div>
          </Link>
          {!isMine && viewerUser && author && !author.viewerIsFollowing && (
            <FollowButton user={author} onChanged={() => void onChanged()} />
          )}
          {isMine && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMenuOpen((value) => !value)}
                aria-label="Post options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <DotsHorizontalIcon size={17} />
              </button>
              {menuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setMenuOpen(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg shadow-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-800">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setEditing(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    >
                      <EditIcon size={15} /> Edit post
                    </button>
                    <button
                      type="button"
                      onClick={() => void removePost()}
                      disabled={deleting}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                      {deleting ? <SpinnerIcon size={15} className="animate-spin" /> : <TrashIcon size={15} />} Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {post.content && (
        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200">
          {post.content}
        </p>
      )}

      {post.repostedBy && (
        // Attribution is the whole point of a repost: the original author keeps
        // the credit, the reposter is named, and the post links to the author
        // rather than to the person who passed it on.
        <p className="mb-2 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <RepostIcon size={13} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          Reposted by{" "}
          <Link
            href={`/app/profile/${post.repostedBy.username}`}
            className="font-semibold text-zinc-700 hover:underline dark:text-zinc-200"
          >
            @{post.repostedBy.username}
          </Link>
        </p>
      )}

      {post.media.length > 0 && <div className="mt-3"><MediaGrid media={post.media} /></div>}

      <div className="mt-3 flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400">
        <button
          type="button"
          onClick={() => void toggleLike()}
          disabled={liking}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800 ${
            liked ? "text-red-500 dark:text-red-400" : ""
          }`}
        >
          {liking ? <SpinnerIcon size={14} className="animate-spin" /> : <HeartIcon size={15} className={liked ? "fill-current" : ""} />}
          {post.likeCount}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!requireViewer("join the conversation")) return;
            setShowComments((value) => !value);
          }}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <CommentIcon size={14} />
          {post.commentCount}
        </button>
        <button
          type="button"
          onClick={() => void toggleRepost()}
          disabled={repostBusy}
          aria-pressed={reposted}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800 ${
            reposted ? "text-emerald-600 dark:text-emerald-400" : ""
          }`}
        >
          {repostBusy ? <SpinnerIcon size={14} className="animate-spin" /> : <RepostIcon size={14} className={reposted ? "fill-current" : ""} />}
          {post.repostCount}
        </button>
        <button
          type="button"
          onClick={() => void share()}
          disabled={shareBusy}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
        >
          {shareBusy ? <SpinnerIcon size={14} className="animate-spin" /> : <ShareIcon size={14} />}
          {post.shareCount}
        </button>
        <button
          type="button"
          onClick={() => void copyLink()}
          disabled={linkBusy}
          aria-label="Copy link to this post"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
        >
          {linkBusy ? <SpinnerIcon size={14} className="animate-spin" /> : <LinkIcon size={14} />}
        </button>
      </div>

      {showComments && <CommentThread postId={post.id} onChanged={onChanged} viewer={viewerUser} />}

      {editing && <PostEditDialog post={post} onClose={() => setEditing(false)} onSaved={handleEdited} />}
    </article>
  );
}

function CommentThread({ postId, onChanged, viewer }: { postId: string; onChanged: () => void; viewer?: Me | null }) {
  const [comments, setComments] = useState<PostCommentItem[]>([]);
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<PostCommentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await api.get<{ items: PostCommentItem[] }>(`/api/posts/${postId}/comments?limit=50`);
        if (!cancelled) {
          setComments(page.items);
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : "Could not load comments");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, toast]);

  function beginReply(comment: PostCommentItem) {
    setReplyingTo(comment);
  }

  function cancelReply() {
    setReplyingTo(null);
  }

  /** A guest reading comments sees them all, but replying sends them to signup. */
  function promptSignup() {
    toast.error("Create a free account to reply to comments");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || submitting) return;
    if (!viewer) {
      promptSignup();
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ comment: PostCommentItem }>(`/api/posts/${postId}/comments`, {
        content,
        parentId: replyingTo?.id,
      });
      setComments((current) => [...current, res.comment]);
      setDraft("");
      setReplyingTo(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not post comment");
    } finally {
      setSubmitting(false);
    }
  }

  // Single-level nesting, Instagram style: replies are grouped under their
  // parent comment even though the API returns a flat, chronological list.
  const topLevel = comments.filter((comment) => !comment.parentId);
  const byParent = new Map<string, PostCommentItem[]>();
  for (const comment of comments) {
    if (comment.parentId) {
      const list = byParent.get(comment.parentId) ?? [];
      list.push(comment);
      byParent.set(comment.parentId, list);
    }
  }

  return (
    <div className="mt-3 space-y-2.5 border-t border-zinc-100 pt-3 dark:border-zinc-800">
      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-zinc-400">
          <SpinnerIcon size={13} className="animate-spin" /> Loading comments…
        </div>
      ) : topLevel.length === 0 ? (
        <p className="py-1 text-xs text-zinc-400">No comments yet — say something nice.</p>
      ) : (
        topLevel.map((comment) => (
          <CommentRow
            key={comment.id}
            comment={comment}
            replies={byParent.get(comment.id) ?? []}
            onReply={viewer ? beginReply : promptSignup}
          />
        ))
      )}

      {replyingTo && (
        <p className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Replying to <span className="text-emerald-700 dark:text-emerald-400">@{replyingTo.user?.username ?? "someone"}</span>
          <button
            type="button"
            onClick={cancelReply}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
          >
            <XIcon size={12} /> Cancel
          </button>
        </p>
      )}

      {viewer ? (
        <form onSubmit={submit} className="flex items-center gap-2 pt-1">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1000}
            placeholder={replyingTo ? `Reply to @${replyingTo.user?.username ?? "someone"}…` : "Add a comment…"}
            aria-label={replyingTo ? "Reply to comment" : "Add a comment"}
            className="h-9 w-full rounded-full border border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="submit"
            disabled={!draft.trim() || submitting}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
            aria-label="Post comment"
          >
            {submitting ? <SpinnerIcon size={15} className="animate-spin" /> : <CommentIcon size={15} />}
          </button>
        </form>
      ) : (
        <p className="pt-1 text-center text-xs text-zinc-400">
          <Link href={`/register?next=${encodeURIComponent(`/app/posts/${postId}`)}`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
            Join RideWing
          </Link>{" "}
          to comment
        </p>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  replies,
  onReply,
  isReply = false,
}: {
  comment: PostCommentItem;
  replies: PostCommentItem[];
  onReply: (comment: PostCommentItem) => void;
  isReply?: boolean;
}) {
  const { user: me } = useSession();
  const toast = useToast();
  const [liking, setLiking] = useState(false);
  const liked = comment.viewerLiked;
  const likeCount = comment.likeCount;

  async function toggleCommentLike() {
    if (liking || !me) return;
    if (!me) {
      toast.error("Create a free account to like comments");
      return;
    }
    setLiking(true);
    try {
      if (liked) {
        await api.delete(`/api/posts/${comment.postId}/comments/${comment.id}/like`);
      } else {
        await api.post(`/api/posts/${comment.postId}/comments/${comment.id}/like`);
      }
      // Update local state optimistically
      // Note: parent CommentThread will need to refresh or we update via onChanged
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not update like");
    } finally {
      setLiking(false);
    }
  }

  return (
    <div className="space-y-2.5">
      <div className={`flex items-start gap-2.5 ${isReply ? "pl-2 sm:pl-6" : ""}`}>
        {comment.user && (
          <Link href={`/app/profile/${comment.user.username}`}>
            <Avatar name={comment.user.displayName} username={comment.user.username} image={comment.user.profileImage} size={isReply ? 24 : 28} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <div className="rounded-2xl rounded-tl-md bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
            <p className="flex items-center gap-1 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              <span className="truncate">{comment.user?.displayName ?? "Someone"}</span>
              <VerifiedBadge user={comment.user} size={11} />
              <span className="font-normal text-zinc-400">· {timeAgo(comment.createdAt)}</span>
            </p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-zinc-700 dark:text-zinc-300">{comment.content}</p>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <button
              type="button"
              onClick={() => onReply(comment)}
              className="text-[11px] font-semibold text-zinc-400 transition-colors hover:text-emerald-700 dark:hover:text-emerald-400"
            >
              Reply
            </button>
            <button
              type="button"
              onClick={() => void toggleCommentLike()}
              disabled={liking || !me}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800 ${
                liked ? "text-red-500 dark:text-red-400" : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {liking ? <SpinnerIcon size={10} className="animate-spin" /> : <HeartIcon size={11} className={liked ? "fill-current" : ""} />}
              {likeCount > 0 && likeCount}
            </button>
          </div>
        </div>
      </div>

      {replies.length > 0 && (
        <div className="space-y-2.5 border-l-2 border-zinc-100 pl-4 sm:ml-10 dark:border-zinc-800">
          {replies.map((reply) => (
            <CommentRow key={reply.id} comment={reply} replies={[]} onReply={onReply} isReply />
          ))}
        </div>
      )}
    </div>
  );
}