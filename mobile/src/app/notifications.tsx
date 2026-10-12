/* eslint-disable react-hooks/set-state-in-effect --
 * This screen loads data on mount. The effect only *starts* an async fetch; the
 * state updates it triggers all land after an `await`, so there is no synchronous
 * setState during render. The rule cannot see across the async boundary.
 */
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Avatar,
  Badge,
  Divider,
  EmptyState,
  ErrorState,
  Screen,
  Spinner,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { usePalette } from "@/lib/palette";
import { onSocketEvent } from "@/lib/socket";
import type { NotificationItem, Page } from "@/lib/types";

// ── Notification metadata ────────────────────────────────────────────────────

type NoteMeta = {
  icon: keyof typeof Ionicons.glyphMap;
  /** Background colour of the 40 × 40 icon circle */
  bg: "accentSoft" | "dangerSoft" | "raised";
  /** Icon colour token */
  tone: "accent" | "danger" | "success" | "muted";
  label: string;
};

/** Maps a notification type to a display-layer descriptor. */
function describe(item: NotificationItem): NoteMeta {
  const who = item.actor?.displayName ?? "Someone";
  switch (item.type) {
    case "follow":
      return { icon: "person-add-outline", bg: "accentSoft", tone: "accent", label: `${who} started following you` };
    case "post_like":
      return { icon: "heart", bg: "dangerSoft", tone: "danger", label: `${who} liked your post` };
    case "post_comment":
    case "comment_reply":
      return { icon: "chatbubble-outline", bg: "accentSoft", tone: "accent", label: `${who} commented on your post` };
    case "comment_like":
      return { icon: "heart-outline", bg: "dangerSoft", tone: "danger", label: `${who} liked your comment` };
    case "post_share":
      return { icon: "paper-plane-outline", bg: "accentSoft", tone: "accent", label: `${who} shared your post` };
    case "message":
      return { icon: "chatbubbles-outline", bg: "accentSoft", tone: "accent", label: `${who} sent you a message` };
    case "ride_invite":
      return { icon: "navigate-outline", bg: "accentSoft", tone: "accent", label: `${who} invited you to a ride` };
    case "ride_signal":
      return { icon: "warning-outline", bg: "dangerSoft", tone: "danger", label: `${who} raised a roadside signal` };
    case "community_join_request":
      return { icon: "people-outline", bg: "accentSoft", tone: "accent", label: `${who} asked to join your group` };
    case "community_join_approved":
      return { icon: "checkmark-circle-outline", bg: "accentSoft", tone: "success", label: "Your request to join a group was approved" };
    case "community_join_rejected":
      return { icon: "close-circle-outline", bg: "dangerSoft", tone: "danger", label: "Your request to join a group was declined" };
    case "community_role_changed":
      return { icon: "shield-outline", bg: "raised", tone: "muted", label: "Your role in a group changed" };
    case "support_ticket":
      return { icon: "help-circle-outline", bg: "raised", tone: "muted", label: "We replied to your support ticket" };
    default:
      return { icon: "notifications-outline", bg: "raised", tone: "muted", label: "New activity" };
  }
}

/** Navigate to the most relevant destination for a notification. */
function open(item: NotificationItem) {
  const data = item.data as {
    postId?: string;
    conversationId?: string;
    rideId?: string;
    slug?: string;
  };
  if (item.entityType === "post" && data.postId) return router.push(`/post/${data.postId}`);
  if (item.type === "message" && data.conversationId)
    return router.push(`/thread/${data.conversationId}`);
  if (item.type.startsWith("ride_") && data.rideId)
    return router.push(`/ride/${data.rideId}`);
  if (item.entityType === "community" && data.slug)
    return router.push(`/community/${data.slug}`);
  if (item.actor?.username) return router.push(`/profile/${item.actor.username}`);
  return undefined;
}

// ── List item types ──────────────────────────────────────────────────────────

type ListItem =
  | { kind: "header" }
  | { kind: "spinner" }
  | { kind: "error" }
  | { kind: "section"; label: string }
  | { kind: "notification"; item: NotificationItem }
  | { kind: "empty" };

// ── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const page = await api.get<Page<NotificationItem>>(
        "/api/notifications?limit=50",
      );
      setItems(page.items);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not load notifications.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A live notification should surface without requiring a pull-to-refresh.
  useEffect(
    () => onSocketEvent<NotificationItem>("notification:new", () => void load()),
    [load],
  );

  // Opening the screen acts as a bulk read receipt. Mark all after load.
  useEffect(() => {
    const hasUnread = items.some((item) => !item.readAt);
    if (!hasUnread) return;
    void api.post("/api/notifications/read").catch(() => {});
    setItems((current) =>
      current.map((item) => ({
        ...item,
        readAt: item.readAt ?? new Date().toISOString(),
      })),
    );
  }, [items]);

  const hasUnread = items.some((item) => !item.readAt);

  // ── Grouped sections (TODAY / EARLIER) ────────────────────────────────────

  const { today, earlier } = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return {
      today: items.filter((n) => new Date(n.createdAt) >= todayStart),
      earlier: items.filter((n) => new Date(n.createdAt) < todayStart),
    };
  }, [items]);

  // Build a flat heterogeneous list with section separators
  const data: ListItem[] = useMemo(() => {
    const rows: ListItem[] = [{ kind: "header" }];

    if (loading) {
      rows.push({ kind: "spinner" });
      return rows;
    }
    if (error && !items.length) {
      rows.push({ kind: "error" });
      return rows;
    }
    if (!items.length) {
      rows.push({ kind: "empty" });
      return rows;
    }

    if (today.length) {
      rows.push({ kind: "section", label: "TODAY" });
      today.forEach((n) => rows.push({ kind: "notification", item: n }));
    }
    if (earlier.length) {
      rows.push({ kind: "section", label: "EARLIER" });
      earlier.forEach((n) => rows.push({ kind: "notification", item: n }));
    }

    return rows;
  }, [loading, error, items, today, earlier]);

  // ── Handlers ────────────────────────────────────────────────────────────

  function markAllRead() {
    void api.post("/api/notifications/read").catch(() => {});
    setItems((current) =>
      current.map((item) => ({
        ...item,
        readAt: item.readAt ?? new Date().toISOString(),
      })),
    );
  }

  // ── Icon colour helper ────────────────────────────────────────────────────

  function iconColor(tone: NoteMeta["tone"]): string {
    switch (tone) {
      case "accent":
        return colors.accent;
      case "danger":
        return colors.danger;
      case "success":
        return colors.success;
      default:
        return colors.muted;
    }
  }

  function iconBg(bg: NoteMeta["bg"]): string {
    switch (bg) {
      case "accentSoft":
        return colors.accentSoft;
      case "dangerSoft":
        return colors.dangerSoft;
      default:
        return colors.raised;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Screen>
      <FlatList
        data={data}
        keyExtractor={(item, index) =>
          item.kind === "notification" ? item.item.id : `k-${item.kind}-${index}`
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
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
          // ── Header ──────────────────────────────────────────────────────
          if (item.kind === "header") {
            return (
              <View
                style={[styles.header, { paddingTop: insets.top + 12 }]}
              >
                <View style={styles.headerText}>
                  <T size={28} weight="800" style={styles.headerTitle}>
                    Notifications
                  </T>
                  <T size={12} muted style={styles.headerSubtitle}>
                    Activity on your posts and rides
                  </T>
                </View>
                {/* Mark all read — visible only when there are unread items */}
                {hasUnread ? (
                  <Pressable
                    onPress={markAllRead}
                    accessibilityRole="button"
                    accessibilityLabel="Mark all as read"
                    style={[
                      styles.markReadBtn,
                      { backgroundColor: colors.raised },
                    ]}
                  >
                    <T size={12} weight="600" tone="accent">
                      Mark read
                    </T>
                  </Pressable>
                ) : null}
              </View>
            );
          }

          // ── Spinner ─────────────────────────────────────────────────────
          if (item.kind === "spinner") {
            return <Spinner label="Loading notifications…" />;
          }

          // ── Error ───────────────────────────────────────────────────────
          if (item.kind === "error") {
            return (
              <ErrorState
                message={error ?? ""}
                onRetry={() => void load()}
              />
            );
          }

          // ── Empty state ─────────────────────────────────────────────────
          if (item.kind === "empty") {
            return (
              <EmptyState
                icon="notifications-outline"
                title="Nothing new"
                body="Likes, comments, follows and ride invitations land here."
              />
            );
          }

          // ── Section label ───────────────────────────────────────────────
          if (item.kind === "section") {
            return (
              <T size={11} weight="700" muted style={styles.sectionLabel}>
                {item.label}
              </T>
            );
          }

          // ── Notification row ────────────────────────────────────────────
          const { icon, tone, bg, label } = describe(item.item);
          const unread = !item.item.readAt;

          // Only draw a divider between two notification rows (skip it when
          // the previous item is a section label or the header)
          const prevItem = index > 0 ? data[index - 1] : undefined;
          const showDivider =
            prevItem?.kind === "notification";

          return (
            <View>
              {showDivider ? <Divider className="mx-4" /> : null}
              <Pressable
                onPress={() => open(item.item)}
                accessibilityRole="button"
                accessibilityLabel={label}
                style={({ pressed }) => [
                  styles.noteRow,
                  {
                    backgroundColor: pressed
                      ? colors.raised
                      : unread
                        ? colors.accentSoft
                        : "transparent",
                  },
                ]}
              >
                {/* Coloured icon circle (40 × 40) */}
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: iconBg(bg) },
                  ]}
                >
                  <Ionicons
                    name={icon}
                    size={18}
                    color={iconColor(tone)}
                  />
                </View>

                {/* Label + relative time */}
                <View style={styles.noteBody}>
                  <T
                    size={14}
                    weight={unread ? "700" : "500"}
                    numberOfLines={2}
                  >
                    {label}
                  </T>
                  <T size={11} muted>
                    {relativeTime(item.item.createdAt)}
                  </T>
                </View>

                {/* Actor avatar + unread badge, right-aligned */}
                <View style={styles.noteRight}>
                  {item.item.actor ? (
                    <Avatar user={item.item.actor} size={30} />
                  ) : null}
                  {unread ? (
                    <Badge label="New" tone="accent" />
                  ) : null}
                </View>
              </Pressable>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    // No outer padding — rows own their horizontal spacing so dividers can
    // be full-width while inset as needed
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    marginTop: 2,
  },
  markReadBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 4,
    flexShrink: 0,
  },
  sectionLabel: {
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 6,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  noteBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  noteRight: {
    flexShrink: 0,
    alignItems: "center",
    gap: 5,
  },
});
