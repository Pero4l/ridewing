/* eslint-disable react-hooks/set-state-in-effect --
 * These screens load data on mount. The effect only *starts* an async fetch;
 * the state updates it triggers all land after an `await`, so there is no
 * synchronous setState during render. The rule cannot see across the async
 * boundary and flags the fetch helper instead.
 */
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  EmptyState,
  ErrorState,
  Screen,
  SearchField,
  Skeleton,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import type { Community, Page } from "@/lib/types";

export default function CommunitiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();

  const [mine, setMine] = useState<Community[]>([]);
  const [suggested, setSuggested] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busySlug, setBusySlug] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setError(null);
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
      setError(null);
    } catch (err) {
      if (!quiet) setError(err instanceof ApiError ? err.message : "Could not load communities.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function joinGroup(slug: string, policy: string) {
    setBusySlug(slug);
    try {
      await api.post(`/api/communities/${slug}/join`);
      // Re-read both lists so counts, badges and sections settle truthfully.
      await load(true);
    } catch (err) {
      Alert.alert(
        "Could not join",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setBusySlug((s) => (s === slug ? null : s));
    }
  }

  const q = query.trim().toLowerCase();
  const mineFiltered = useMemo(
    () => (q ? mine.filter((c) => c.name.toLowerCase().includes(q)) : mine),
    [mine, q],
  );
  const suggestedFiltered = useMemo(
    () => (q ? suggested.filter((c) => c.name.toLowerCase().includes(q)) : suggested),
    [suggested, q],
  );

  return (
    <Screen>
      <FlatList
        data={[{ key: "body" }]}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.muted}
            colors={[colors.accent]}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        renderItem={() => (
          <View>
            {/* ── Header ─────────────────────────────────────────── */}
            <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.surface }]}>
              <View style={styles.headerText}>
                <T size={28} weight="800" style={styles.headerTitle}>
                  Communities
                </T>
                <T size={12} muted style={styles.headerSubtitle}>
                  {mine.length > 0
                    ? `${mine.length} ${mine.length === 1 ? "crew" : "crews"} · find your next one`
                    : "Local scenes, clubs and routes"}
                </T>
              </View>
              <Pressable
                onPress={() => router.push("/community/new")}
                accessibilityRole="button"
                accessibilityLabel="Create a community"
                hitSlop={8}
                style={[styles.createBtn, { backgroundColor: colors.accentSoft }]}
                className="active:opacity-70"
              >
                <Ionicons name="add" size={15} color={colors.accent} />
                <T size={13} weight="700" tone="accent">
                  Create
                </T>
              </Pressable>
            </View>

            {/* ── Search ─────────────────────────────────────────── */}
            <View style={{ backgroundColor: colors.surface }} className="px-4 pb-3">
              <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder="Search communities…"
              />
            </View>
            <View style={{ height: 8, backgroundColor: colors.canvas }} />

            {loading ? (
              <GroupSkeleton />
            ) : error && mine.length === 0 && suggested.length === 0 ? (
              <ErrorState message={error} onRetry={() => { setLoading(true); void load(); }} />
            ) : (
              <View style={styles.body}>
                {/* ── Your communities ────────────────────────── */}
                <SectionLabel
                  label={mineFiltered.length > 0 ? `YOUR COMMUNITIES · ${mineFiltered.length}` : "YOUR COMMUNITIES"}
                  action={
                    mineFiltered.length > 3 ? (
                      <T size={12} weight="600" tone="accent">
                        {`${mineFiltered.length} joined`}
                      </T>
                    ) : undefined
                  }
                />
                {mineFiltered.length > 0 ? (
                  <View
                    style={[styles.card, { borderColor: colors.hairline, backgroundColor: colors.surface }]}
                    className="border"
                  >
                    {mineFiltered.map((c, i) => (
                      <View key={c.id}>
                        {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.hairline }]} /> : null}
                        <GroupRow
                          community={c}
                          state="member"
                          busy={busySlug === c.slug}
                          onPress={() => router.push(`/community/${c.slug}`)}
                        />
                      </View>
                    ))}
                  </View>
                ) : (
                  <View
                    style={[styles.emptyCard, { borderColor: colors.hairline, backgroundColor: colors.surface }]}
                    className="border"
                  >
                    <EmptyState
                      icon="people-outline"
                      title={q ? "No matches in your communities" : "No communities yet"}
                      body={q ? "Try a different search." : "Join a crew below, or start your own local scene."}
                    />
                  </View>
                )}

                {/* ── Discover: standalone cards, one per community ── */}
                <SectionLabel label="DISCOVER" />
                {suggestedFiltered.length > 0 ? (
                  <View className="gap-3">
                    {suggestedFiltered.map((c) => (
                      <DiscoverCard
                        key={c.id}
                        community={c}
                        requested={c.viewerJoinRequestStatus === "pending"}
                        busy={busySlug === c.slug}
                        onJoin={() => joinGroup(c.slug, c.joinPolicy)}
                        onPress={() => router.push(`/community/${c.slug}`)}
                      />
                    ))}
                  </View>
                ) : (
                  <View
                    style={[styles.emptyCard, { borderColor: colors.hairline, backgroundColor: colors.surface }]}
                    className="border"
                  >
                    <EmptyState
                      icon="compass-outline"
                      title={q ? "No communities match" : "Nothing new"}
                      body={q ? "Try a different search." : "You have joined every community around. Nice."}
                    />
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      />
    </Screen>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function SectionLabel({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <View className="flex-row items-end justify-between px-1">
      <T size={11} weight="700" muted style={{ letterSpacing: 0.6 }}>
        {label}
      </T>
      {action}
    </View>
  );
}

function GroupRow({
  community,
  state,
  busy,
  onPress,
  onJoin,
}: {
  community: Community;
  state: "member" | "open" | "requested";
  busy: boolean;
  onPress: () => void;
  onJoin?: () => void;
}) {
  const { colors } = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${community.name}`}
      className="active:opacity-80"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.raised : colors.surface },
      ]}
    >
      {community.image ? (
        <Image
          source={{ uri: community.image }}
          style={styles.thumb}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: colors.raised }]}>
          <T size={20} weight="800" color={colors.muted}>
            {community.name.slice(0, 1).toUpperCase()}
          </T>
        </View>
      )}

      <View style={styles.meta}>
        <View style={styles.nameRow}>
          <T size={15} weight="700" numberOfLines={1} style={styles.name}>
            {community.name}
          </T>
        </View>
        <View style={styles.subRow}>
          <T size={12} muted numberOfLines={1}>
            {`${community.memberCount} ${community.memberCount === 1 ? "member" : "members"}`}
          </T>
          {community.joinPolicy === "request" ? (
            <View style={[styles.policyBadge, { backgroundColor: colors.raised }]}>
              <Ionicons name="lock-closed" size={10} color={colors.muted} />
              <T size={11} muted>Approval</T>
            </View>
          ) : (
            <T size={11} tone="success">Open</T>
          )}
        </View>
        {community.bio ? (
          <T size={13} tone="muted" numberOfLines={1} style={{ marginTop: 1 }}>
            {community.bio}
          </T>
        ) : null}
      </View>

      {state === "member" ? (
        <Ionicons name="chevron-forward" size={16} color={colors.faint} />
      ) : state === "requested" ? (
        <View style={[styles.joinBtn, styles.requestedBtn, { borderColor: colors.hairline }]}>
          <T size={12} weight="700" muted>Requested</T>
        </View>
      ) : (
        <Pressable
          onPress={onJoin}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Join ${community.name}`}
          hitSlop={6}
          style={[styles.joinBtn, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}
          className="active:opacity-70"
        >
          <T size={12} weight="700" color={colors.onAccent}>
            {busy ? "…" : community.joinPolicy === "request" ? "Request" : "Join"}
          </T>
        </Pressable>
      )}
    </Pressable>
  );
}

// ── Discover card: standalone, one card per community ────────────────────────

function DiscoverCard({
  community,
  requested,
  busy,
  onPress,
  onJoin,
}: {
  community: Community;
  requested: boolean;
  busy: boolean;
  onPress: () => void;
  onJoin: () => void;
}) {
  const { colors } = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${community.name}`}
      className="active:opacity-90"
      style={({ pressed }) => [
        {
          borderRadius: 18,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.hairline,
          backgroundColor: pressed ? colors.raised : colors.surface,
          overflow: "hidden",
        },
      ]}
    >
      {/* Banner */}
      <View style={{ height: 84, backgroundColor: colors.accentSoft }}>
        {community.image ? (
          <Image
            source={{ uri: community.image }}
            style={{ width: "100%", height: 84 }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="people" size={30} color={colors.accent} style={{ opacity: 0.5 }} />
          </View>
        )}
      </View>

      <View className="gap-1.5 p-4">
        <View className="flex-row items-center justify-between gap-2">
          <T size={16} weight="800" numberOfLines={1} className="flex-1" style={{ letterSpacing: -0.2 }}>
            {community.name}
          </T>
          {requested ? (
            <View
              className="rounded-full px-3 py-1.5"
              style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline }}
            >
              <T size={12} weight="700" muted>Requested</T>
            </View>
          ) : (
            <Pressable
              onPress={onJoin}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Join ${community.name}`}
              hitSlop={6}
              className="rounded-full px-4 py-2 active:opacity-70"
              style={{ backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }}
            >
              <T size={13} weight="700" color={colors.onAccent}>
                {busy ? "…" : community.joinPolicy === "request" ? "Request" : "Join"}
              </T>
            </Pressable>
          )}
        </View>

        <View className="flex-row items-center gap-2">
          <View className="flex-row items-center gap-1">
            <Ionicons name="people-outline" size={13} color={colors.muted} />
            <T size={12} muted>
              {`${community.memberCount} ${community.memberCount === 1 ? "member" : "members"}`}
            </T>
          </View>
          {community.joinPolicy === "request" ? (
            <View
              className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
              style={{ backgroundColor: colors.raised }}
            >
              <Ionicons name="lock-closed" size={10} color={colors.muted} />
              <T size={11} muted>Approval needed</T>
            </View>
          ) : (
            <View
              className="rounded-full px-2 py-0.5"
              style={{ backgroundColor: colors.accentSoft }}
            >
              <T size={11} weight="700" tone="accent">Open to all</T>
            </View>
          )}
        </View>

        {community.bio ? (
          <T size={13} tone="muted" numberOfLines={2} style={{ lineHeight: 18 }}>
            {community.bio}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}

function GroupSkeleton() {
  const { colors } = usePalette();
  return (
    <View className="gap-3 px-4 pt-4">
      <Skeleton width={120} height={12} rounded={6} />
      {[0, 1, 2, 3].map((k) => (
        <View
          key={k}
          className="flex-row items-center gap-3 rounded-2xl border p-3"
          style={{ borderColor: colors.hairline, backgroundColor: colors.surface }}
        >
          <Skeleton width={52} height={52} rounded={14} />
          <View className="flex-1 gap-1.5">
            <Skeleton width="60%" height={15} rounded={7} />
            <Skeleton width="40%" height={11} rounded={5} />
          </View>
          <Skeleton width={64} height={32} rounded={16} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
  body: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 76,
  },
  emptyCard: {
    borderRadius: 16,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 12,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
    flexShrink: 0,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  name: {
    flexShrink: 1,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  policyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  joinBtn: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  requestedBtn: {
    backgroundColor: "transparent",
  },
});
