/* eslint-disable react-hooks/set-state-in-effect --
 * These screens load data on mount. The effect only *starts* an async fetch;
 * the state updates it triggers all land after an `await`, so there is no
 * synchronous setState during render. The rule cannot see across the async
 * boundary and flags the fetch helper instead.
 */
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Row,
  Screen,
  Spinner,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { Community, Page } from "@/lib/types";

/**
 * The list is a heterogeneous union, so every entry carries a `kind` that
 * `renderItem` switches on. TypeScript narrows on it, which is what removes
 * the "property 'community' does not exist" error and lets each branch read
 * only the fields its variant actually declares.
 */
type ListItem =
  | { kind: "header" }
  | { kind: "error" }
  | { kind: "section"; label: string }
  | { kind: "community"; community: Community }
  | { kind: "empty" };

export default function CommunitiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [mine, setMine] = useState<Community[]>([]);
  const [suggested, setSuggested] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // `/mine` returns a bare `{ communities }` — not a paginated page.
      const [joined, all] = await Promise.all([
        api.get<{ communities: Community[] }>("/api/communities/mine"),
        api.get<Page<Community>>("/api/communities?limit=30"),
      ]);
      setMine(joined.communities);
      setSuggested(
        all.items.filter((c) => !joined.communities.some((j) => j.id === c.id)),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load groups.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const data: ListItem[] = [
    { kind: "header" },
    ...(error && !mine.length && !suggested.length
      ? [{ kind: "error" as const }]
      : []),
    ...(mine.length
      ? [{ kind: "section" as const, label: "YOUR GROUPS" }]
      : []),
    ...mine.map((c) => ({ kind: "community" as const, community: c })),
    ...(suggested.length
      ? [{ kind: "section" as const, label: "FIND YOUR PEOPLE" }]
      : []),
    ...suggested.map((c) => ({ kind: "community" as const, community: c })),
  ];

  const renderCommunity = (community: Community) => (
    <Pressable
      onPress={() => router.push(`/community/${community.slug}`)}
      accessibilityRole="button"
    >
      <Card className="gap-2.5">
        <Row gap={12}>
          {community.image ? (
            <Image
              source={{ uri: community.image }}
              className="h-12 w-12 rounded-2xl bg-raised"
              contentFit="cover"
              transition={120}
            />
          ) : null}
          <View className="flex-1">
            <T size={16} weight="700" numberOfLines={1}>
              {community.name}
            </T>
            <T size={12} muted>
              {community.memberCount} members
              {community.joinPolicy === "request" ? " · approval required" : ""}
            </T>
          </View>
        </Row>
        {community.bio ? (
          <T size={13} muted numberOfLines={2}>
            {community.bio}
          </T>
        ) : null}
      </Card>
    </Pressable>
  );

  return (
    <Screen>
      <FlatList
        data={data}
        keyExtractor={(item) => {
          if (item.kind === "community") return `c-${item.community.id}`;
          if (item.kind === "section") return `section-${item.label}`;
          return item.kind;
        }}
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          paddingBottom: insets.bottom + 96,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        renderItem={({ item }) => {
          switch (item.kind) {
            case "header":
              return (
                <View className="gap-3">
                  <Row className="justify-between">
                    <View>
                      <T size={26} weight="800">
                        Groups
                      </T>
                      <T size={13} muted>
                        Local scenes, clubs and routes
                      </T>
                    </View>
                  </Row>
                  <Button
                    label="Create a group"
                    icon="add"
                    onPress={() => router.push("/community/new")}
                  />
                </View>
              );
            case "error":
              return (
                <ErrorState message={error ?? ""} onRetry={() => void load()} />
              );
            case "section":
              return (
                <T size={12} weight="700" muted>
                  {item.label}
                </T>
              );
            case "community":
              return renderCommunity(item.community);
            default:
              return null;
          }
        }}
        ListEmptyComponent={
          loading ? (
            <Spinner label="Loading groups" />
          ) : error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : (
            <EmptyState
              icon="people-outline"
              title="No groups yet"
              body="Start one for your local scene, or browse to find existing ones."
            />
          )
        }
      />
    </Screen>
  );
}
