/* eslint-disable react-hooks/set-state-in-effect --
 * These screens load data on mount. The effect only *starts* an async fetch;
 * the state updates it triggers all land after an `await`, so there is no
 * synchronous setState during render. The rule cannot see across the async
 * boundary and flags the fetch helper instead.
 */
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PostCard, type PostActions } from "@/components/post-card";
import { RideRow } from "@/components/ride-row";
import {
  Avatar,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  FAB,
  Screen,
  SearchField,
  SectionTitle,
  Spinner,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import { useSession } from "@/lib/session";
import type { Community, Page, Post, Ride } from "@/lib/types";

/**
 * The feed.
 *
 * The API exposes a single chronological feed (`/api/posts?limit&cursor`), so this
 * is deliberately one list rather than tabs the backend cannot filter. A request
 * ticket guards the cursor: without it, a fast pull-to-refresh plus an
 * end-reached page could land out of order and re-append rows already present.
 *
 * The header carries the personal greeting, rider search, quick actions and the
 * running-rides strip, mirroring the web app's home so both clients introduce a
 * rider to the same things in the same order.
 */
export default function FeedScreen() {
  const router = useRouter();
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();

  const [posts, setPosts] = useState<Post[]>([]);
  const [groups, setGroups] = useState<Community[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const ticket = useRef(0);

  const load = useCallback(
    async (opts: { reset?: boolean; cursor?: string | null } = {}) => {
      const current = ++ticket.current;
      if (opts.reset) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      try {
        const params = new URLSearchParams({ limit: "20" });
        if (opts.cursor) params.set("cursor", opts.cursor);

        const page = await api.get<Page<Post>>(`/api/posts?${params.toString()}`);
        if (current !== ticket.current) return;

        setPosts((existing) => (opts.reset ? page.items : [...existing, ...page.items]));
        setCursor(page.pageInfo.nextCursor);
        setHasMore(page.pageInfo.hasMore);
        setError(null);
      } catch (err) {
        if (current !== ticket.current) return;
        setError(err instanceof ApiError ? err.message : "Could not load the feed.");
      } finally {
        if (current === ticket.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );

  // The group strip and running rides are supplementary, so a failure here must
  // not break the feed.
  useEffect(() => {
    (async () => {
      const [mineResult, suggestedResult, ridesResult] = await Promise.allSettled([
        api.get<{ communities: Community[] }>("/api/communities/mine"),
        api.get<Page<Community>>("/api/communities?limit=10"),
        api.get<{ rides: Ride[] }>("/api/rides"),
      ]);

      if (mineResult.status === "fulfilled" && suggestedResult.status === "fulfilled") {
        const mine = mineResult.value.communities;
        setGroups([
          ...mine,
          ...suggestedResult.value.items.filter((c) => !mine.some((m) => m.id === c.id)),
        ]);
      } else if (mineResult.status === "fulfilled") {
        setGroups(mineResult.value.communities);
      }

      if (ridesResult.status === "fulfilled") {
        setRides(ridesResult.value.rides.filter((ride) => ride.status === "active"));
      }
    })();
  }, []);

  useEffect(() => {
    void load({ reset: true });
  }, [load]);

  const actions: PostActions = {
    like: async (post) => {
      try {
        const res = await api.post<{ liked: boolean }>(`/api/posts/${post.id}/like`);
        setPosts((list) =>
          list.map((item) =>
            item.id === post.id
              ? {
                  ...item,
                  viewerLiked: res.liked,
                  likeCount: Math.max(0, item.likeCount + (res.liked ? 1 : -1)),
                }
              : item,
          ),
        );
      } catch {
        // The card restores server truth on the next refresh.
      }
    },
    repost: async (post) => {
      try {
        await api.post(`/api/posts/${post.id}/repost`);
        setPosts((list) =>
          list.map((item) => (item.id === post.id ? { ...item, repostCount: item.repostCount + 1 } : item)),
        );
      } catch {
        // Reposting twice is a no-op server-side; nothing to surface.
      }
    },
    comment: (post) => router.push(`/post/${post.id}`),
  };

  const firstName = user ? user.displayName.split(/\s+/)[0] : null;
  const hour = new Date().getHours();
  const greeting =
    hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <Screen>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        // Dynamic: the bottom pad has to clear the tab bar plus the safe area.
        contentContainerStyle={{
          paddingTop: insets.top + 6,
          paddingBottom: insets.bottom + 96,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load({ reset: true });
            }}
          />
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore && !loadingMore && !loading) void load({ cursor });
        }}
        ListHeaderComponent={
          <View className="gap-4 pb-1">
            {/* ── Personal greeting ────────────────────────────────────── */}
            <View className="flex-row items-center gap-3 px-4">
              {/* Avatar with an emerald ring to signal "it's your feed" */}
              <View
                className="rounded-full"
                style={{
                  borderWidth: 2,
                  borderColor: colors.accent,
                  padding: 2.5,
                }}
              >
                <Avatar user={user} size={44} />
              </View>
              <View className="min-w-0 flex-1">
                <T size={24} weight="800" numberOfLines={1} className="tracking-tight">
                  {firstName ? `${greeting}, ${firstName}` : greeting}
                </T>
                <T size={13} muted>
                  Find a ride, catch a crew.
                </T>
              </View>
              <Pressable
                onPress={() => router.push("/notifications")}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
                hitSlop={8}
                className="h-10 w-10 items-center justify-center rounded-full bg-raised active:opacity-75"
              >
                <Ionicons name="notifications-outline" size={22} color={colors.ink} />
              </Pressable>
            </View>

            <View className="px-4">
              <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder="Find riders by name…"
                onSubmit={() => {
                  const q = query.trim();
                  if (q.length >= 2) router.push(`/search?q=${encodeURIComponent(q)}`);
                }}
              />
            </View>

            <QuickActions />

            {rides.length ? (
              <View className="gap-1.5">
                <SectionTitle
                  action={
                    <Pressable onPress={() => router.push("/(tabs)/rides")} hitSlop={8}>
                      <T size={12} weight="600" tone="accent">
                        See all
                      </T>
                    </Pressable>
                  }
                >
                  Running rides
                </SectionTitle>
                <Card padded={false} className="mx-4 overflow-hidden">
                  {rides.slice(0, 3).map((ride, index) => (
                    <View key={ride.id}>
                      {index > 0 ? <Divider /> : null}
                      <RideRow ride={ride} />
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}

            {groups.length ? (
              <View className="gap-2">
                <SectionTitle
                  action={
                    <Pressable onPress={() => router.push("/(tabs)/communities")} hitSlop={8}>
                      <T size={12} weight="600" tone="accent">
                        See all
                      </T>
                    </Pressable>
                  }
                >
                  Your groups
                </SectionTitle>
                <FlatList
                  horizontal
                  data={groups}
                  keyExtractor={(item) => item.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => router.push(`/community/${item.slug}`)}
                      className="min-w-[128px] rounded-2xl border border-hairline bg-surface px-3.5 py-3 active:opacity-80"
                    >
                      <View className="mb-2 h-9 w-9 items-center justify-center rounded-xl bg-accentSoft">
                        <Ionicons name="people" size={18} color={colors.accent} />
                      </View>
                      <T size={13} weight="700" numberOfLines={1}>
                        {item.name}
                      </T>
                      <T size={11} muted>
                        {item.memberCount} riding
                      </T>
                    </Pressable>
                  )}
                />
              </View>
            ) : null}

            {/* Posts section label */}
            <SectionTitle>Latest posts</SectionTitle>
          </View>
        }
        renderItem={({ item }) => (
          <PostCard post={item} actions={actions} onOpenProfile={(u) => router.push(`/profile/${u}`)} />
        )}
        ListEmptyComponent={
          loading ? (
            <Spinner label="Loading the feed" />
          ) : error ? (
            <ErrorState message={error} onRetry={() => load({ reset: true })} />
          ) : (
            <EmptyState
              icon="newspaper-outline"
              title="Nothing here yet"
              body="Join a group or follow some riders and their posts will show up here."
              action={<Button label="Write a post" onPress={() => router.push("/compose")} />}
            />
          )
        }
        ListFooterComponent={loadingMore ? <Spinner /> : null}
      />

      <FAB icon="add" label="Write a post" onPress={() => router.push("/compose")} />
    </Screen>
  );
}

/**
 * The two things a rider is most likely to want next, as tappable tiles —
 * the mobile counterpart of the web app's quick-action grid.
 */
function QuickActions() {
  const router = useRouter();
  const { colors } = usePalette();
  return (
    <View className="flex-row gap-3 px-4">
      <Pressable
        onPress={() => router.push("/ride/new")}
        accessibilityRole="button"
        accessibilityLabel="Start a ride"
        className="flex-1 active:opacity-90"
      >
        <Card padded={false} className="overflow-hidden">
          <View className="p-4 gap-3">
            <View
              className="h-10 w-10 items-center justify-center rounded-2xl bg-accent"
              style={{
                shadowColor: "#10B981",
                shadowOpacity: 0.4,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 3 },
                elevation: 4,
              }}
            >
              <Ionicons name="navigate" size={18} color={colors.onAccent} />
            </View>
            <View>
              <T size={15} weight="700">
                Start a ride
              </T>
              <T size={12} muted>
                Voice + live roster
              </T>
            </View>
            <T size={12} weight="700" tone="accent">
              Go round-up →
            </T>
          </View>
        </Card>
      </Pressable>

      <Pressable
        onPress={() => router.push("/community/new")}
        accessibilityRole="button"
        accessibilityLabel="New community"
        className="flex-1 active:opacity-90"
      >
        <Card padded={false} className="overflow-hidden">
          <View className="p-4 gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-raised">
              <Ionicons name="people" size={18} color={colors.ink} />
            </View>
            <View>
              <T size={15} weight="700">
                New community
              </T>
              <T size={12} muted>
                Route buddies & chat
              </T>
            </View>
            <T size={12} weight="700" tone="muted">
              Build a crew →
            </T>
          </View>
        </Card>
      </Pressable>
    </View>
  );
}
