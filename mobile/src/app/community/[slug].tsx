/* eslint-disable react-hooks/set-state-in-effect */
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Avatar,
  Badge,
  Button,
  Divider,
  ErrorState,
  Screen,
  Spinner,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import { relativeTime } from "@/lib/format";
import type { Community } from "@/lib/types";

const COVER_HEIGHT = 160;

export default function CommunityScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();

  const [community, setCommunity] = useState<Community | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ community: Community }>(`/api/communities/${slug}`);
      setCommunity(res.community);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this group.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the group.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Screen><Spinner label="Loading group" /></Screen>;
  if (error && !community) return <Screen><ErrorState message={error} onRetry={() => void load()} /></Screen>;
  if (!community) return <Screen><T className="p-4">Group not found</T></Screen>;

  const role = community.viewerRole;
  const isMember = role !== null && community.viewerStatus === "active";
  const pending = community.viewerJoinRequestStatus === "pending";
  const canModerate = role === "owner" || role === "admin" || role === "moderator";

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* ── Cover image / colour band ──────────────────────────── */}
        <View style={[styles.cover, { backgroundColor: colors.accentSoft }]}>
          {community.image ? (
            <Image
              source={{ uri: community.image }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <Ionicons name="people" size={56} color={colors.accent} style={{ opacity: 0.4 }} />
          )}
          {/* Dark scrim so white text is always legible on photos */}
          {community.image ? <View style={styles.scrim} /> : null}
        </View>

        {/* ── Identity strip ─────────────────────────────────────── */}
        <View style={[styles.identity, { backgroundColor: colors.surface }]}>
          <View style={styles.identityRow}>
            <View style={{ flex: 1, gap: 3 }}>
              <T size={22} weight="800" style={{ letterSpacing: -0.4 }}>{community.name}</T>
              <View style={styles.metaRow}>
                <Ionicons name="people-outline" size={13} color={colors.muted} />
                <T size={13} tone="muted">
                  {community.memberCount} member{community.memberCount !== 1 ? "s" : ""}
                  {community.joinPolicy === "request" ? " · approval required" : ""}
                </T>
              </View>
            </View>
            {role ? <Badge label={role.toUpperCase()} tone="accent" /> : null}
          </View>

          {community.bio ? (
            <T size={14} style={{ lineHeight: 21, color: colors.muted } as never}>
              {community.bio}
            </T>
          ) : null}

          {error ? <T size={13} tone="danger">{error}</T> : null}

          {/* CTA buttons */}
          <View style={styles.ctaRow}>
            {isMember ? (
              <>
                <Button
                  label="Group chat"
                  icon="chatbubbles-outline"
                  style={{ flex: 1 }}
                  onPress={() => router.push("/(tabs)/messages")}
                />
                <Button
                  label="Leave"
                  variant="secondary"
                  style={{ flex: 1 }}
                  loading={busy}
                  onPress={() => act(() => api.post(`/api/communities/${community.slug}/leave`))}
                />
              </>
            ) : pending ? (
              <Button label="Request pending" variant="secondary" disabled onPress={() => {}} style={{ flex: 1 }} />
            ) : (
              <Button
                label={community.joinPolicy === "request" ? "Request to join" : "Join group"}
                icon={community.joinPolicy === "request" ? "hand-right-outline" : "add"}
                style={{ flex: 1 }}
                loading={busy}
                onPress={() => act(() => api.post(`/api/communities/${community.slug}/join`))}
              />
            )}
          </View>
        </View>

        <Divider />

        {/* ── About ──────────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <View style={styles.sectionHeader}>
            <T size={13} weight="700" tone="muted" style={{ letterSpacing: 0.5, textTransform: "uppercase" } as never}>
              About
            </T>
          </View>
          <Divider />

          {community.owner ? (
            <Pressable
              onPress={() => router.push(`/profile/${community.owner!.username}`)}
              style={({ pressed }) => [styles.ownerRow, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Avatar user={community.owner} size={42} />
              <View style={{ flex: 1 }}>
                <T size={15} weight="600">{community.owner.displayName}</T>
                <T size={12} tone="muted">Owner · created {relativeTime(community.createdAt)}</T>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.faint} />
            </Pressable>
          ) : null}
        </View>

        {/* ── Moderation ─────────────────────────────────────────── */}
        {canModerate ? (
          <>
            <Divider />
            <View style={[styles.section, { backgroundColor: colors.surface }]}>
              <View style={styles.sectionHeader}>
                <T size={13} weight="700" tone="muted" style={{ letterSpacing: 0.5, textTransform: "uppercase" } as never}>
                  Moderation
                </T>
              </View>
              <Divider />
              <View style={styles.moderateRow}>
                <T size={13} tone="muted" style={{ marginBottom: 10 }}>
                  You can review join requests and manage members.
                </T>
                <Button
                  label="Review join requests"
                  variant="secondary"
                  icon="person-add-outline"
                  onPress={() => act(() => api.get(`/api/communities/${community.slug}/join-requests`))}
                />
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: {
    height: COVER_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  identity: {
    padding: 16,
    gap: 10,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ctaRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  section: {
    marginTop: 8,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  moderateRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
