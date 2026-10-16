/* eslint-disable react-hooks/set-state-in-effect --
 * These screens load data on mount. The effect only *starts* an async fetch;
 * the state updates it triggers all land after an `await`, so there is no
 * synchronous setState during render. The rule cannot see across the async
 * boundary and flags the fetch helper instead.
 */
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Avatar,
  Button,
  Card,
  Divider,
  ErrorState,
  Screen,
  Skeleton,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import { relativeTime } from "@/lib/format";
import type { Ride } from "@/lib/types";

export default function RidesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();

  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // `/api/rides` returns a bare `{ rides }` — not a paginated page object.
      const res = await api.get<{ rides: Ride[] }>("/api/rides");
      setRides(res.rides);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load rides.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = rides.filter((r) => r.status === "active");
  const ended = rides.filter((r) => r.status !== "active").slice(0, 5);

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.muted}
            colors={[colors.accent]}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.surface }]}>
          <View style={styles.headerText}>
            <T size={28} weight="800" style={styles.title}>
              Rides
            </T>
            <T size={12} muted style={styles.subtitle}>
              {active.length > 0
                ? `${active.length} live now — jump in`
                : "Group voice for the road"}
            </T>
          </View>
          <Pressable
            onPress={() => router.push("/ride/new")}
            accessibilityRole="button"
            accessibilityLabel="Start a ride"
            hitSlop={8}
            style={[styles.addBtn, { backgroundColor: colors.raised }]}
            className="active:opacity-60"
          >
            <Ionicons name="add" size={22} color={colors.ink} />
          </Pressable>
        </View>

        {/* ── CTAs ───────────────────────────────────────────────── */}
        <View style={[styles.ctaRow, { backgroundColor: colors.surface }]}>
          <Button
            label="Start a ride"
            icon="navigate"
            className="flex-1"
            onPress={() => router.push("/ride/new")}
          />
          <Button
            label="Join with code"
            icon="key-outline"
            variant="secondary"
            className="flex-1"
            onPress={() => router.push("/ride/join")}
          />
        </View>
        <View style={[styles.ctaDivider, { backgroundColor: colors.surface }]}>
          <Divider />
        </View>

        {/* ── Body ───────────────────────────────────────────────── */}
        {loading ? (
          <RideSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : (
          <View style={styles.body}>
            {/* Live */}
            <View style={styles.section}>
              <View style={styles.sectionLabel}>
                <View style={[styles.liveDot, { backgroundColor: "#FF3040" }]} />
                <T size={11} weight="700" muted style={styles.sectionLabelText}>
                  {active.length > 0 ? `LIVE NOW · ${active.length}` : "LIVE NOW"}
                </T>
              </View>
              {active.length > 0 ? (
                <View style={styles.cards}>
                  {active.map((ride) => (
                    <LiveRideCard key={ride.id} ride={ride} />
                  ))}
                </View>
              ) : (
                <Card className="items-center gap-1.5 py-8">
                  <View
                    className="mb-1 h-14 w-14 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: colors.raised }}
                  >
                    <Ionicons name="navigate-outline" size={26} color={colors.muted} />
                  </View>
                  <T size={15} weight="700">No rides running</T>
                  <T size={13} tone="muted" className="text-center">
                    Start one and riders you follow can join the voice room.
                  </T>
                  <View className="mt-2">
                    <Button label="Start a ride" size="sm" icon="navigate" onPress={() => router.push("/ride/new")} />
                  </View>
                </Card>
              )}
            </View>

            {/* Recently ended */}
            {ended.length > 0 ? (
              <View style={styles.section}>
                <T size={11} weight="700" muted style={styles.sectionLabelTextPadded}>
                  RECENTLY ENDED
                </T>
                <Card padded={false} className="overflow-hidden">
                  {ended.map((ride, index) => (
                    <View key={ride.id}>
                      {index > 0 ? <Divider /> : null}
                      <Pressable
                        onPress={() => router.push(`/ride/${ride.id}`)}
                        accessibilityRole="button"
                        accessibilityLabel={`View ride ${ride.name}`}
                        className="flex-row items-center px-4 py-3 active:opacity-70"
                        style={{ gap: 12, opacity: 0.75 }}
                      >
                        <View
                          className="h-10 w-10 items-center justify-center rounded-xl"
                          style={{ backgroundColor: colors.raised }}
                        >
                          <Ionicons name="flag-outline" size={18} color={colors.muted} />
                        </View>
                        <View className="min-w-0 flex-1">
                          <T size={15} weight="600" numberOfLines={1}>
                            {ride.name}
                          </T>
                          <T size={12} muted numberOfLines={1}>
                            {`Ended ${relativeTime(ride.endedAt ?? ride.createdAt)}`}
                          </T>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.faint} />
                      </Pressable>
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}

            {/* How it works */}
            <Card className="gap-2">
              <View className="flex-row items-center gap-2">
                <Ionicons name="information-circle-outline" size={17} color={colors.muted} />
                <T size={13} weight="700">How rides work</T>
              </View>
              <T size={13} tone="muted" style={{ lineHeight: 19 }}>
                Rides are live voice rooms for a route. Start one to open the room, share the invite code, and ride together — or join a code a rider shared with you.
              </T>
            </Card>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

// ── Live ride card ───────────────────────────────────────────────────────────

function LiveRideCard({ ride }: { ride: Ride }) {
  const router = useRouter();
  const { colors } = usePalette();
  const roster = (ride.participants ?? []).filter((p) => p.status === "joined").slice(0, 5);
  const total = (ride.participants ?? []).filter((p) => p.status === "joined").length;

  return (
    <Pressable
      onPress={() => router.push(`/ride/${ride.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Join ride ${ride.name}`}
      className="active:opacity-90"
    >
      <Card padded={false} className="overflow-hidden">
        {/* Live banner — fixed near-black in both themes so the white
            LIVE pill and mic label stay legible in light and dark mode. */}
        <View style={styles.liveBanner}>
          <View style={styles.livePill}>
            <View style={styles.livePulse} />
            <T size={10} weight="800" color="#fff" style={{ letterSpacing: 0.8 }}>
              LIVE
            </T>
          </View>
          <T size={11} weight="600" color="rgba(255,255,255,0.75)">
            {ride.voiceMode === "open" ? "Open mic" : "Push to talk"}
          </T>
        </View>

        <View className="gap-2.5 p-4">
          <View>
            <T size={17} weight="800" numberOfLines={1} style={{ letterSpacing: -0.3 }}>
              {ride.name}
            </T>
            <T size={13} muted numberOfLines={1} style={{ marginTop: 2 }}>
              {`by ${ride.creator?.displayName ?? ride.creator?.username ?? "a rider"} · started ${relativeTime(ride.createdAt)}`}
            </T>
          </View>

          <View className="flex-row items-center justify-between">
            {/* Avatar stack */}
            <View className="flex-row items-center">
              {roster.length > 0 ? (
                <View style={styles.stack}>
                  {roster.map((p, i) => (
                    <View key={p.userId} style={[styles.stackAvatar, { marginLeft: i === 0 ? 0 : -10, zIndex: roster.length - i, borderColor: colors.surface }]}>
                      <Avatar user={p.user} size={30} />
                    </View>
                  ))}
                </View>
              ) : null}
              <T size={12} muted style={{ marginLeft: roster.length ? 8 : 0 }}>
                {total > 0 ? `${total} riding` : "Be the first to join"}
              </T>
            </View>
            <View style={[styles.joinPill, { backgroundColor: colors.accent }]}>
              <T size={13} weight="700" color={colors.onAccent}>
                Join
              </T>
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function RideSkeleton() {
  const { colors } = usePalette();
  return (
    <View className="gap-3 px-4 pt-4">
      {[0, 1].map((k) => (
        <View
          key={k}
          className="gap-3 rounded-2xl border p-4"
          style={{ borderColor: colors.hairline, backgroundColor: colors.surface }}
        >
          <View className="flex-row items-center justify-between">
            <Skeleton width={64} height={20} rounded={10} />
            <Skeleton width={80} height={12} rounded={6} />
          </View>
          <Skeleton width="70%" height={20} rounded={8} />
          <Skeleton width="50%" height={12} rounded={6} />
          <View className="flex-row items-center justify-between">
            <View className="flex-row">
              {[0, 1, 2].map((a) => (
                <View key={a} style={{ marginLeft: a === 0 ? 0 : -10 }}>
                  <Skeleton width={30} height={30} rounded={15} />
                </View>
              ))}
            </View>
            <Skeleton width={72} height={36} rounded={18} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 2,
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    flexShrink: 0,
  },
  ctaRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  ctaDivider: {
    paddingBottom: 6,
  },
  body: {
    gap: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionLabelText: {
    letterSpacing: 0.6,
  },
  sectionLabelTextPadded: {
    letterSpacing: 0.6,
  },
  cards: {
    gap: 12,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  liveBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#18181B",
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FF3040",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  livePulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
  },
  stack: {
    flexDirection: "row",
    alignItems: "center",
  },
  stackAvatar: {
    borderRadius: 15,
    borderWidth: 2,
    overflow: "hidden",
  },
  joinPill: {
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
});
