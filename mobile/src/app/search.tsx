/* eslint-disable react-hooks/set-state-in-effect --
 * The debounce effect only *starts* a timeout; the state it sets lands later.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";

import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  Row,
  Screen,
  SearchField,
  Spinner,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { bikeLabel } from "@/lib/format";
import type { PublicUser } from "@/lib/types";

type SearchResult = PublicUser & { viewerIsFollowing?: boolean };

/**
 * Rider search.
 *
 * Reached from the feed's search field with a `q` param, and usable on its own.
 * The query is debounced as the rider types because the endpoint matches on
 * username prefix and display-name contains — a keystroke-per-request pattern
 * would hammer the database for a name people get wrong on the first try.
 */
export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();

  const [query, setQuery] = useState(typeof params.q === "string" ? params.q : "");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ticket = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      const current = ++ticket.current;
      try {
        const page = await api.get<{ users: SearchResult[] }>(
          `/api/users/search?q=${encodeURIComponent(term)}&limit=25`,
        );
        if (current !== ticket.current) return;
        setResults(page.users);
        setError(null);
      } catch (err) {
        if (current !== ticket.current) return;
        setError(err instanceof ApiError ? err.message : "Could not search right now.");
      } finally {
        if (current === ticket.current) setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  async function toggleFollow(user: SearchResult) {
    const next = !user.viewerIsFollowing;
    // Optimistic: the follow button is the only thing that changes, so a
    // failure just restores the previous value.
    setResults((list) =>
      list ? list.map((item) => (item.id === user.id ? { ...item, viewerIsFollowing: next } : item)) : list,
    );
    try {
      if (next) await api.post(`/api/users/${user.username}/follow`);
      else await api.delete(`/api/users/${user.username}/follow`);
    } catch (err) {
      setResults((list) =>
        list
          ? list.map((item) => (item.id === user.id ? { ...item, viewerIsFollowing: !next } : item))
          : list,
      );
      setError(err instanceof ApiError ? err.message : "Could not update that follow.");
    }
  }

  return (
    <Screen>
      <View className="px-4 pb-3 pt-3">
        <SearchField value={query} onChangeText={setQuery} placeholder="Find riders by name…" />
      </View>

      <FlatList
        data={results ?? []}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32, gap: 8, paddingHorizontal: 16 }}
        ListEmptyComponent={
          loading ? (
            <Spinner label="Searching" />
          ) : error ? (
            <ErrorState message={error} />
          ) : results ? (
            <EmptyState
              icon="search-outline"
              title="No riders found"
              body="Try part of a display name, or check the spelling of the username."
            />
          ) : (
            <EmptyState
              icon="search-outline"
              title="Find riders"
              body="Search by username or display name. Type at least two characters."
            />
          )
        }
        renderItem={({ item }) => (
          <Row gap={12} className="rounded-2xl border border-border bg-surface p-3">
            <Pressable
              onPress={() => router.push(`/profile/${item.username}`)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.displayName}'s profile`}
            >
              <Avatar user={item} size={44} />
            </Pressable>
            <Pressable
              onPress={() => router.push(`/profile/${item.username}`)}
              accessibilityRole="button"
              className="min-w-0 flex-1"
            >
              <T size={15} weight="700" numberOfLines={1}>
                {item.displayName}
              </T>
              <T size={12} muted numberOfLines={1}>
                @{item.username}
                {bikeLabel(item.bikeInfo) ? ` · ${bikeLabel(item.bikeInfo)}` : ""}
              </T>
            </Pressable>
            <Button
              label={item.viewerIsFollowing ? "Following" : "Follow"}
              size="sm"
              variant={item.viewerIsFollowing ? "secondary" : "primary"}
              onPress={() => toggleFollow(item)}
            />
          </Row>
        )}
      />
    </Screen>
  );
}
