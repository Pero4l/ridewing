/* eslint-disable react-hooks/set-state-in-effect --
 * These screens load data on mount. The effect only *starts* an async fetch;
 * the state updates it triggers all land after an `await`, so there is no
 * synchronous setState during render. The rule cannot see across the async
 * boundary and flags the fetch helper instead.
 */
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  ListRow,
  Screen,
  Spinner,
  Stat,
  T,
} from "@/components/ui";
import { api } from "@/lib/api";
import { bikeLabel } from "@/lib/format";
import { useSession } from "@/lib/session";

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useSession();
  const insets = useSafeAreaInsets();

  const [counts, setCounts] = useState({
    posts: 0,
    followers: 0,
    following: 0,
  });

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get<{
        user: {
          followerCount: number;
          followingCount: number;
          postCount: number;
        };
      }>(`/api/users/${user.username}`);
      setCounts({
        posts: res.user.postCount,
        followers: res.user.followerCount,
        following: res.user.followingCount,
      });
    } catch {
      // The profile header still renders; only the counts are missing.
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
        contentContainerStyle={{
          paddingBottom: insets.bottom + 96,
          gap: 14,
        }}
      >
        {/* Profile identity, centred under the safe area. */}
        <View className="items-center gap-3 px-4 pt-6">
          <View className="rounded-full bg-accentSoft p-1.5">
            <Avatar user={user} size={76} />
          </View>
          <View className="items-center gap-0.5">
            <T size={22} weight="800" className="tracking-tight">
              {user.displayName}
            </T>
            <T size={13} muted>
              @{user.username}
            </T>
            {user.emailVerifiedAt ? (
              <View className="mt-1.5">
                <Badge label="VERIFIED" tone="success" />
              </View>
            ) : null}
          </View>
          {user.bio ? (
            <T size={14} className="text-center">
              {user.bio}
            </T>
          ) : null}
          {bike ? <T size={13} muted>{bike}</T> : null}
        </View>

        <View className="px-4">
          <Card padded={false} className="flex-row justify-around py-4">
            <Stat value={counts.posts} label="Posts" />
            <Stat value={counts.followers} label="Followers" />
            <Stat value={counts.following} label="Following" />
          </Card>
        </View>

        <View className="px-4">
          <Button
            label="View public profile"
            variant="secondary"
            icon="open-outline"
            fullWidth
            onPress={() => router.push(`/profile/${user.username}`)}
          />
        </View>

        {/* Shortcuts */}
        <View className="gap-1.5 px-4">
          <Card padded={false} className="overflow-hidden">
            <ListRow
              title="Notifications"
              icon="notifications-outline"
              onPress={() => router.push("/notifications")}
            />
            <Divider />
            <ListRow
              title="Settings"
              icon="settings-outline"
              onPress={() => router.push("/settings")}
            />
            <Divider />
            <ListRow
              title="Support"
              icon="help-circle-outline"
              onPress={() => router.push("/support")}
            />
            <Divider />
            <ListRow
              title="Groups"
              icon="people-outline"
              onPress={() => router.push("/(tabs)/communities")}
            />
          </Card>
        </View>

        {user.role === "admin" ? (
          <View className="px-4">
            <Card className="gap-2.5">
              <View className="flex-row items-center justify-between">
                <T size={15} weight="700" className="flex-1">
                  Admin
                </T>
                <Badge label={user.role} tone="accent" />
              </View>
              <T size={12} muted>
                The moderation console is on the web app.
              </T>
            </Card>
          </View>
        ) : null}

        <View className="gap-2 px-4">
          <Button label="Refresh profile" variant="ghost" onPress={() => void refreshUser()} />
          <Button label="Sign out" variant="secondary" onPress={confirmSignOut} />
        </View>
      </ScrollView>
    </Screen>
  );
}
