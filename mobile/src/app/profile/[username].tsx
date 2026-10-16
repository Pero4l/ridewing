/* eslint-disable react-hooks/set-state-in-effect */
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PostCard, type PostActions } from "@/components/post-card";
import {
  Avatar,
  Divider,
  EmptyState,
  ErrorState,
  Screen,
  Spinner,
  T,
  VerifiedTick,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import { bikeLabel } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Page, Post } from "@/lib/types";

type Profile = {
  username: string;
  displayName: string;
  bio: string | null;
  profileImage: string | null;
  bikeInfo: { make?: string; model?: string; year?: number; nickname?: string };
  followerCount: number;
  followingCount: number;
  postCount: number;
  isSelf: boolean;
  viewerIsFollowing: boolean;
};

export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();
  const { width } = useWindowDimensions();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messaging, setMessaging] = useState(false);

  const load = useCallback(async () => {
    try {
      const [profileRes, postRes] = await Promise.all([
        api.get<{ user: Profile }>(`/api/users/${username}`),
        api.get<Page<Post>>(`/api/users/${username}/posts?tab=posts&limit=30`),
      ]);
      setProfile(profileRes.user);
      setFollowing(profileRes.user.viewerIsFollowing);
      setPosts(postRes.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this rider.");
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => { void load(); }, [load]);

  async function toggleFollow() {
    if (!profile) return;
    setBusy(true);
    try {
      if (following) await api.delete(`/api/users/${profile.username}/follow`);
      else await api.post(`/api/users/${profile.username}/follow`);
      setFollowing(!following);
      setProfile((p) => p ? { ...p, followerCount: p.followerCount + (following ? -1 : 1) } : p);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update follow.");
    } finally {
      setBusy(false);
    }
  }

  async function messageRider() {
    if (!profile) return;
    setMessaging(true);
    try {
      const res = await api.post<{ conversation: { id: string } }>("/api/conversations/direct", {
        username: profile.username,
      });
      router.push(`/thread/${res.conversation.id}`);
    } catch (err) {
      Alert.alert(
        "Could not open the conversation",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      setMessaging(false);
    }
  }

  const actions: PostActions = {
    like: async (post) => {
      try {
        const res = await api.post<{ liked: boolean }>(`/api/posts/${post.id}/like`);
        setPosts((list) =>
          list.map((item) =>
            item.id === post.id
              ? { ...item, viewerLiked: res.liked, likeCount: Math.max(0, item.likeCount + (res.liked ? 1 : -1)) }
              : item,
          ),
        );
      } catch { /* server truth on refresh */ }
    },
    repost: async () => {},
    comment: (post) => router.push(`/post/${post.id}`),
  };

  if (loading) return <Screen><Spinner label="Loading rider" /></Screen>;
  if (error && !profile) return <Screen><ErrorState message={error} onRetry={() => void load()} /></Screen>;
  if (!profile) return <Screen><EmptyState icon="person-outline" title="Rider not found" /></Screen>;

  const bike = bikeLabel(profile.bikeInfo ?? {});
  const cell = (width - 2) / 3;
  const gridPosts = posts.filter((p) => p.media.length > 0);
  const gridData = view === "grid" ? gridPosts : [];

  return (
    <Screen>
      <FlatList
        data={view === "grid" ? gridData : posts}
        keyExtractor={(item) => item.id}
        numColumns={view === "grid" ? 3 : 1}
        key={view}
        columnWrapperStyle={view === "grid" && gridData.length ? { gap: 1.5 } : undefined}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          <View>
            {/* ── Top bar ─────────────────────────────────────── */}
            <View
              style={{ paddingTop: insets.top + 8, backgroundColor: colors.surface }}
              className="flex-row items-center gap-1 px-2 pb-2"
            >
              <Pressable
                onPress={() => router.back()}
                hitSlop={10}
                accessibilityLabel="Back"
                className="h-10 w-10 items-center justify-center active:opacity-60"
              >
                <Ionicons name="chevron-back" size={27} color={colors.ink} />
              </Pressable>
              <View className="flex-1 flex-row items-center justify-center gap-1.5">
                <T size={19} weight="800" numberOfLines={1} style={{ letterSpacing: -0.3 }}>
                  {profile.username}
                </T>
                <VerifiedTick size={14} />
              </View>
              <View className="h-10 w-10" />
            </View>

            {/* ── Identity ────────────────────────────────────── */}
            <View style={{ backgroundColor: colors.surface }} className="px-4 pb-3">
              <View className="flex-row items-center gap-5">
                <Avatar
                  user={{ username: profile.username, profileImage: profile.profileImage }}
                  size={82}
                />
                <View className="flex-1 flex-row items-center justify-around">
                  <Stat value={profile.postCount} label="Posts" />
                  <Stat value={profile.followerCount} label="Followers" />
                  <Stat value={profile.followingCount} label="Following" />
                </View>
              </View>

              <View className="mt-2.5">
                <T size={14} weight="700">
                  {profile.displayName}
                </T>
                {profile.bio ? (
                  <T size={14} style={{ marginTop: 2, lineHeight: 19 }}>
                    {profile.bio}
                  </T>
                ) : null}
                {bike ? (
                  <View className="mt-1 flex-row items-center gap-1">
                    <Ionicons name="bicycle-outline" size={13} color={colors.muted} />
                    <T size={13} tone="muted">
                      {bike}
                    </T>
                  </View>
                ) : null}
              </View>

              {/* Actions */}
              {profile.isSelf ? (
                <View className="mt-3 flex-row gap-2">
                  <Pressable
                    onPress={() => router.push("/(tabs)/profile")}
                    className="flex-1 items-center rounded-lg py-2 active:opacity-70"
                    style={{ backgroundColor: colors.raised }}
                  >
                    <T size={14} weight="700">View my profile</T>
                  </Pressable>
                </View>
              ) : user ? (
                <View className="mt-3 flex-row gap-2">
                  <Pressable
                    onPress={toggleFollow}
                    disabled={busy}
                    accessibilityRole="button"
                    className="flex-1 items-center rounded-lg py-2 active:opacity-70"
                    style={{ backgroundColor: following ? colors.raised : colors.accent, opacity: busy ? 0.6 : 1 }}
                  >
                    <T size={14} weight="700" color={following ? colors.ink : colors.onAccent}>
                      {busy ? "…" : following ? "Following" : "Follow"}
                    </T>
                  </Pressable>
                  <Pressable
                    onPress={messageRider}
                    disabled={messaging}
                    accessibilityRole="button"
                    className="flex-1 items-center rounded-lg py-2 active:opacity-70"
                    style={{ backgroundColor: colors.raised, opacity: messaging ? 0.6 : 1 }}
                  >
                    <T size={14} weight="700">{messaging ? "…" : "Message"}</T>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <Divider />

            {/* ── View toggle ─────────────────────────────────── */}
            <View style={{ backgroundColor: colors.surface }} className="flex-row">
              <Pressable
                onPress={() => setView("grid")}
                accessibilityRole="tab"
                accessibilityState={{ selected: view === "grid" }}
                className="flex-1 items-center py-2.5 active:opacity-60"
                style={view === "grid" ? { borderBottomWidth: 1.5, borderBottomColor: colors.ink } : undefined}
              >
                <Ionicons name={view === "grid" ? "grid" : "grid-outline"} size={24} color={view === "grid" ? colors.ink : colors.muted} />
              </Pressable>
              <Pressable
                onPress={() => setView("list")}
                accessibilityRole="tab"
                accessibilityState={{ selected: view === "list" }}
                className="flex-1 items-center py-2.5 active:opacity-60"
                style={view === "list" ? { borderBottomWidth: 1.5, borderBottomColor: colors.ink } : undefined}
              >
                <Ionicons name={view === "list" ? "list" : "list-outline"} size={24} color={view === "list" ? colors.ink : colors.muted} />
              </Pressable>
            </View>
            <Divider />
          </View>
        }
        renderItem={({ item }) => {
          if (view === "list") {
            return <PostCard post={item} actions={actions} onOpenProfile={(u) => router.push(`/profile/${u}`)} />;
          }
          const first = item.media[0];
          if (!first) return null;
          return (
            <Pressable onPress={() => router.push(`/post/${item.id}`)} accessibilityLabel="Open post">
              {first.type === "video" ? (
                <View style={{ width: cell, height: cell, backgroundColor: "#000" }} className="items-center justify-center">
                  {first.posterUrl ? (
                    <Image
                      source={{ uri: first.posterUrl }}
                      style={{ width: cell, height: cell, position: "absolute" }}
                      contentFit="cover"
                    />
                  ) : null}
                  <Ionicons name="play" size={22} color="#fff" />
                  {item.media.length > 1 ? (
                    <View style={styles.multiBadge}>
                      <Ionicons name="copy-outline" size={14} color="#fff" />
                    </View>
                  ) : null}
                </View>
              ) : (
                <View>
                  <Image
                    source={{ uri: first.posterUrl ?? first.url }}
                    style={{ width: cell, height: cell, backgroundColor: colors.raised }}
                    contentFit="cover"
                    transition={120}
                  />
                  {item.media.length > 1 ? (
                    <View style={styles.multiBadge}>
                      <Ionicons name="copy-outline" size={14} color="#fff" />
                    </View>
                  ) : null}
                </View>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState icon="camera-outline" title="No posts yet" body="This rider hasn't posted any photos yet." />
        }
      />
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View className="items-center gap-0.5 px-1">
      <T size={18} weight="800">{String(value)}</T>
      <T size={12} tone="muted">{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  multiBadge: {
    position: "absolute",
    top: 6,
    right: 6,
  },
});
