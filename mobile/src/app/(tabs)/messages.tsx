/* eslint-disable react-hooks/set-state-in-effect */
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar, EmptyState, ErrorState, Screen, Spinner, T } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import { messageTime } from "@/lib/format";
import { onSocketEvent } from "@/lib/socket";
import type { ConversationListItem } from "@/lib/types";

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();

  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setError(null);
    try {
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

  useEffect(() => { void load(); }, [load]);

  useEffect(
    () => onSocketEvent("message:new", () => void load({ silent: true })),
    [load],
  );

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
        }
        ListHeaderComponent={
          <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
            <T size={28} weight="800" style={{ letterSpacing: -0.5 }}>
              Messages
            </T>
            <Pressable
              onPress={() => router.push("/search")}
              accessibilityRole="button"
              accessibilityLabel="New message"
              style={[styles.iconBtn, { backgroundColor: colors.raised }]}
            >
              <Ionicons name="create-outline" size={21} color={colors.ink} />
            </Pressable>
          </View>
        }
        ItemSeparatorComponent={() => (
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginLeft: 80 }} />
        )}
        renderItem={({ item }) => {
          const other =
            item.type === "direct"
              ? (item.participants.find((p) => p.username !== undefined) ?? item.participants[0])
              : null;
          const unread = item.unreadCount > 0;

          return (
            <Pressable
              onPress={() => router.push(`/thread/${item.id}`)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.raised : "transparent" }]}
            >
              {/* Avatar */}
              <View style={styles.avatarWrap}>
                {item.community?.image ? (
                  <Image source={{ uri: item.community.image }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <Avatar user={other ?? null} size={52} />
                )}
                {item.type === "community" && (
                  <View style={[styles.groupDot, { backgroundColor: colors.accent, borderColor: colors.canvas }]} />
                )}
              </View>

              {/* Text */}
              <View style={styles.content}>
                <View style={styles.topRow}>
                  <T size={16} weight={unread ? "700" : "500"} numberOfLines={1} style={{ flex: 1 }}>
                    {item.title}
                  </T>
                  <T size={12} tone="muted" style={{ marginLeft: 8, flexShrink: 0 }}>
                    {item.lastMessageAt ? messageTime(item.lastMessageAt) : ""}
                  </T>
                </View>

                <View style={styles.bottomRow}>
                  <T
                    size={14}
                    numberOfLines={1}
                    style={{ flex: 1, color: unread ? colors.ink : colors.muted, fontWeight: unread ? "600" : "400" } as never}
                  >
                    {item.lastMessage?.hasSharedPost
                      ? "📸 Shared a post"
                      : (item.lastMessage?.content ?? "No messages yet")}
                  </T>
                  {unread ? (
                    <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                      <T size={11} weight="700" style={{ color: colors.onAccent } as never}>
                        {item.unreadCount > 99 ? "99+" : item.unreadCount}
                      </T>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loading ? <Spinner label="Loading messages" /> :
          error ? <ErrorState message={error} onRetry={() => void load()} /> :
          <EmptyState
            icon="chatbubbles-outline"
            title="No messages yet"
            body="Go to a rider's profile and tap Message to start a conversation."
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
  },
  avatarWrap: { position: "relative" },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#E4E4E7" },
  groupDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
  },
  content: { flex: 1, gap: 3 },
  topRow: { flexDirection: "row", alignItems: "center" },
  bottomRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    flexShrink: 0,
  },
});
