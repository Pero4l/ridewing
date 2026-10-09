/* eslint-disable react-hooks/set-state-in-effect --
 * These screens load data on mount. The effect only *starts* an async fetch;
 * the state updates it triggers all land after an `await`, so there is no
 * synchronous setState during render. The rule cannot see across the async
 * boundary and flags the fetch helper instead.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, View } from "react-native";

import { PostCard, type PostActions } from "@/components/post-card";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Row,
  Screen,
  SectionTitle,
  Spinner,
  Stat,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
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

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFollow() {
    if (!profile) return;
    setBusy(true);
    try {
      if (following) {
        await api.delete(`/api/users/${profile.username}/follow`);
      } else {
        await api.post(`/api/users/${profile.username}/follow`);
      }
      setFollowing(!following);
      setProfile((p) => (p ? { ...p, followerCount: p.followerCount + (following ? -1 : 1) } : p));
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
      // `getOrCreateDirect` returns the existing thread if there already is one,
      // so this is safe to call every time rather than searching the list first.
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
              ? {
                  ...item,
                  viewerLiked: res.liked,
                  likeCount: Math.max(0, item.likeCount + (res.liked ? 1 : -1)),
                }
              : item,
          ),
        );
      } catch {
        // Server truth returns on refresh.
      }
    },
    repost: async () => {},
    comment: (post) => router.push(`/post/${post.id}`),
  };

  if (loading) {
    return (
      <Screen>
        <Spinner label="Loading rider" />
      </Screen>
    );
  }

  if (error && !profile) {
    return (
      <Screen>
        <ErrorState message={error} onRetry={() => void load()} />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen>
        <EmptyState icon="person-outline" title="Rider not found" />
      </Screen>
    );
  }

  const bike = bikeLabel(profile.bikeInfo ?? {});

  return (
    <Screen>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="mb-1 gap-4">
            {/* Identity, centred — the same shape as the rider's own
                profile tab, so a public page reads as a profile, not a
                wall of text. */}
            <View className="items-center gap-3 px-4 pt-2">
              <View className="rounded-full bg-accentSoft p-1.5">
                <Avatar
                  user={{ username: profile.username, profileImage: profile.profileImage }}
                  size={76}
                />
              </View>
              <View className="items-center gap-0.5">
                <T size={22} weight="800" className="tracking-tight">
                  {profile.displayName}
                </T>
                <T size={13} muted>
                  @{profile.username}
                </T>
              </View>
              {profile.bio ? (
                <T size={14} className="text-center">
                  {profile.bio}
                </T>
              ) : null}
              {bike ? <T size={13} muted>{bike}</T> : null}
            </View>

            <View className="px-4">
              <Card padded={false} className="flex-row justify-around py-4">
                <Stat value={profile.postCount} label="Posts" />
                <Stat value={profile.followerCount} label="Followers" />
                <Stat value={profile.followingCount} label="Following" />
              </Card>
            </View>

            {!profile.isSelf && user ? (
              <Row gap={10} className="px-4">
                <Button
                  label={following ? "Following" : "Follow"}
                  variant={following ? "secondary" : "primary"}
                  className="flex-1"
                  loading={busy}
                  onPress={toggleFollow}
                />
                {/* There was previously no way to message anyone from the app:
                    /api/conversations/direct was never called. */}
                <Button
                  label="Message"
                  icon="chatbubble-outline"
                  variant="secondary"
                  className="flex-1"
                  loading={messaging}
                  onPress={messageRider}
                />
              </Row>
            ) : null}

            <SectionTitle>Posts</SectionTitle>
          </View>
        }
        renderItem={({ item }) => (
            <View className="px-4">
              <PostCard post={item} actions={actions} />
            </View>
          )}
        ListEmptyComponent={
          <EmptyState icon="newspaper-outline" title="No posts yet" />
        }
      />
    </Screen>
  );
}