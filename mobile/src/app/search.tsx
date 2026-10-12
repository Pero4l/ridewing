/* eslint-disable react-hooks/set-state-in-effect --
 * The debounce effect only *starts* a timeout; the state it sets lands later.
 */
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Avatar,
  Button,
  Screen,
  SearchField,
  Spinner,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { bikeLabel } from "@/lib/format";
import { usePalette } from "@/lib/palette";
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
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();
  const params = useLocalSearchParams<{ q?: string }>();

  const [query, setQuery] = useState(
    typeof params.q === "string" ? params.q : "",
  );
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
        setError(
          err instanceof ApiError ? err.message : "Could not search right now.",
        );
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
      list
        ? list.map((item) =>
            item.id === user.id ? { ...item, viewerIsFollowing: next } : item,
          )
        : list,
    );
    try {
      if (next) await api.post(`/api/users/${user.username}/follow`);
      else await api.delete(`/api/users/${user.username}/follow`);
    } catch (err) {
      setResults((list) =>
        list
          ? list.map((item) =>
              item.id === user.id
                ? { ...item, viewerIsFollowing: !next }
                : item,
            )
          : list,
      );
      setError(
        err instanceof ApiError ? err.message : "Could not update that follow.",
      );
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  const listEmpty =
    loading ? (
      <View style={styles.stateWrap}>
        <Spinner label="Searching" />
      </View>
    ) : error ? (
      <View style={styles.stateWrap}>
        <View style={[styles.iconCircle, { backgroundColor: colors.raised }]}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.danger} />
        </View>
        <T size={16} weight="700" style={styles.stateTitle}>
          Something went wrong
        </T>
        <T size={13} tone="muted" style={styles.stateBody}>
          {error}
        </T>
      </View>
    ) : results ? (
      <View style={styles.stateWrap}>
        <View style={[styles.iconCircle, { backgroundColor: colors.raised }]}>
          <Ionicons name="search-outline" size={28} color={colors.accent} />
        </View>
        <T size={16} weight="700" style={styles.stateTitle}>
          No riders found
        </T>
        <T size={13} tone="muted" style={styles.stateBody}>
          Try part of a display name, or check the spelling of the username.
        </T>
      </View>
    ) : (
      <View style={styles.stateWrap}>
        <View style={[styles.iconCircle, { backgroundColor: colors.raised }]}>
          <Ionicons name="search-outline" size={28} color={colors.accent} />
        </View>
        <T size={16} weight="700" style={styles.stateTitle}>
          Find riders
        </T>
        <T size={13} tone="muted" style={styles.stateBody}>
          Search by username or display name. Type at least two characters.
        </T>
      </View>
    );

  return (
    <Screen>
      {/* ── Search bar pinned above the list ──────────────────────────── */}
      <View
        style={[
          styles.searchBar,
          {
            paddingTop: insets.top + 12,
            borderBottomColor: colors.hairline,
          },
        ]}
      >
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Find riders by name…"
        />
      </View>

      {/* ── Results list ──────────────────────────────────────────────── */}
      <FlatList
        data={results ?? []}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => (
          <View
            style={[
              styles.separator,
              { backgroundColor: colors.hairline },
            ]}
          />
        )}
        ListEmptyComponent={listEmpty}
        renderItem={({ item }) => (
          <RiderRow
            item={item}
            colors={colors}
            onPress={() => router.push(`/profile/${item.username}`)}
            onToggleFollow={() => void toggleFollow(item)}
          />
        )}
      />
    </Screen>
  );
}

// ── RiderRow ─────────────────────────────────────────────────────────────────

function RiderRow({
  item,
  colors,
  onPress,
  onToggleFollow,
}: {
  item: SearchResult;
  colors: ReturnType<typeof usePalette>["colors"];
  onPress: () => void;
  onToggleFollow: () => void;
}) {
  const bike = bikeLabel(item.bikeInfo);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.displayName}'s profile`}
      android_ripple={{ color: "rgba(0,0,0,0.05)" }}
      style={({ pressed }) => [
        styles.riderRow,
        pressed ? { backgroundColor: colors.raised } : null,
      ]}
    >
      {/* Avatar */}
      <Avatar user={item} size={44} />

      {/* Name + meta */}
      <View style={styles.riderInfo}>
        <T size={15} weight="700" numberOfLines={1}>
          {item.displayName}
        </T>
        <T size={12} tone="muted" numberOfLines={1}>
          @{item.username}
          {bike ? ` · ${bike}` : ""}
        </T>
      </View>

      {/* Follow button */}
      <Button
        label={item.viewerIsFollowing ? "Following" : "Follow"}
        size="sm"
        variant={item.viewerIsFollowing ? "secondary" : "primary"}
        onPress={onToggleFollow}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listContent: {
    paddingBottom: 32,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 72, // indent past avatar
  },
  riderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  riderInfo: {
    flex: 1,
    minWidth: 0,
  },
  stateWrap: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 56,
    gap: 8,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  stateTitle: {
    textAlign: "center",
  },
  stateBody: {
    textAlign: "center",
    lineHeight: 19,
  },
});
