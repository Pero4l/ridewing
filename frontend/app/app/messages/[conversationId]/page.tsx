"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { ChatThread } from "@/components/chat-thread";
import { InlineSpinner } from "@/components/spinner";
import { useToast } from "@/components/toast";
import type { ConversationListItem, PublicUser } from "@/lib/types";

export default function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [conversation, setConversation] = useState<ConversationListItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ conversations: ConversationListItem[] }>("/api/conversations");
        if (cancelled) return;
        const found = res.conversations.find((item) => item.id === conversationId);
        if (!found) {
          toast.error("Conversation not found");
          router.replace("/app/messages");
          return;
        }
        setConversation(found);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof ApiError ? error.message : "Could not load conversation");
          router.replace("/app/messages");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  if (loading || !conversation) {
    return (
      <div className="grid h-dvh place-items-center">
        <InlineSpinner />
      </div>
    );
  }

  const participants: PublicUser[] = conversation.participants ?? [];

  return (
    <ChatThread
      key={conversation.id}
      conversationId={conversation.id}
      title={conversation.title}
      participants={participants}
    />
  );
}