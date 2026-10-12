/* eslint-disable react-hooks/set-state-in-effect --
 * These screens load data on mount. The effect only *starts* an async fetch;
 * the state updates it triggers all land after an `await`, so there is no
 * synchronous setState during render. The rule cannot see across the async
 * boundary and flags the fetch helper instead.
 */
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  Screen,
  Spinner,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import type { Community, Page } from "@/lib/types";

/**
 * Each list item is a discriminated union so TypeScript narrows properly in
 * `renderItem` — no "property X does not exist on union" errors.
 */
type ListItem =
  | { kind: "header" }
  | { kind: "spinner" }
  | { kind: "error" }
  | { kind: "section"; label: string }
  | { kind: "community"; community: Community; isMember: boolean }
  | { kind: "empty" };

export default function CommunitiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();

  const [mine, setMine] = useState<Community[]>([]);
  const [suggested, setSuggested] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // `/mine` returns a bare `{ communities }` — not a paginated page.
      const [joined, all] = await Promise.all([
        api.get<{ communities: Community[] }>("/api/communities/mine"),
        api.get<Page<Community>>("/api/communities?limit=40"),
      ]);
      setMine(joined.communities);
      setSuggested(
        all.items.filter((c) => !joined.communities.some((j) => j.id === c.id)),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load groups.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Build the heterogeneous list data
  const data: ListItem[] = [
    { kind: "header" },
    ...(loading ? [{ kind: "spinner" as const }] : []),
    ...(error && !mine.length && !suggested.length
      ? [{ kind: "error" as const }]
      : []),
    ...(mine.length
      ? [{ kind: "section" as const, label: "YOUR GROUPS" }]
      : []),
    ...mine.map(
      (c) => ({ kind: "community" as const, community: c, isMember: true }),
    ),
    ...(!loading && suggested.length
      ? [{ kind: "section" as const, label: "DISCOVER" }]
      : []),
    ...(!loading
      ? suggested.map((c) => ({
          kind: "community" as const,
          community: c,
          isMember: false,
        }))
      : []),
    ...(!loading && !error && !mine.length && !suggested.length
      ? [{ kind: "empty" as const }]
      : []),
  ];

  return (
    <Screen>
      <FlatList
        data={data}
        keyExtractor={(item) => {
          if (item.kind === "community") return `c-${item.community.id}`;
          if (item.kind === "section") return `s-${item.label}`;
          return item.kind;
        }}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 96 },
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
        renderItem={({ item }) => {
          switch (item.kind) {
            case "header":
              return (
                <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                  <View style={styles.headerText}>
                    <T size={28} weight="800" style={styles.headerTitle}>
                      Groups
                    </T>
                    <T size={12} muted style={styles.headerSubtitle}>
                      Local scenes, clubs and routes
                    </T>
                  </View>
                  {/* Create button — icon + label, right-aligned */}
                  <Pressable
                    onPress={() => router.push("/community/new")}
                    accessibilityRole="button"
                    accessibilityLabel="Create a group"
                    style={[
                      styles.createBtn,
                      { backgroundColor: colors.accentSoft },
                    ]}
                  >
                    <Ionicons name="add" size={15} color={colors.accent} />
                    <T size={13} weight="700" tone="accent">
                      Create
                    </T>
                  </Pressable>
                </View>
              );

            case "spinner":
              return <Spinner label="Loading groups…" />;

            case "error":
              return (
                <ErrorState
                  message={error ?? ""}
                  onRetry={() => void load()}
                />
              );

            case "section":
              return (
                <T
                  size={11}
                  weight="700"
                  muted
                  style={styles.sectionLabel}
                >
                  {item.label}
                </T>
              );

            case "community":
              return (
                <CommunityRow
                  community={item.community}
                  isMember={item.isMember}
                  colors={colors}
                  onPress={() =>
                    router.push(`/community/${item.community.slug}`)
                  }
                />
              );

            case "empty":
              return (
                <EmptyState
                  icon="people-outline"
                  title="No groups yet"
                  body="Start one for your local scene, or check back as more riders join."
                />
              );

            default:
              return null;
          }
        }}
      />
    </Screen>
  );
}

// ── Community row ────────────────────────────────────────────────────────────

type CommunityRowProps = {
  community: Community;
  isMember: boolean;
  // Pass colors down so the row doesn't need to call usePalette itself
  colors: ReturnType<typeof import("@/lib/palette").usePalette>["colors"];
  onPress: () => void;
};

function CommunityRow({ community, isMember, colors, onPress }: CommunityRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${community.name}`}
      style={({ pressed }) => [
        styles.communityRow,
        { backgroundColor: pressed ? colors.raised : colors.surface },
      ]}
    >
      {/* Thumbnail: image or placeholder icon */}
      {community.image ? (
        <Image
          source={{ uri: community.image }}
          style={styles.thumbnail}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View
          style={[styles.thumbnail, styles.thumbnailPlaceholder, { backgroundColor: colors.raised }]}
        >
          <Ionicons name="people" size={22} color={colors.muted} />
        </View>
      )}

      {/* Name + meta */}
      <View style={styles.communityMeta}>
        <View style={styles.communityNameRow}>
          <T size={15} weight="700" numberOfLines={1} style={styles.communityName}>
            {community.name}
          </T>
          {isMember ? <Badge label="Member" tone="accent" /> : null}
        </View>
        <View style={styles.communitySubRow}>
          <T size={12} muted numberOfLines={1}>
            {community.memberCount}{" "}
            {community.memberCount === 1 ? "member" : "members"}
          </T>
          {community.joinPolicy === "request" ? (
            <>
              <T size={12} muted>
                ·
              </T>
              <View
                style={[
                  styles.policyBadge,
                  { backgroundColor: colors.raised },
                ]}
              >
                <Ionicons
                  name="lock-closed"
                  size={10}
                  color={colors.muted}
                />
                <T size={11} muted>
                  Approval
                </T>
              </View>
            </>
          ) : (
            <>
              <T size={12} muted>
                ·
              </T>
              <T size={11} tone="success">
                Open
              </T>
            </>
          )}
        </View>
      </View>

      {/* Chevron */}
      <Ionicons name="chevron-forward" size={16} color={colors.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: {
    gap: 2,
    paddingTop: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
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
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
  communityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 12,
    flexShrink: 0,
  },
  thumbnailPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  communityMeta: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  communityNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  communityName: {
    flexShrink: 1,
  },
  communitySubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  policyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
});
