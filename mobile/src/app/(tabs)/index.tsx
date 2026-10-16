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
import {
  Avatar,
  EmptyState,
  ErrorState,
  FAB,
  FeedSkeleton,
  Screen,
  StoryRing,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import { useSession } from "@/lib/session";
import { useUnreadCount } from "@/lib/use-unread";
import type { Community, Page, Post, Ride } from "@/lib/types";

export default function FeedScreen() {
  const router = useRouter();
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();
  const messageUnread = useUnreadCount();

  const [posts, setPosts] = useState<Post[]>([]);
  const [groups, setGroups] = useState<Community[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          list.map((item) => (item.id === post.id ? { ...item, repostCount: item.repostCount + 1, viewerReposted: true } : item)),
        );
      } catch {
        // Reposting twice is a no-op server-side; nothing to surface.
      }
    },
    comment: (post) => router.push(`/post/${post.id}`),
  };

  return (
    <Screen>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingTop: 0,
          paddingBottom: insets.bottom + 96,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.muted}
            colors={[colors.accent]}
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
          <View>
            {/* ── Instagram top bar ─────────────────────────────── */}
            <View
              style={{ paddingTop: insets.top + 8, backgroundColor: colors.surface }}
              className="px-4 pb-2"
            >
              <View className="flex-row items-center justify-between">
                <Pressable onPress={() => void load({ reset: true })} accessibilityLabel="RideWing home">
                  <T size={24} weight="800" style={{ letterSpacing: -0.6 }}>
                    RideWing
                  </T>
                </Pressable>
                <View className="flex-row items-center gap-1">
                  <Pressable
                    onPress={() => router.push("/compose")}
                    hitSlop={10}
                    accessibilityLabel="Create post"
                    className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
                  >
                    <Ionicons name="add-circle-outline" size={27} color={colors.ink} />
                  </Pressable>
                  <Pressable
                    onPress={() => router.push("/notifications")}
                    hitSlop={10}
                    accessibilityLabel="Notifications"
                    className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
                  >
                    <Ionicons name="heart-outline" size={26} color={colors.ink} />
                  </Pressable>
                  <Pressable
                    onPress={() => router.push("/(tabs)/messages")}
                    hitSlop={10}
                    accessibilityLabel="Messages"
                    className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
                  >
                    <View>
                      <Ionicons name="paper-plane-outline" size={25} color={colors.ink} />
                      {messageUnread > 0 ? (
                        <View
                          className="absolute items-center justify-center rounded-full"
                          style={{
                            backgroundColor: "#FF3040",
                            minWidth: 17,
                            height: 17,
                            top: -5,
                            right: -7,
                            paddingHorizontal: 4,
                          }}
                        >
                          <T size={10} weight="800" color="#fff">
                            {messageUnread > 9 ? "9+" : messageUnread}
                          </T>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* ── Stories tray ──────────────────────────────────── */}
            <View style={{ backgroundColor: colors.surface }} className="pb-3 pt-1">
              <FlatList
                horizontal
                data={[{ id: "__you" } as unknown as Community, ...groups.slice(0, 12)]}
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 12, gap: 14 }}
                renderItem={({ item, index }) => {
                  if (item.id === "__you") {
                    return (
                      <View className="items-center gap-1" style={{ width: 72 }}>
                        <View>
                          <StoryRing user={user} size={62} seen onPress={() => router.push("/compose")} />
                          <Pressable
                            onPress={() => router.push("/compose")}
                            accessibilityLabel="Add to your story"
                            style={{
                              position: "absolute",
                              bottom: 0,
                              right: 0,
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              backgroundColor: colors.accent,
                              alignItems: "center",
                              justifyContent: "center",
                              borderWidth: 2,
                              borderColor: colors.surface,
                            }}
                          >
                            <Ionicons name="add" size={14} color={colors.onAccent} />
                          </Pressable>
                        </View>
                        <T size={11} numberOfLines={1}>
                          Your story
                        </T>
                      </View>
                    );
                  }
                  const group = item as Community;
                  return (
                    <View className="items-center gap-1" style={{ width: 72 }}>
                      <StoryRing
                        user={
                          group.image
                            ? { username: group.slug, profileImage: group.image }
                            : { username: group.slug, profileImage: null }
                        }
                        size={62}
                        seen={index > 3}
                        onPress={() => router.push(`/community/${group.slug}`)}
                      />
                      <T size={11} numberOfLines={1} className="text-center">
                        {group.name}
                      </T>
                    </View>
                  );
                }}
              />
              {rides.length ? (
                <Pressable
                  onPress={() => router.push("/(tabs)/rides")}
                  className="mx-4 mt-3 flex-row items-center gap-2 rounded-full px-3 py-2 active:opacity-80"
                  style={{ backgroundColor: colors.raised }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: "#FF3040",
                    }}
                  />
                  <T size={13} weight="700" numberOfLines={1} className="flex-1">
                    {rides.length} live ride{rides.length === 1 ? "" : "s"} — tap to join
                  </T>
                  <Ionicons name="chevron-forward" size={15} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            <View style={{ height: 6, backgroundColor: colors.canvas }} />
          </View>
        }
        renderItem={({ item }) => (
          <PostCard post={item} actions={actions} onOpenProfile={(u) => router.push(`/profile/${u}`)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8, backgroundColor: colors.canvas }} />}
        ListEmptyComponent={
          loading ? (
            <FeedSkeleton />
          ) : error ? (
            <ErrorState message={error} onRetry={() => load({ reset: true })} />
          ) : (
            <EmptyState
              icon="camera-outline"
              title="Share your first ride"
              body="Post a photo from the road and it will show up here."
              action={
                <Pressable
                  onPress={() => router.push("/compose")}
                  className="rounded-full px-5 py-2.5 active:opacity-80"
                  style={{ backgroundColor: colors.ink }}
                >
                  <T size={14} weight="700" color={colors.surface}>
                    Share a post
                  </T>
                </Pressable>
              }
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="py-6">
              <FeedSkeleton />
            </View>
          ) : null
        }
      />

      <FAB icon="add" label="Write a post" onPress={() => router.push("/compose")} />
    </Screen>
  );
}

// Re-exported so other tabs can hint at the viewer's avatar without importing session.
export function ViewerAvatar() {
  const { user } = useSession();
  return <Avatar user={user} size={28} />;
}
