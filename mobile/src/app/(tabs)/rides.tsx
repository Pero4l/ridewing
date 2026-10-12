/* eslint-disable react-hooks/set-state-in-effect --
 * These screens load data on mount. The effect only *starts* an async fetch;
 * the state updates it triggers all land after an `await`, so there is no
 * synchronous setState during render. The rule cannot see across the async
 * boundary and flags the fetch helper instead.
 */
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RideRow } from "@/components/ride-row";
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Screen,
  Spinner,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import type { Ride } from "@/lib/types";

/**
 * Rides tab.
 *
 * Running rides are presented inside a single card with dividers so the roster
 * reads as one cohesive list rather than a stack of detached cards. Two CTAs sit
 * below the header so the two entry points — start and join — are always in reach
 * regardless of scroll position.
 *
 * The list is intentionally short by nature (rides live for an outing, not days),
 * so a ScrollView carries it instead of a virtualised FlatList.
 */
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

  return (
    <Screen>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 96 },
        ]}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerText}>
            <T size={28} weight="800" style={styles.title}>
              Rides
            </T>
            <T size={12} muted style={styles.subtitle}>
              Group voice for the road
            </T>
          </View>
          {/* + button mirrors the primary CTA below; it is a shortcut for
              riders who reach the screen in one thumb-tap from the tab bar */}
          <View style={styles.headerAction}>
            <View
              style={[styles.addBtn, { backgroundColor: colors.raised }]}
              accessibilityRole="button"
            >
              <Ionicons
                name="add"
                size={22}
                color={colors.ink}
                onPress={() => router.push("/ride/new")}
              />
            </View>
          </View>
        </View>

        {/* ── CTA row ─────────────────────────────────────────────────────── */}
        <View style={styles.ctaRow}>
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

        {/* ── Rides list ──────────────────────────────────────────────────── */}
        {loading ? (
          <Spinner label="Finding rides…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : active.length > 0 ? (
          <View style={styles.section}>
            {/* Section label */}
            <View style={styles.sectionLabel}>
              <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
              <T
                size={11}
                weight="700"
                muted
                style={styles.sectionLabelText}
              >
                ACTIVE NOW
              </T>
            </View>

            {/* Rides card — one card, rows separated by hairlines */}
            <View style={styles.cardWrap}>
              <Card padded={false} className="overflow-hidden">
                {active.map((ride, index) => (
                  <View key={ride.id}>
                    {index > 0 ? <Divider /> : null}
                    <RideRow ride={ride} />
                  </View>
                ))}
              </Card>
            </View>
          </View>
        ) : (
          <EmptyState
            icon="navigate-outline"
            title="No rides running"
            body="Start one and invite riders you follow. Everyone on the ride can talk over live voice."
            action={
              <Button
                label="Start a ride"
                icon="navigate"
                onPress={() => router.push("/ride/new")}
              />
            }
          />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 4,
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
  headerAction: {
    marginTop: 4,
    flexShrink: 0,
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  sectionLabelText: {
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  cardWrap: {
    paddingHorizontal: 16,
  },
});
