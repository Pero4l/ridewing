/* eslint-disable react-hooks/set-state-in-effect */
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PostCard, type PostActions } from "@/components/post-card";
import {
  Avatar,
  Badge,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Screen,
  Spinner,
  T,
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

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
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

  return (
    <Screen>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          <View>
            {/* ── Profile header card ──────────────────────────── */}
            <View style={[styles.headerCard, { backgroundColor: colors.surface }]}>
              {/* Top row: avatar + stats */}
              <View style={styles.topRow}>
                <View style={[styles.avatarRing, { borderColor: colors.accent }]}>
                  <Avatar
                    user={{ username: profile.username, profileImage: profile.profileImage }}
                    size={80}
                  />
                </View>

                <View style={styles.statsRow}>
                  <StatPill value={profile.postCount} label="Posts" />
                  <StatPill value={profile.followerCount} label="Followers" />
                  <StatPill value={profile.followingCount} label="Following" />
                </View>
              </View>

              {/* Name / username / bio */}
              <View style={styles.nameBlock}>
                <View style={styles.nameRow}>
                  <T size={18} weight="800" style={{ letterSpacing: -0.3 }}>
                    {profile.displayName}
                  </T>
                </View>
                <T size={13} tone="muted">@{profile.username}</T>
                {profile.bio ? (
                  <T size={14} style={{ marginTop: 5, lineHeight: 20 }}>{profile.bio}</T>
                ) : null}
                {bike ? (
                  <View style={styles.bikeRow}>
                    <Ionicons name="bicycle-outline" size={13} color={colors.muted} />
                    <T size={13} tone="muted">{bike}</T>
                  </View>
                ) : null}
              </View>

              {/* Action buttons — only for other riders */}
              {!profile.isSelf && user ? (
                <View style={styles.actionRow}>
                  <Button
                    label={following ? "Following" : "Follow"}
                    variant={following ? "secondary" : "primary"}
                    style={{ flex: 1 }}
                    loading={busy}
                    onPress={toggleFollow}
                  />
                  <Button
                    label="Message"
                    icon="chatbubble-outline"
                    variant="secondary"
                    style={{ flex: 1 }}
                    loading={messaging}
                    onPress={messageRider}
                  />
                </View>
              ) : null}
            </View>

            <Divider />

            {/* Posts label */}
            <View style={[styles.postsLabel, { backgroundColor: colors.surface }]}>
              <Ionicons name="grid-outline" size={16} color={colors.muted} />
              <T size={13} weight="700" tone="muted" style={{ letterSpacing: 0.5, textTransform: "uppercase" } as never}>
                Posts
              </T>
            </View>
            <Divider />
          </View>
        }
        renderItem={({ item }) => (
          <PostCard post={item} actions={actions} onOpenProfile={(u) => router.push(`/profile/${u}`)} />
        )}
        ListEmptyComponent={
          <EmptyState icon="newspaper-outline" title="No posts yet" body="This rider hasn't posted anything yet." />
        }
      />
    </Screen>
  );
}

function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statPill}>
      <T size={20} weight="800">{value}</T>
      <T size={12} tone="muted">{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    padding: 16,
    gap: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginTop: 4,
  },
  avatarRing: {
    borderWidth: 2.5,
    borderRadius: 46,
    padding: 3,
  },
  statsRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statPill: {
    alignItems: "center",
    gap: 1,
  },
  nameBlock: {
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  bikeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  postsLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
});
