/* eslint-disable react-hooks/set-state-in-effect */
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, Share, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar, Divider, ListRow, Screen, Spinner, T, VerifiedTick } from "@/components/ui";
import { api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import { useSession } from "@/lib/session";
import type { Page, Post } from "@/lib/types";

type Tab = "grid" | "rides" | "saved";

export default function ProfileScreen() {
  const { user, logout } = useSession();
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();
  const { width } = useWindowDimensions();

  const [counts, setCounts] = useState({ posts: 0, followers: 0, following: 0 });
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<Tab>("grid");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [profileRes, postRes] = await Promise.all([
        api.get<{
          user: { followerCount: number; followingCount: number; postCount: number };
        }>(`/api/users/${user.username}`),
        api.get<Page<Post>>(`/api/users/${user.username}/posts?tab=posts&limit=30`),
      ]);
      setCounts({
        posts: profileRes.user.postCount,
        followers: profileRes.user.followerCount,
        following: profileRes.user.followingCount,
      });
      setPosts(postRes.items);
    } catch {
      // counts are supplementary
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) {
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  }

  function confirmSignOut() {
    Alert.alert("Sign out?", "You can sign back in any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void logout() },
    ]);
  }

  async function shareProfile() {
    try {
      await Share.share({ message: `Follow me on RideWing: @${user?.username ?? "rider"}` });
    } catch {
      // dismissed
    }
  }

  const cell = (width - 2) / 3;
  const gridPosts = posts.filter((p) => p.media.length > 0);

  return (
    <Screen>
      <FlatList
        data={tab === "grid" ? gridPosts : []}
        keyExtractor={(item) => item.id}
        numColumns={3}
        columnWrapperStyle={tab === "grid" && gridPosts.length ? { gap: 1.5 } : undefined}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        ListHeaderComponent={
          <View>
            {/* ── Top bar ─────────────────────────────────────── */}
            <View
              style={{ paddingTop: insets.top + 8, backgroundColor: colors.surface }}
              className="flex-row items-center justify-between px-4 pb-2"
            >
              <View className="flex-row items-center gap-1.5">
                <T size={20} weight="800" style={{ letterSpacing: -0.4 }}>
                  {user.username}
                </T>
                {user.emailVerifiedAt ? <VerifiedTick size={15} /> : null}
              </View>
              <View className="flex-row items-center">
                <Pressable
                  onPress={() => router.push("/compose")}
                  hitSlop={10}
                  accessibilityLabel="Create"
                  className="h-10 w-10 items-center justify-center active:opacity-60"
                >
                  <Ionicons name="add-circle-outline" size={26} color={colors.ink} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      "More",
                      "",
                      [
                        { text: "Settings", onPress: () => router.push("/settings") },
                        { text: "Sign out", style: "destructive", onPress: confirmSignOut },
                        { text: "Cancel", style: "cancel" },
                      ],
                    );
                  }}
                  hitSlop={10}
                  accessibilityLabel="More options"
                  className="h-10 w-10 items-center justify-center active:opacity-60"
                >
                  <Ionicons name="menu-outline" size={26} color={colors.ink} />
                </Pressable>
              </View>
            </View>

            {/* ── Identity ────────────────────────────────────── */}
            <View style={{ backgroundColor: colors.surface }} className="px-4 pb-3">
              <View className="flex-row items-center gap-5">
                <Avatar user={user} size={82} />
                <View className="flex-1 flex-row items-center justify-around">
                  <Stat value={counts.posts} label="Posts" />
                  <Stat value={counts.followers} label="Followers" />
                  <Stat value={counts.following} label="Following" />
                </View>
              </View>

              <View className="mt-2.5">
                <T size={14} weight="700">
                  {user.displayName}
                </T>
                {user.role === "admin" ? (
                  <T size={12} tone="muted">
                    RideWing crew
                  </T>
                ) : null}
                {user.bio ? (
                  <T size={14} style={{ marginTop: 2, lineHeight: 19 }}>
                    {user.bio}
                  </T>
                ) : null}
              </View>

              {/* IG buttons */}
              <View className="mt-3 flex-row gap-2">
                <Pressable
                  onPress={() => router.push(`/profile/${user.username}`)}
                  accessibilityRole="button"
                  className="flex-1 items-center rounded-lg py-2 active:opacity-70"
                  style={{ backgroundColor: colors.raised }}
                >
                  <T size={14} weight="700">
                    Edit profile
                  </T>
                </Pressable>
                <Pressable
                  onPress={shareProfile}
                  accessibilityRole="button"
                  className="flex-1 items-center rounded-lg py-2 active:opacity-70"
                  style={{ backgroundColor: colors.raised }}
                >
                  <T size={14} weight="700">
                    Share profile
                  </T>
                </Pressable>
                <Pressable
                  onPress={() => router.push("/settings")}
                  accessibilityLabel="More"
                  className="items-center justify-center rounded-lg px-3 active:opacity-70"
                  style={{ backgroundColor: colors.raised }}
                >
                  <Ionicons name="person-add-outline" size={18} color={colors.ink} />
                </Pressable>
              </View>
            </View>

            <Divider />

            {/* ── Content tabs ────────────────────────────────── */}
            <View style={{ backgroundColor: colors.surface }} className="flex-row">
              <TabIcon
                active={tab === "grid"}
                icon={tab === "grid" ? "grid" : "grid-outline"}
                label="Posts"
                onPress={() => setTab("grid")}
              />
              <TabIcon
                active={tab === "rides"}
                icon={tab === "rides" ? "navigate" : "navigate-outline"}
                label="Rides"
                onPress={() => setTab("rides")}
              />
              <TabIcon
                active={tab === "saved"}
                icon={tab === "saved" ? "bookmark" : "bookmark-outline"}
                label="Saved"
                onPress={() => setTab("saved")}
              />
            </View>
            <Divider />

            {tab !== "grid" ? (
              <View className="items-center gap-1 px-8 py-12">
                <View
                  className="mb-2 h-20 w-20 items-center justify-center rounded-full"
                  style={{ borderWidth: 1.5, borderColor: colors.ink }}
                >
                  <Ionicons
                    name={tab === "rides" ? "navigate-outline" : "bookmark-outline"}
                    size={34}
                    color={colors.ink}
                  />
                </View>
                <T size={22} weight="800">
                  {tab === "rides" ? "No rides yet" : "No saved posts"}
                </T>
                <T size={14} tone="muted" className="text-center">
                  {tab === "rides"
                    ? "Rides you join will live here."
                    : "Tap the bookmark on any post to save it here."}
                </T>
                <View style={{ backgroundColor: colors.canvas, marginTop: 12 }} className="w-full gap-1 rounded-2xl p-3">
                  <ListRow
                    title="Settings"
                    icon="settings-outline"
                    onPress={() => router.push("/settings")}
                  />
            <ListRow
              title="Communities"
              icon="people-outline"
              onPress={() => router.push("/(tabs)/communities")}
            />
                  <Pressable
                    onPress={confirmSignOut}
                    accessibilityRole="button"
                    className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-60"
                  >
                    <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                    <T size={15} weight="600" tone="danger">
                      Sign out
                    </T>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
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
          tab === "grid" ? (
            <View className="items-center gap-1 px-8 py-12">
              <View
                className="mb-2 h-20 w-20 items-center justify-center rounded-full"
                style={{ borderWidth: 1.5, borderColor: colors.ink }}
              >
                <Ionicons name="camera-outline" size={34} color={colors.ink} />
              </View>
              <T size={22} weight="800">
                Share Photos
              </T>
              <T size={14} tone="muted" className="text-center">
                When you post ride photos, they will appear on your profile.
              </T>
              <Pressable
                onPress={() => router.push("/compose")}
                className="mt-3 rounded-lg px-5 py-2 active:opacity-80"
                style={{ backgroundColor: colors.accent }}
              >
                <T size={14} weight="700" color={colors.onAccent}>
                  Share your first photo
                </T>
              </Pressable>
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Pressable accessibilityRole="button" className="items-center gap-0.5 px-1 active:opacity-60">
      <T size={18} weight="800">
        {String(value)}
      </T>
      <T size={12} tone="muted">
        {label}
      </T>
    </Pressable>
  );
}

function TabIcon({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      className="flex-1 items-center py-2.5 active:opacity-60"
      style={active ? { borderBottomWidth: 1.5, borderBottomColor: colors.ink } : undefined}
    >
      <Ionicons name={icon} size={24} color={active ? colors.ink : colors.muted} accessibilityLabel={label} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  multiBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    textShadowColor: "rgba(0,0,0,0.5)",
  },
});
