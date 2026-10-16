/* eslint-disable react-hooks/set-state-in-effect --
 * This screen loads data on mount. The effect only *starts* an async fetch;
 * the state updates it triggers all land after an `await`.
 */
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  View,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar, EmptyState, ErrorState, Screen, T } from "@/components/ui";
import { FeedVideo } from "@/components/feed-video";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import { relativeTime } from "@/lib/format";
import type { Page, Post, PostMedia } from "@/lib/types";

type Reel = { post: Post; video: PostMedia };

const REEL_VIEWABILITY = { itemVisiblePercentThreshold: 80 };

const { height: SCREEN_H } = Dimensions.get("window");

export default function ReelsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();

  const [reels, setReels] = useState<Reel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [listH, setListH] = useState(SCREEN_H - 120);
  const cursorRef = useRef<string | null | undefined>(undefined);
  const exhaustedRef = useRef(false);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async (opts: { reset?: boolean } = {}) => {
    if (!opts.reset && (loadingMoreRef.current || exhaustedRef.current)) return;
    if (opts.reset) {
      cursorRef.current = undefined;
      exhaustedRef.current = false;
      setLoading(true);
      setError(null);
    } else {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }
    try {
      // The feed endpoint has no video-only filter, so page through and keep
      // posts that carry at least one video (one reel per post).
      const found: Reel[] = [];
      let cursor = cursorRef.current;
      for (let page = 0; page < 4 && found.length < 15; page++) {
        const params = new URLSearchParams({ limit: "30" });
        if (cursor) params.set("cursor", cursor);
        const res = await api.get<Page<Post>>(`/api/posts?${params.toString()}`);
        for (const post of res.items) {
          const video = post.media.find((m) => m.type === "video");
          if (video) found.push({ post, video });
        }
        cursor = res.pageInfo.nextCursor;
        if (!res.pageInfo.hasMore) {
          exhaustedRef.current = true;
          break;
        }
      }
      cursorRef.current = cursor;
      setReels((current) => {
        if (opts.reset) return found;
        const known = new Set(current.map((r) => r.post.id));
        return [...current, ...found.filter((r) => !known.has(r.post.id))];
      });
      setActiveId((current) => current ?? found[0]?.post.id ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load reels.");
    } finally {
      loadingMoreRef.current = false;
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load({ reset: true });
  }, [load]);

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first?.item) setActiveId((first.item as Reel).post.id);
  }, []);

  async function toggleLike(reel: Reel) {
    try {
      const res = await api.post<{ liked: boolean }>(`/api/posts/${reel.post.id}/like`);
      setReels((list) =>
        list.map((r) =>
          r.post.id === reel.post.id
            ? {
                ...r,
                post: {
                  ...r.post,
                  viewerLiked: res.liked,
                  likeCount: Math.max(0, r.post.likeCount + (res.liked ? 1 : -1)),
                },
              }
            : r,
        ),
      );
    } catch {
      // Heart stays as it was; next refresh restores truth.
    }
  }

  return (
    <Screen>
      <View
        style={{ flex: 1, paddingTop: insets.top }}
        onLayout={(e) => setListH(e.nativeEvent.layout.height)}
      >
        {/* Top bar */}
        <View style={[styles.topBar, { top: insets.top }]}>
          <T size={22} weight="800" color="#fff" style={styles.topTitle}>
            Reels
          </T>
          <Pressable
            onPress={() => router.push("/compose")}
            hitSlop={10}
            accessibilityLabel="New reel"
            style={styles.topBtn}
          >
            <Ionicons name="camera-outline" size={24} color="#fff" />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error && reels.length === 0 ? (
          <ErrorState message={error} onRetry={() => load({ reset: true })} />
        ) : reels.length === 0 ? (
          <EmptyState
            icon="film-outline"
            title="No reels yet"
            body="When riders post videos, they will play here full-screen."
            action={undefined}
          />
        ) : (
          <FlatList
            data={reels}
            keyExtractor={(item) => item.post.id}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            decelerationRate="fast"
            getItemLayout={(_, index) => ({ length: listH, offset: listH * index, index })}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={REEL_VIEWABILITY}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor="#fff"
                onRefresh={() => {
                  setRefreshing(true);
                  void load({ reset: true });
                }}
              />
            }
            onEndReached={() => {
              if (!loadingMore && !loading) void load();
            }}
            onEndReachedThreshold={0.6}
            renderItem={({ item }) => (
              <ReelItem
                reel={item}
                height={listH}
                active={activeId === item.post.id}
                muted={muted}
                onToggleMute={() => setMuted((m) => !m)}
                onLike={() => void toggleLike(item)}
                onComment={() => router.push(`/post/${item.post.id}`)}
                onShare={() => {
                  Share.share({
                    message: `RideWing reel by @${item.post.user?.username ?? "rider"}`,
                  }).catch(() => {});
                }}
                onOpenProfile={() =>
                  item.post.user?.username && router.push(`/profile/${item.post.user.username}`)
                }
              />
            )}
            ListFooterComponent={
              loadingMore ? (
                <View style={{ height: 80, alignItems: "center", justifyContent: "center" }}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null
            }
          />
        )}
      </View>
    </Screen>
  );
}

// ── One full-screen reel ─────────────────────────────────────────────────────

function ReelItem({
  reel,
  height,
  active,
  muted,
  onToggleMute,
  onLike,
  onComment,
  onShare,
  onOpenProfile,
}: {
  reel: Reel;
  height: number;
  active: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onOpenProfile: () => void;
}) {
  const { post, video } = reel;
  const lastTap = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);
  const [flash, setFlash] = useState<"play" | "pause" | "heart" | null>(null);
  const [flashOpacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (!active) {
      setPaused(false);
      setFlash(null);
    }
  }, [active]);

  function showFlash(kind: "play" | "pause" | "heart") {
    setFlash(kind);
    flashOpacity.setValue(1);
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 600,
      delay: 150,
      useNativeDriver: true,
    }).start(() => setFlash(null));
  }

  function handleTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      onLike();
      showFlash("heart");
    } else {
      lastTap.current = now;
      timer.current = setTimeout(() => {
        timer.current = null;
        setPaused((p) => {
          showFlash(p ? "play" : "pause");
          return !p;
        });
      }, 300);
    }
  }

  return (
    <View style={{ height, backgroundColor: "#000" }}>
      <Pressable onPress={handleTap} style={StyleSheet.absoluteFill}>
        {video.posterUrl ? (
          <Image
            source={{ uri: video.posterUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : null}
        <FeedVideo
          uri={video.url}
          style={StyleSheet.absoluteFill}
          playing={active && !paused}
          muted={muted}
          contentFit="contain"
        />
      </Pressable>

      {/* Tap flash */}
      {flash ? (
        <Animated.View pointerEvents="none" style={[styles.flash, { opacity: flashOpacity }]}>
          <Ionicons
            name={flash === "heart" ? "heart" : flash === "play" ? "play" : "pause"}
            size={84}
            color="#fff"
          />
        </Animated.View>
      ) : null}

      {/* Right action rail */}
      <View style={styles.rail}>
        <RailBtn
          icon={post.viewerLiked ? "heart" : "heart-outline"}
          color={post.viewerLiked ? "#FF3040" : "#fff"}
          label={post.likeCount > 0 ? compact(post.likeCount) : undefined}
          onPress={() => {
            onLike();
            if (!post.viewerLiked) showFlash("heart");
          }}
        />
        <RailBtn
          icon="chatbubble-outline"
          color="#fff"
          label={post.commentCount > 0 ? compact(post.commentCount) : undefined}
          onPress={onComment}
        />
        <RailBtn icon="paper-plane-outline" color="#fff" onPress={onShare} />
        <RailBtn
          icon={muted ? "volume-mute" : "volume-high"}
          color="#fff"
          onPress={onToggleMute}
        />
      </View>

      {/* Bottom caption */}
      <View style={styles.caption}>
        <Pressable onPress={onOpenProfile} style={styles.authorRow}>
          <Avatar user={post.user} size={32} />
          <T size={14} weight="700" color="#fff" numberOfLines={1} className="flex-1">
            {`@${post.user?.username ?? "rider"}`}
          </T>
          <T size={11} color="rgba(255,255,255,0.7)">
            {relativeTime(post.createdAt)}
          </T>
        </Pressable>
        {post.content ? (
          <T size={13} color="#fff" numberOfLines={2} style={{ lineHeight: 18 }}>
            {post.content}
          </T>
        ) : null}
      </View>
    </View>
  );
}

function RailBtn({
  icon,
  color,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" style={styles.railBtn}>
      <Ionicons name={icon} size={29} color={color} />
      {label ? (
        <T size={11} weight="700" color="#fff" style={{ textAlign: "center" }}>
          {label}
        </T>
      ) : null}
    </Pressable>
  );
}

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

const styles = StyleSheet.create({
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  topTitle: {
    letterSpacing: -0.5,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 20,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  flash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  rail: {
    position: "absolute",
    right: 8,
    bottom: 90,
    alignItems: "center",
    gap: 18,
  },
  railBtn: {
    alignItems: "center",
    gap: 3,
  },
  caption: {
    position: "absolute",
    left: 12,
    right: 76,
    bottom: 24,
    gap: 6,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
