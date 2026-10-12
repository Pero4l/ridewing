/* eslint-disable react-hooks/set-state-in-effect */
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Divider, Spinner, T } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import { messageTime } from "@/lib/format";
import { emitWithAck, onSocketEvent } from "@/lib/socket";
import type { Message, Page } from "@/lib/types";

function newNonce() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function ThreadScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();
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
      const res = await api.get<{ conversations: { id: string; title: string }[] }>("/api/conversations");
      const found = res.conversations.find((c) => c.id === conversationId);
      if (found) setTitle(found.title);
    } catch { /* header is decorative */ }

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

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void emitWithAck("conversation:join", { conversationId }).catch(() => {});
    void api.post(`/api/conversations/${conversationId}/read`).catch(() => {});
    return () => { void emitWithAck("conversation:leave", { conversationId }).catch(() => {}); };
  }, [conversationId]);

  const acceptMessage = useCallback((incoming: Message) => {
    setMessages((current) => {
      const index = current.findIndex((m) =>
        incoming.clientNonce ? m.clientNonce === incoming.clientNonce : m.id === incoming.id,
      );
      if (index === -1) return [...current, incoming];
      const next = [...current];
      next[index] = { ...next[index], ...incoming, pending: false, failed: false };
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

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      style={{ flex: 1, backgroundColor: colors.canvas }}
    >
      {/* Custom header — replaces the native header so we can put a back
          button and the conversation title in one row */}
      <View
        style={[
          styles.threadHeader,
          {
            paddingTop: insets.top + 10,
            backgroundColor: colors.surface,
            borderBottomColor: colors.hairline,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </Pressable>
        <T size={17} weight="700" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </T>
      </View>

      {error ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <T size={12} tone="danger">{error}</T>
        </View>
      ) : null}

      {loading ? (
        <Spinner label="Loading messages" />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 6 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item, index }) => {
            const mine = item.senderId === "me" || item.sender?.username === undefined;
            const prevItem = index > 0 ? messages[index - 1] : null;
            const prevMine = prevItem
              ? prevItem.senderId === "me" || prevItem.sender?.username === undefined
              : null;
            // Show timestamp when sender changes or after a gap of >5 min
            const showTime =
              prevMine !== mine ||
              (prevItem &&
                new Date(item.createdAt).getTime() -
                  new Date(prevItem.createdAt).getTime() >
                  5 * 60 * 1000);

            return (
              <View>
                {showTime ? (
                  <T
                    size={11}
                    tone="muted"
                    style={{ textAlign: "center", marginVertical: 8 }}
                  >
                    {messageTime(item.createdAt)}
                  </T>
                ) : null}

                <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                  <View
                    style={[
                      styles.bubble,
                      mine
                        ? [styles.bubbleMine, { backgroundColor: colors.accent }]
                        : [styles.bubbleTheirs, { backgroundColor: colors.raised }],
                      item.pending ? { opacity: 0.55 } : null,
                    ]}
                  >
                    <T
                      size={15}
                      style={{ color: mine ? colors.onAccent : colors.ink, lineHeight: 21 } as never}
                    >
                      {item.content}
                    </T>
                    {item.failed ? (
                      <T size={11} style={{ color: colors.danger, marginTop: 2 } as never}>
                        Not sent · tap to retry
                      </T>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Input bar */}
      <Divider />
      <View
        style={[
          styles.inputBar,
          {
            backgroundColor: colors.surface,
            paddingBottom: insets.bottom + 10,
          },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="iMessage"
          placeholderTextColor={colors.faint}
          multiline
          maxLength={2000}
          style={[
            styles.input,
            {
              backgroundColor: colors.raised,
              color: colors.ink,
              borderColor: colors.hairline,
            },
          ]}
          onSubmitEditing={send}
          blurOnSubmit={false}
        />
        <Pressable
          onPress={send}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          style={[
            styles.sendBtn,
            { backgroundColor: canSend ? colors.accent : colors.raised },
          ]}
        >
          <Ionicons
            name="arrow-up"
            size={20}
            color={canSend ? colors.onAccent : colors.faint}
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 4,
  },
  bubbleRow: {
    flexDirection: "row",
  },
  bubbleRowMine: {
    justifyContent: "flex-end",
  },
  bubbleRowTheirs: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  bubbleMine: {
    borderBottomRightRadius: 5,
  },
  bubbleTheirs: {
    borderBottomLeftRadius: 5,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    maxHeight: 120,
    lineHeight: 20,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
