"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Button, EmptyState, Input, PageHeader } from "@/components/ui";
import { InlineSpinner } from "@/components/spinner";
import { ConversationRow } from "@/components/rows";
import { MessagesIcon, PlusIcon } from "@/components/icons";
import type { ConversationListItem } from "@/lib/types";
import { onSocketEvent } from "@/lib/socket";

export default function MessagesPage() {
  const router = useRouter();
  const toast = useToast();

  const [conversations, setConversations] = useState<ConversationListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      const res = await api.get<{ conversations: ConversationListItem[] }>("/api/conversations");
      setConversations(res.conversations);
      setError(null);
    } catch (err) {
      if (!silent) setError(err instanceof ApiError ? err.message : "Could not load conversations");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ conversations: ConversationListItem[] }>("/api/conversations");
        if (cancelled) return;
        setConversations(res.conversations);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load conversations");
      }
    })();

    // Refresh when new messages arrive and the tab regains focus.
    const offNew = onSocketEvent("message:new", () => load(true));
    const onVisible = () => {
      if (document.visibilityState === "visible") load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      offNew();
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openDirect() {
    const target = username.trim();
    if (!target || busy) return;
    setBusy(true);
    try {
      const res = await api.post<{ conversation: { id: string } }>("/api/conversations/direct", { username: target });
      router.push(`/app/messages/${res.conversation.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not open conversation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader>
        <h1 className="flex-1 text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Messages</h1>
        <Button size="sm" onClick={() => setShowNew((value) => !value)}>
          <PlusIcon size={16} />
          New
        </Button>
      </PageHeader>

      {showNew && (
        <div className="flex items-center gap-2 px-4 pb-3">
          <Input
            autoFocus
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Rider username"
            onKeyDown={(event) => {
              if (event.key === "Enter") openDirect();
            }}
          />
          <Button size="sm" onClick={openDirect} loading={busy}>
            Open
          </Button>
        </div>
      )}

      {error ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
      ) : conversations === null ? (
        <div className="grid place-items-center py-14">
          <InlineSpinner />
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={<MessagesIcon size={32} />}
          title="No messages yet"
          description="Find a rider and send them a message."
        />
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {conversations.map((conversation) => (
            <ConversationRow key={conversation.id} conversation={conversation} />
          ))}
        </div>
      )}
    </div>
  );
}