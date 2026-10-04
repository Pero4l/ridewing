"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/avatar";
import { Input } from "@/components/ui";
import { InlineSpinner } from "@/components/spinner";
import { LinkIcon, SearchIcon, ShareIcon, XIcon } from "@/components/icons";
import { VerifiedBadge } from "@/components/verified-badge";
import type { Friend, Post } from "@/lib/types";

const SEARCH_DEBOUNCE_MS = 250;

type ShareSheetProps = {
  post: Post;
  onClose: () => void;
  /** Called after a successful send so the host card can refresh its counters. */
  onSent?: () => void;
};

/**
 * "Share" as riders actually mean it: hand this post to somebody in their DMs.
 *
 * Opening the sheet lists everyone the rider has a connection with in either
 * direction, and typing narrows that list — it is deliberately not a search of
 * all of RideWing, because forwarding a post is an act between people who know
 * each other. The post travels inside the message (see the backend's
 * `sharedPostId`), so the recipient gets the caption, media, likes and comments
 * inline rather than a bare link.
 */
export function ShareSheet({ post, onClose, onSent }: ShareSheetProps) {
  const toast = useToast();
  const router = useRouter();

  const [term, setTerm] = useState("");
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  // The response for a query that has been superseded is dropped rather than
  // rendered, so a slow earlier search cannot overwrite a later one.
  const requestRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const load = useCallback(async (query: string) => {
    const ticket = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const res = await api.get<{ users: Friend[] }>(`/api/users/friends?${params.toString()}`);
      if (ticket !== requestRef.current) return;
      setFriends(res.users);
    } catch (err) {
      if (ticket !== requestRef.current) return;
      setFriends([]);
      setError(err instanceof ApiError ? err.message : "Could not load your friends");
    } finally {
      if (ticket === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyLink() {
    const url = `${window.location.origin}/app/posts/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
      onSent?.();
      onClose();
    } catch {
      toast.error("Could not copy the link");
    }
  }

  async function send(friend: Friend) {
    if (sendingTo) return;
    setSendingTo(friend.id);
    try {
      const res = await api.post<{ conversation: { id: string } }>(`/api/posts/${post.id}/share-to`, {
        username: friend.username,
      });
      setSent((current) => [...current, friend.id]);
      onSent?.();
      toast.success(`Sent to @${friend.username}`);
      // Straight into the thread: the point of sending is usually to carry on
      // the conversation there.
      router.push(`/app/messages/${res.conversation.id}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not share this post");
    } finally {
      setSendingTo(null);
    }
  }

  const emptyMessage = term.trim()
    ? `No one you follow matches “${term.trim()}”.`
    : "Follow some riders and they will show up here to share with.";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Share this post">
      <button type="button" aria-label="Close share sheet" onClick={onClose} className="absolute inset-0 cursor-default bg-black/50" />

      <div className="relative flex max-h-[82dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white pb-4 shadow-2xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <ShareIcon size={18} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Share to a friend</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-zinc-400">
              <SearchIcon size={16} />
            </span>
            <Input
              ref={inputRef}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search your friends"
              aria-label="Search your friends"
              className="pl-9"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {loading && friends === null ? (
            <div className="grid place-items-center py-10">
              <InlineSpinner />
            </div>
          ) : error ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
          ) : friends && friends.length > 0 ? (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {friends.map((friend) => (
                <li key={friend.id}>
                  <button
                    type="button"
                    onClick={() => void send(friend)}
                    disabled={sendingTo !== null}
                    className="flex w-full items-center gap-3 px-2 py-2.5 text-left transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:hover:bg-zinc-800/60"
                  >
                    <Avatar name={friend.displayName} username={friend.username} image={friend.profileImage} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {friend.displayName}
                        <VerifiedBadge user={friend} size={12} />
                      </span>
                      <span className="flex items-center gap-1.5 truncate text-xs text-zinc-400">
                        @{friend.username}
                        {friend.isMutual ? (
                          <span className="text-emerald-600 dark:text-emerald-400">· Friends</span>
                        ) : friend.viewerIsFollowing ? (
                          <span>· Following</span>
                        ) : (
                          <span>· Follows you</span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      {sent.includes(friend.id)
                        ? "Sent"
                        : sendingTo === friend.id
                          ? "Sending…"
                          : "Send"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">{emptyMessage}</p>
          )}
        </div>

        <div className="border-t border-zinc-100 px-4 pt-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <LinkIcon size={16} /> Copy link instead
          </button>
        </div>
      </div>
    </div>
  );
}
