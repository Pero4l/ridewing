/* eslint-disable react-hooks/set-state-in-effect --
 * These screens load data on mount. The effect only *starts* an async fetch;
 * the state updates it triggers all land after an `await`, so there is no
 * synchronous setState during render. The rule cannot see across the async
 * boundary and flags the fetch helper instead.
 */
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Divider, Spinner, T } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, api } from "@/lib/api";
import { messageTime } from "@/lib/format";
import { usePalette } from "@/lib/palette";
import { emitWithAck, onSocketEvent } from "@/lib/socket";
import type { Message, Page } from "@/lib/types";

function newNonce() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function ThreadScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();

  const [messages, setMessages] = useState<Message[]>([]);
  const [title, setTitle] = useState("Conversation");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    try {
      // `/conversations` returns a bare `{ conversations }`, not a page.
      const res = await api.get<{
        conversations: { id: string; title: string }[];
      }>("/api/conversations");
      const found = res.conversations.find((c) => c.id === conversationId);
      if (found) setTitle(found.title);
    } catch {
      // The header is decorative; a failure here must not block the thread.
    }

    try {
      const page = await api.get<Page<Message>>(
        `/api/conversations/${conversationId}/messages?limit=50`,
      );
      setMessages(page.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this conversation.");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sitting in the thread is what makes the unread badge clear.
  useEffect(() => {
    void emitWithAck("conversation:join", { conversationId }).catch(() => {});
    void api.post(`/api/conversations/${conversationId}/read`).catch(() => {});
    return () => {
      void emitWithAck("conversation:leave", { conversationId }).catch(() => {});
    };
  }, [conversationId]);

  // Reconcile optimistic sends against the confirmed message, and append new
  // arrivals. Matching on `clientNonce` is what stops a sent message appearing
  // twice (once optimistic, once from the socket echo).
  const acceptMessage = useCallback((incoming: Message) => {
    setMessages((current) => {
      const index = current.findIndex((m) =>
        incoming.clientNonce ? m.clientNonce === incoming.clientNonce : m.id === incoming.id,
      );
      if (index === -1) return [...current, incoming];
      const next = [...current];
      next[index] = {
        ...next[index],
        ...incoming,
        pending: false,
        failed: false,
      };
      return next;
    });
  }, []);

  useEffect(
    () =>
      onSocketEvent<Message>("message:new", (incoming) => {
        if (incoming.conversationId !== conversationId) return;
        acceptMessage(incoming);
      }),
    [conversationId, acceptMessage],
  );

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;

    const clientNonce = newNonce();
    const optimistic: Message = {
      id: `pending-${clientNonce}`,
      conversationId: String(conversationId),
      senderId: "me",
      content,
      sharedPostId: null,
      sharedPost: null,
      clientNonce,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setMessages((current) => [...current, optimistic]);
    setDraft("");
    setSending(true);

    try {
      const res = await api.post<{ message: Message }>(
        `/api/conversations/${conversationId}/messages`,
        { content, clientNonce },
      );
      acceptMessage(res.message);
    } catch (err) {
      setMessages((current) =>
        current.map((m) => (m.id === optimistic.id ? { ...m, pending: false, failed: true } : m)),
      );
      setError(err instanceof ApiError ? err.message : "Message not sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      className="flex-1 bg-canvas"
    >
      <View className="border-b border-border px-4 py-2.5">
        <T size={16} weight="700" numberOfLines={1}>
          {title}
        </T>
      </View>

      {error ? (
        <View className="px-4 pt-2">
          <T size={12} tone="danger">
            {error}
          </T>
        </View>
      ) : null}

      {loading ? (
        <Spinner label="Loading messages" />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          // `FlatList` has no `className` for its content container, so the
          // scroll padding and gap stay inline.
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const mine = item.senderId === "me" || item.sender?.username === undefined;
            // Own bubbles sit on the accent surface, theirs on the muted raised
            // surface. Both pairs are semantic tokens, so the dark scheme swaps
            // the surface *and* the on-surface text together.
            return (
              <View className={mine ? "items-end" : "items-start"}>
                <View
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                    mine
                      ? "rounded-br-md bg-accent"
                      : "rounded-bl-md bg-raised"
                  } ${item.pending ? "opacity-60" : ""}`}
                >
                  <T size={15} className={mine ? "text-onAccent" : "text-ink"}>
                    {item.content}
                  </T>
                  <T size={10} className={`mt-[3px] ${mine ? "text-onAccent/70" : "text-faint"}`}>
                    {item.failed ? "not sent" : messageTime(item.createdAt)}
                  </T>
                </View>
              </View>
            );
          }}
        />
      )}

      <Divider />

      <View
        className="flex-row items-end gap-2 bg-surface px-3 pt-3"
        // Only the safe-area padding is dynamic, so it stays inline.
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor={colors.faint}
          multiline
          className="max-h-[120px] flex-1 rounded-2xl bg-raised px-3.5 py-2.5 text-[15px] text-ink"
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send"
          // `active:` is constant so the Pressable upgrade happens on the
          // first render only; the fill is a plain utility and may toggle.
          className={`h-[42px] w-[42px] items-center justify-center rounded-full active:opacity-80 ${
            draft.trim() ? "bg-accent" : "bg-raised"
          }`}
        >
          <Ionicons
            name="arrow-up"
            size={20}
            className={draft.trim() ? "text-onAccent" : "text-faint"}
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
