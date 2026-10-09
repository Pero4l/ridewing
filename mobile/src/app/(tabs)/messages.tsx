/* eslint-disable react-hooks/set-state-in-effect --
 * These screens load data on mount. The effect only *starts* an async fetch;
 * the state updates it triggers all land after an `await`, so there is no
 * synchronous setState during render. The rule cannot see across the async
 * boundary and flags the fetch helper instead.
 */
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Avatar,
  Divider,
  EmptyState,
  ErrorState,
  Row,
  Screen,
  ScreenHeader,
  Spinner,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { messageTime } from "@/lib/format";
import { onSocketEvent } from "@/lib/socket";
import type { ConversationListItem } from "@/lib/types";

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setError(null);
    try {
      // `/conversations` returns a bare `{ conversations }`, not a page.
      const res = await api.get<{ conversations: ConversationListItem[] }>("/api/conversations");
      setItems(res.conversations);
      setError(null);
    } catch (err) {
      if (!opts.silent)
        setError(err instanceof ApiError ? err.message : "Could not load messages.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates: a new message moves the thread to the top and bumps the badge.
  // `silent` avoids clobbering the list on a transient failure.
  useEffect(
    () =>
      onSocketEvent("message:new", () => {
        void load({ silent: true });
      }),
    [load],
  );

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        // `insets.bottom` is a runtime value, so it stays inline; the rest of the
        // container is static spacing.
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            // No `tintColor`: the platform default already follows the system
            // appearance, so it is correct in both schemes.
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListHeaderComponent={
          <ScreenHeader title="Messages" subtitle="Direct and group chats" />
        }
        renderItem={({ item, index }) => {
          const other =
            item.type === "direct"
              ? (item.participants.find((p) => p.username !== undefined) ?? item.participants[0])
              : null;
          const unread = item.unreadCount > 0;

          return (
            <View>
              {index > 0 ? <Divider className="mx-4" /> : null}
              <Pressable
                onPress={() => router.push(`/thread/${item.id}`)}
                accessibilityRole="button"
                className="flex-row gap-3 px-4 py-3 active:bg-raised"
              >
              {item.community?.image ? (
                <Image
                  source={{ uri: item.community.image }}
                  className="h-12 w-12 rounded-full bg-raised"
                  contentFit="cover"
                />
              ) : (
                <Avatar user={other ?? null} size={48} />
              )}

              <View className="flex-1 justify-center">
                <Row className="justify-between">
                  <T size={15} weight={unread ? "700" : "600"} numberOfLines={1} className="flex-1">
                    {item.title}
                  </T>
                  {item.lastMessageAt ? (
                    <T size={11} muted>
                      {messageTime(item.lastMessageAt)}
                    </T>
                  ) : null}
                </Row>
                <Row className="justify-between" gap={8}>
                  <T size={13} muted numberOfLines={1} className="flex-1">
                    {item.lastMessage?.hasSharedPost
                      ? "Shared a post"
                      : (item.lastMessage?.content ?? "No messages yet")}
                  </T>
                  {unread ? (
                    <View className="min-w-5 items-center rounded-full bg-accent px-1.5 py-0.5">
                      <T size={11} weight="700" className="text-onAccent">
                        {item.unreadCount > 99 ? "99+" : item.unreadCount}
                      </T>
                    </View>
                  ) : null}
                </Row>
              </View>
            </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <Spinner label="Loading messages" />
          ) : error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : (
            <EmptyState
              icon="chatbubbles-outline"
              title="No messages yet"
              body="Send a post to a rider to start a conversation, or join a group chat."
            />
          )
        }
      />
    </Screen>
  );
}
