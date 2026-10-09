/* eslint-disable react-hooks/set-state-in-effect --
 * These screens load data on mount. The effect only *starts* an async fetch;
 * the state updates it triggers all land after an `await`, so there is no
 * synchronous setState during render. The rule cannot see across the async
 * boundary and flags the fetch helper instead.
 */
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RideRow } from "@/components/ride-row";
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  Screen,
  ScreenHeader,
  SectionTitle,
  Spinner,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { Ride } from "@/lib/types";

/**
 * Rides.
 *
 * Running rides are one card with dividers rather than a stack of cards,
 * so the roster reads as a list the way it does on the web app. The two
 * actions up top are the two ways in: open a new room, or enter a code
 * someone shared. The list is short by nature — rides live for an
 * outing — so a scroll view carries it instead of a virtualised list.
 */
export default function RidesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // `/api/rides` returns a bare `{ rides }` — it is not a paginated page.
      // Reading `page.items` here made the list render nothing.
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

  const active = rides.filter((ride) => ride.status === "active");

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
        contentContainerStyle={{
          paddingBottom: insets.bottom + 96,
          gap: 12,
        }}
      >
        <ScreenHeader
          title="Rides"
          subtitle="Group voice for the road"
          right={
            <IconButton
              icon="add"
              label="Start a ride"
              onPress={() => router.push("/ride/new")}
            />
          }
        />

        <View className="flex-row gap-3 px-4">
          <Button
            label="Start a ride"
            icon="navigate"
            className="flex-1"
            onPress={() => router.push("/ride/new")}
          />
          <Button
            label="Join with code"
            icon="key"
            variant="secondary"
            className="flex-1"
            onPress={() => router.push("/ride/join")}
          />
        </View>

        {loading ? (
          <Spinner label="Finding rides" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : active.length ? (
          <View className="gap-1.5">
            <SectionTitle>Active now</SectionTitle>
            <View className="mx-4">
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
                onPress={() => router.push("/ride/new")}
              />
            }
          />
        )}
      </ScrollView>
    </Screen>
  );
}
