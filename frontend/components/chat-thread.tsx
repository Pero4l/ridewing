"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { emitWithAck, onSocketEvent } from "@/lib/socket";
import { useSession } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/avatar";
import { Badge, Button } from "@/components/ui";
import { InlineSpinner } from "@/components/spinner";
import { DotsHorizontalIcon, SendIcon } from "@/components/icons";
import { VerifiedBadge } from "@/components/verified-badge";
import { clockTime } from "@/lib/format";
import type { Message, Page, PublicUser } from "@/lib/types";

type TypingEvent = { conversationId: string; userId: string; username: string; isTyping: boolean };

const NEAR_BOTTOM_PX = 160;

export function ChatThread({
  conversationId,
  title,
  type,
  community,
  participants,
}: {
  conversationId: string;
  title: string;
  type: "direct" | "community";
  community: { id: string; name: string; slug: string; image: string | null } | null;
  participants: PublicUser[];
}) {
  const { user } = useSession();
  const toast = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const idsRef = useRef(new Set<string>());
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const joinedRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myId = user?.id;

  const upsert = useCallback((message: Message) => {
    setMessages((current) => {
      if (idsRef.current.has(message.id)) return current;
      idsRef.current.add(message.id);
      return [...current, message];
    });
  }, []);

  // Initial history + socket join + event wiring.
  useEffect(() => {
    let cancelled = false;
    idsRef.current = new Set();
    joinedRef.current = false;

    (async () => {
      try {
        const page = await api.get<Page<Message>>(`/api/conversations/${conversationId}/messages`);
        if (cancelled) return;
        page.items.forEach((message) => idsRef.current.add(message.id));
        setMessages(page.items);
        setHasMore(page.pageInfo.hasMore);
        setNextCursor(page.pageInfo.nextCursor);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof ApiError ? error.message : "Could not load messages");
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();

    // Join the conversation room so we receive live messages.
    emitWithAck<{ conversationId: string }>("conversation:join", { conversationId })
      .then(() => {
        joinedRef.current = true;
        emitWithAck<{ conversationId: string }>("conversation:read", { conversationId }).catch(() => {});
      })
      .catch(() => {
        // Polling via HTTP still works without a socket.
      });

    const offNew = onSocketEvent<Message>("message:new", (message) => {
      if (message.conversationId !== conversationId) return;
      upsert(message);
      settlePending(message);
      if (nearBottomRef.current) scrollToBottom();
    });
    const offDeleted = onSocketEvent<{ id: string }>("message:deleted", ({ id }) => {
      idsRef.current.delete(id);
      setMessages((current) => current.filter((message) => message.id !== id));
    });
    const offTyping = onSocketEvent<TypingEvent>("message:typing", ({ userId, isTyping, username, conversationId: cid }) => {
      if (cid !== conversationId || userId === myId) return;
      setTyping((current) => {
        const next = { ...current };
        if (!isTyping) delete next[userId];
        else next[userId] = username;
        return next;
      });
    });

    return () => {
      cancelled = true;
      offNew();
      offDeleted();
      offTyping();
      emitWithAck<{ conversationId: string }>("conversation:leave", { conversationId }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // settlePending: a broadcast with a real id confirms a pending send.
  function settlePending(message: Message) {
    setPending((current) => current.filter((pendingMessage) => pendingMessage.clientNonce !== message.clientNonce));
  }

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  // Track "am I at the bottom" live so we never yank the rider up the thread
  // when a new message lands while they are reading older ones.
  const trackScroll = useCallback(() => {
    nearBottomRef.current = isNearBottom();
  }, [isNearBottom]);

  const scrollToBottom = useCallback((smooth = true) => {
    if (!smooth) {
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
      return;
    }
    requestAnimationFrame(() => {
      if (isNearBottom()) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, [isNearBottom]);

  const loadOlder = useCallback(async () => {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await api.get<Page<Message>>(`/api/conversations/${conversationId}/messages?cursor=${encodeURIComponent(nextCursor)}`);
      const scrollable = scrollRef.current;
      const heightBefore = scrollable?.scrollHeight ?? 0;
      setMessages((current) => {
        const existing = new Set(current.map((message) => message.id));
        const older = page.items.filter((message) => !existing.has(message.id));
        older.forEach((message) => idsRef.current.add(message.id));
        return [...older, ...current];
      });
      setHasMore(page.pageInfo.hasMore);
      setNextCursor(page.pageInfo.nextCursor);
      requestAnimationFrame(() => {
        if (scrollable) scrollable.scrollTop = scrollable.scrollHeight - heightBefore;
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not load older messages");
    } finally {
      setLoadingOlder(false);
    }
  }, [nextCursor, loadingOlder, conversationId, toast]);

  const markRead = useCallback(() => {
    emitWithAck<{ conversationId: string }>("conversation:read", { conversationId }).catch(() => {});
    api.post(`/api/conversations/${conversationId}/read`).catch(() => {});
  }, [conversationId]);

  // Mark incoming messages read as soon as they are anywhere near the viewport.
  useEffect(() => {
    trackScroll();
    const el = scrollRef.current;
    el?.addEventListener("scroll", trackScroll, { passive: true });
    return () => el?.removeEventListener("scroll", trackScroll);
  }, [historyLoading, trackScroll]);

  useEffect(() => {
    markRead();
  }, [conversationId, messages.length, markRead]);

  function reportTyping(isTyping: boolean) {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (!isTyping) {
      emitWithAck<{ conversationId: string; isTyping: boolean }>("message:typing", {
        conversationId,
        isTyping: false,
      }).catch(() => {});
      return;
    }
    emitWithAck<{ conversationId: string; isTyping: boolean }>("message:typing", {
      conversationId,
      isTyping: true,
    }).catch(() => {});
    typingTimeoutRef.current = setTimeout(() => reportTyping(false), 2500);
  }

  async function send() {
    const content = draft.trim();
    if (!content || sendBusy) return;
    setSendBusy(true);
    const clientNonce = crypto.randomUUID();
    setPending((current) => [...current, { id: `pending-${clientNonce}`, conversationId, senderId: myId ?? "", content, clientNonce, createdAt: new Date().toISOString(), pending: true }]);
    setDraft("");
    reportTyping(false);
    scrollToBottom();

    try {
      const ack = await emitWithAck<{ conversationId: string; content: string; clientNonce: string }, { ok: boolean; error?: { message: string }; message?: Message; duplicate?: boolean }>(
        "message:send",
        { conversationId, content, clientNonce },
      );
      if (ack?.ok) {
        if (ack.message) upsert(ack.message);
        settlePending({ ...(ack.message ?? { clientNonce: "" }) } as Message);
      } else {
        throw new ApiError(ack?.error?.message ?? "Send failed", 0);
      }
    } catch {
      // Socket is down or refused — fall back to HTTP, which still broadcasts.
      try {
        const res = await api.post<{ message: Message }>(`/api/conversations/${conversationId}/messages`, {
          content,
          clientNonce,
        });
        upsert(res.message);
        settlePending({ ...res.message, clientNonce } as Message);
      } catch {
        setPending((current) =>
          current.map((message) => (message.clientNonce === clientNonce ? { ...message, failed: true } : message)),
        );
        toast.error("Message could not be sent");
      }
    } finally {
      setSendBusy(false);
    }
  }

  function retry(message: Message) {
    setDraft(message.content);
    setPending((current) => current.filter((m) => m.id !== message.id));
  }

  async function removeMessage(message: Message) {
    setMenuFor(null);
    try {
      await api.delete(`/api/messages/${message.id}`);
      idsRef.current.delete(message.id);
      setMessages((current) => current.filter((m) => m.id !== message.id));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not delete message");
    }
  }

  const typingLabel = useMemo(() => {
    const names = Object.values(typing);
    if (!names.length) return null;
    if (names.length === 1) return `${names[0]} is typing…`;
    return "Several riders are typing…";
  }, [typing]);

  const grouped = useMemo(() => groupBySender(messages), [messages]);

  return (
    <div className="flex h-dvh flex-col">
      <ChatHeader
        title={title}
        type={type}
        community={community}
        participants={participants}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        onRead={markRead}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-3 pt-4">
        {historyLoading ? (
          <div className="grid h-full place-items-center">
            <InlineSpinner />
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="mb-3 flex justify-center">
                <Button size="sm" variant="ghost" onClick={loadOlder} loading={loadingOlder}>
                  Older messages
                </Button>
              </div>
            )}

            {grouped.length === 0 && pending.length === 0 && (
              <p className="py-10 text-center text-sm text-zinc-400 dark:text-zinc-500">
                No messages yet. Say hi.
              </p>
            )}

            {grouped.map((group) => (
              <MessageGroup
                key={group[0].id}
                messages={group}
                myId={myId ?? ""}
                onDelete={removeMessage}
                menuFor={menuFor}
                setMenuFor={setMenuFor}
              />
            ))}

            {pending.map((message) => (
              <PendingBubble key={message.id} message={message} onRetry={retry} />
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {typingLabel && <p className="px-4 pb-1 text-xs text-zinc-400">{typingLabel}</p>}

      <div className="border-t border-zinc-100 p-3 pb-4 dark:border-zinc-800">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              reportTyping(event.target.value.length > 0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Message"
            maxLength={2000}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-2 focus:outline-offset-0 focus:outline-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <Button size="lg" className="h-11! rounded-2xl p-0! w-11!" onClick={send} loading={sendBusy} disabled={!draft.trim()} aria-label="Send">
            <SendIcon size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatHeader({
  title,
  type,
  community,
  participants,
  menuOpen,
  setMenuOpen,
  onRead,
}: {
  title: string;
  type: "direct" | "community";
  community: { id: string; name: string; slug: string; image: string | null } | null;
  participants: PublicUser[];
  menuOpen: boolean;
  setMenuOpen: (value: boolean) => void;
  onRead: () => void;
}) {
  const isCommunity = type === "community";
  const target = isCommunity
    ? community
      ? `/app/communities/${community.slug}`
      : null
    : participants[0]
      ? `/app/profile/${participants[0].username}`
      : null;

  return (
    <header className="flex items-center gap-3 border-b border-zinc-100 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <Link href="/app/messages" aria-label="Back" className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18 9 12l6-6" />
        </svg>
      </Link>

      <div className="flex min-w-0 flex-1 items-center gap-2.5" onClick={() => onRead()}>
        {isCommunity ? (
          <Avatar name={community?.name ?? title} username={community?.slug ?? title} image={community?.image ?? null} size={36} />
        ) : (
          participants[0] && (
            <Avatar
              name={participants[0].displayName}
              username={participants[0].username}
              image={participants[0].profileImage}
              size={36}
            />
          )
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
            <Badge tone={isCommunity ? "blue" : "green"}>{isCommunity ? "Community" : "Direct"}</Badge>
          </div>
          {isCommunity ? (
            <p className="truncate text-xs text-zinc-400">Community chat {community ? `· ${community.slug}` : ""}</p>
          ) : (
            participants[0] && (
              <Link
                href={`/app/profile/${participants[0].username}`}
                onClick={(event) => event.stopPropagation()}
                className="flex items-center gap-1 truncate text-xs text-zinc-400 hover:underline"
              >
                <span className="truncate">@{participants[0].username}</span>
                <VerifiedBadge user={participants[0]} size={12} />
              </Link>
            )
          )}
        </div>
      </div>

      <div className="relative shrink-0">
        <button
          type="button"
          aria-label="Chat options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
          className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <DotsHorizontalIcon size={18} />
        </button>
        {menuOpen && (
          <>
            <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-10 cursor-default" />
            <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg shadow-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-800">
              <p className="px-3.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                {isCommunity ? "Community" : "Rider"}
              </p>
              {target && (
                <Link
                  href={target}
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  {isCommunity ? "Open community" : "View profile"}
                </Link>
              )}
              <p className="px-3.5 py-2 text-xs text-zinc-400 dark:text-zinc-500">
                {participants.length > 1 && !isCommunity ? `${participants.length} riders in this chat` : "Messages are delivered instantly."}
              </p>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

function groupBySender(messages: Message[]): Message[][] {
  const groups: Message[][] = [];
  for (const message of messages) {
    const last = groups[groups.length - 1];
    if (last && last[last.length - 1].senderId === message.senderId) {
      last.push(message);
    } else {
      groups.push([message]);
    }
  }
  return groups;
}

function MessageGroup({
  messages,
  myId,
  onDelete,
  menuFor,
  setMenuFor,
}: {
  messages: Message[];
  myId: string;
  onDelete: (message: Message) => void;
  menuFor: string | null;
  setMenuFor: (value: string | null) => void;
}) {
  const first = messages[0];
  const mine = myId === first.senderId;
  const sender: PublicUser | undefined = first.sender;

  return (
    <div className={`mb-2 flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[82%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {!mine && sender && (
          <div className="mb-0.5 flex items-center gap-1.5 px-1">
            <Avatar name={sender.displayName} username={sender.username} image={sender.profileImage} size={18} />
            <span className="text-[11px] font-medium text-zinc-400">{sender.displayName}</span>
          </div>
        )}
        <div className={`flex items-end gap-1 ${mine ? "flex-row" : "flex-row-reverse"}`}>
          <div
            className={`relative rounded-2xl px-3 py-2 text-sm leading-relaxed ${
              mine
                ? "rounded-br-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded-bl-md bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            }`}
          >
            {mine && (
              <button
                aria-label="Message options"
                onClick={() => setMenuFor(menuFor === first.id ? null : first.id)}
                className="absolute -left-5 top-1 grid h-5 w-5 place-items-center rounded-full text-zinc-300 hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-600 dark:hover:bg-zinc-800"
              >
                ⋯
              </button>
            )}
            <p className="whitespace-pre-wrap break-words">{first.content}</p>
            <p className={`mt-0.5 text-right text-[10px] ${mine ? "text-zinc-300 dark:text-zinc-500" : "text-zinc-300 dark:text-zinc-500"}`}>
              {clockTime(first.createdAt)}
            </p>
            {mine && menuFor === first.id && (
              <div className="absolute right-0 top-9 z-20 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <button
                  onClick={() => onDelete(first)}
                  className="rounded-md px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingBubble({ message, onRetry }: { message: Message; onRetry: (message: Message) => void }) {
  return (
    <div className={`mb-2 flex justify-end`}>
      <div
        className={`flex items-center gap-2 rounded-2xl rounded-br-md border px-3 py-2 text-sm ${
          message.failed
            ? "border-red-200 bg-red-50 text-red-500 dark:border-red-900 dark:bg-red-950/40"
            : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        }`}
      >
        <span className="whitespace-pre-wrap break-words">{message.content}</span>
        <span className="flex items-center gap-1 text-[10px]">
          {message.failed ? "Not sent" : "…"}
          {message.failed && (
            <button onClick={() => onRetry(message)} className="font-semibold underline">
              Retry
            </button>
          )}
        </span>
      </div>
    </div>
  );
}