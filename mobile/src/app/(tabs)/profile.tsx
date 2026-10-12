/* eslint-disable react-hooks/set-state-in-effect */
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Avatar,
  Badge,
  Button,
  Divider,
  ListRow,
  Screen,
  Spinner,
  T,
} from "@/components/ui";
import { api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import { bikeLabel } from "@/lib/format";
import { useSession } from "@/lib/session";

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useSession();
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();

  const [counts, setCounts] = useState({ posts: 0, followers: 0, following: 0 });

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get<{
        user: { followerCount: number; followingCount: number; postCount: number };
      }>(`/api/users/${user.username}`);
      setCounts({
        posts: res.user.postCount,
        followers: res.user.followerCount,
        following: res.user.followingCount,
      });
    } catch { /* counts are supplementary */ }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  if (!user) {
    return <Screen><Spinner /></Screen>;
  }

  const bike = bikeLabel(user.bikeInfo ?? {});

  function confirmSignOut() {
    Alert.alert("Sign out?", "You can sign back in any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void logout() },
    ]);
  }

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
      >
        {/* ── Top safe-area band ──────────────────────────────────── */}
        <View style={{ height: insets.top + 8, backgroundColor: colors.surface }} />

        {/* ── Identity card ───────────────────────────────────────── */}
        <View style={[styles.identityCard, { backgroundColor: colors.surface }]}>
          {/* Header row: avatar + stats */}
          <View style={styles.identityTop}>
            {/* Avatar with accent ring */}
            <View style={[styles.avatarRing, { borderColor: colors.accent }]}>
              <Avatar user={user} size={80} />
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <StatPill value={counts.posts} label="Posts" />
              <StatPill value={counts.followers} label="Followers" />
              <StatPill value={counts.following} label="Following" />
            </View>
          </View>

          {/* Name / username / bio */}
          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <T size={18} weight="800" style={{ letterSpacing: -0.3 }}>
                {user.displayName}
              </T>
              {user.emailVerifiedAt ? (
                <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
              ) : null}
            </View>
            <T size={13} tone="muted">@{user.username}</T>
            {user.bio ? <T size={14} style={{ marginTop: 5, lineHeight: 20 }}>{user.bio}</T> : null}
            {bike ? (
              <View style={styles.bikeRow}>
                <Ionicons name="bicycle-outline" size={14} color={colors.muted} />
                <T size={13} tone="muted">{bike}</T>
              </View>
            ) : null}
            {user.role === "admin" ? (
              <View style={{ marginTop: 6 }}>
                <Badge label="ADMIN" tone="accent" />
              </View>
            ) : null}
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <Button
              label="Edit profile"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => router.push(`/profile/${user.username}`)}
            />
            <Button
              label="Share profile"
              variant="secondary"
              icon="share-outline"
              style={{ flex: 1 }}
              onPress={() => router.push(`/profile/${user.username}`)}
            />
          </View>
        </View>

        <Divider />

        {/* ── Settings list ───────────────────────────────────────── */}
        <View style={{ backgroundColor: colors.canvas, paddingTop: 8, gap: 2 }}>
          {/* Section: Activity */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <ListRow
              title="Notifications"
              icon="notifications-outline"
              iconTone="accent"
              onPress={() => router.push("/notifications")}
            />
            <Divider className="mx-4" />
            <ListRow
              title="Groups"
              icon="people-outline"
              onPress={() => router.push("/(tabs)/communities")}
            />
          </View>

          {/* Section: Account */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <ListRow
              title="Settings"
              icon="settings-outline"
              onPress={() => router.push("/settings")}
            />
            <Divider className="mx-4" />
            <ListRow
              title="Support"
              icon="help-circle-outline"
              onPress={() => router.push("/support")}
            />
          </View>

          {/* Section: Sign out */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Pressable
              onPress={confirmSignOut}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.signOutRow,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.danger} />
              <T size={15} weight="600" tone="danger">Sign out</T>
            </Pressable>
          </View>
        </View>
      </ScrollView>
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
  identityCard: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  identityTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginTop: 8,
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
  },
  section: {
    borderRadius: 0,
    overflow: "hidden",
  },
  signOutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
