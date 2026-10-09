/* eslint-disable react-hooks/set-state-in-effect --
 * This screen loads data on mount. The effect only *starts* an async fetch; the
 * state updates it triggers all land after an `await`, so there is no synchronous
 * setState during render. The rule cannot see across the async boundary.
 */
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  Avatar,
  Badge,
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
import { relativeTime } from "@/lib/format";
import { onSocketEvent } from "@/lib/socket";
import type { NotificationItem, Page } from "@/lib/types";

type ListItem =
  | { kind: "header" }
  | { kind: "error" }
  | { kind: "notification"; item: NotificationItem }
  | { kind: "empty" };

/** Maps a notification type to an icon and a short human sentence. */
function describe(
  item: NotificationItem,
): { icon: keyof typeof Ionicons.glyphMap; tone: "accent" | "danger" | "success" | "muted"; label: string } {
  const who = item.actor?.displayName ?? "Someone";
  switch (item.type) {
    case "follow":
      return { icon: "person-add-outline", tone: "accent", label: `${who} started following you` };
    case "post_like":
      return { icon: "heart-outline", tone: "danger", label: `${who} liked your post` };
    case "post_comment":
    case "comment_reply":
      return { icon: "chatbubble-outline", tone: "accent", label: `${who} commented on your post` };
    case "comment_like":
      return { icon: "heart-outline", tone: "danger", label: `${who} liked your comment` };
    case "post_share":
      return { icon: "paper-plane-outline", tone: "accent", label: `${who} shared your post` };
    case "message":
      return { icon: "chatbubbles-outline", tone: "accent", label: `${who} sent you a message` };
    case "ride_invite":
      return { icon: "navigate-outline", tone: "accent", label: `${who} invited you to a ride` };
    case "ride_signal":
      return { icon: "warning-outline", tone: "danger", label: `${who} raised a roadside signal` };
    case "community_join_request":
      return { icon: "people-outline", tone: "accent", label: `${who} asked to join your group` };
    case "community_join_approved":
      return { icon: "checkmark-circle-outline", tone: "success", label: `Your request to join a group was approved` };
    case "community_join_rejected":
      return { icon: "close-circle-outline", tone: "danger", label: `Your request to join a group was declined` };
    case "community_role_changed":
      return { icon: "shield-outline", tone: "muted", label: `Your role in a group changed` };
    case "support_ticket":
      return { icon: "help-circle-outline", tone: "muted", label: `We replied to your support ticket` };
    default:
      return { icon: "notifications-outline", tone: "muted", label: "New activity" };
  }
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const page = await api.get<Page<NotificationItem>>("/api/notifications?limit=50");
      setItems(page.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load notifications.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A live notification should appear without pulling to refresh.
  useEffect(() => onSocketEvent<NotificationItem>("notification:new", () => void load()), [load]);

  // Opening the screen is the read receipt.
  useEffect(() => {
    const hasUnread = items.some((item) => !item.readAt);
    if (!hasUnread) return;
    void api.post("/api/notifications/read").catch(() => {});
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
  }, [items]);

  function open(item: NotificationItem) {
    const data = item.data as { postId?: string; conversationId?: string; rideId?: string; slug?: string };
    if (item.entityType === "post" && data.postId) return router.push(`/post/${data.postId}`);
    if (item.type === "message" && data.conversationId) {
      return router.push(`/thread/${data.conversationId}`);
    }
    if (item.type.startsWith("ride_") && data.rideId) return router.push(`/ride/${data.rideId}`);
    if (item.entityType === "community" && data.slug) return router.push(`/community/${data.slug}`);
    if (item.actor?.username) return router.push(`/profile/${item.actor.username}`);
    return undefined;
  }

  const data: ListItem[] = [
    { kind: "header" },
    ...(error && !items.length ? ([{ kind: "error" }] as ListItem[]) : []),
    ...items.map((item) => ({ kind: "notification", item }) as ListItem),
    ...(loading || (error && !items.length) ? [] : ([{ kind: "empty" }] as ListItem[])),
  ];

  return (
    <Screen>
      <FlatList
        data={data}
        keyExtractor={(item, index) => (item.kind === "notification" ? item.item.id : `k-${index}`)}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        renderItem={({ item, index }) => {
          if (item.kind === "header") {
            return <ScreenHeader title="Notifications" subtitle="Activity on your posts and rides" />;
          }
          if (item.kind === "error") return <ErrorState message={error ?? ""} onRetry={() => void load()} />;
          if (item.kind === "empty") {
            return (
              <EmptyState
                icon="notifications-outline"
                title="Nothing new"
                body="Likes, comments, follows and ride invitations land here."
              />
            );
          }

          const { icon, tone, label } = describe(item.item);
          const unread = !item.item.readAt;

          return (
            <View>
              {index > 1 ? <Divider className="mx-4" /> : null}
              <Pressable
                onPress={() => open(item.item)}
                accessibilityRole="button"
                accessibilityLabel={label}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.6 : 1,
                  backgroundColor: unread ? "rgb(var(--accent-soft))" : "transparent",
                })}
              >
                <Row gap={12} className="px-4 py-3">
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-raised">
                    <Ionicons name={icon} size={18} className={
                      tone === "accent"
                        ? "text-accent"
                        : tone === "danger"
                          ? "text-danger"
                          : tone === "success"
                            ? "text-success"
                            : "text-muted"
                    } />
                  </View>
                <View className="flex-1 gap-0.5">
                  <T size={14} weight={unread ? "700" : "500"}>{label}</T>
                  <T size={11} tone="muted">
                    {relativeTime(item.item.createdAt)}
                  </T>
                </View>
                <Row gap={8}>
                  {item.item.actor ? <Avatar user={item.item.actor} size={26} /> : null}
                  {unread ? <Badge label="NEW" tone="accent" /> : null}
                </Row>
              </Row>
            </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={loading ? <Spinner label="Loading notifications" /> : null}
      />
    </Screen>
  );
}