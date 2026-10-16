/* eslint-disable react-hooks/set-state-in-effect --
 * Data is loaded in response to a user action (opening the sheet, typing) and the
 * state updates land after an `await`. The rule cannot see across the async
 * boundary.
 */
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { Avatar, Button, EmptyState, Row, Spinner, T } from "./ui";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import type { Page, PublicUser } from "@/lib/types";

/**
 * A searchable rider picker.
 *
 * Backs two flows that both need "choose a rider": starting a direct message and
 * sharing a post. `friendsOnly` limits it to people the rider already follows,
 * which is the common case; leaving it false falls back to the rider directory.
 */
export function RiderPicker({
  visible,
  title,
  subtitle,
  friendsOnly = true,
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  friendsOnly?: boolean;
  onClose: () => void;
  onPick: (username: string) => void;
}) {
  const { colors, dark } = usePalette();
  const [query, setQuery] = useState("");
  const [riders, setRiders] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (q: string) => {
      setLoading(true);
      setError(null);
      try {
        // `/users/search` demands two characters; `/users/friends` does not.
        const path = friendsOnly
          ? `/api/users/friends?limit=50${q ? `&q=${encodeURIComponent(q)}` : ""}`
          : `/api/users/search?limit=50${q ? `&q=${encodeURIComponent(q)}` : ""}`;
        const res = await api.get<Page<PublicUser> & { users?: PublicUser[] }>(path);
        setRiders(res.users ?? res.items ?? []);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load riders.");
      } finally {
        setLoading(false);
      }
    },
    [friendsOnly],
  );

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    void load("");
  }, [visible, load]);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    if (!visible) return;
    const term = query.trim();
    if (friendsOnly && term.length > 0 && term.length < 2) {
      setRiders([]);
      return;
    }
    if (!friendsOnly && term.length > 0 && term.length < 2) {
      setRiders([]);
      return;
    }
    const timer = setTimeout(() => void load(term), 300);
    return () => clearTimeout(timer);
  }, [query, visible, load, friendsOnly]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View
          className="max-h-[85%] rounded-t-xl pt-3"
          style={{ paddingBottom: 28, backgroundColor: colors.canvas }}
        >
          <View
            className="mb-2 h-1 w-10 self-center rounded-full"
            style={{ backgroundColor: colors.hairline }}
          />

          <View className="gap-1 px-4 pb-3">
            <T size={18} weight="700">
              {title}
            </T>
            {subtitle ? (
              <T size={13} tone="muted">
                {subtitle}
              </T>
            ) : null}
          </View>

          <View className="px-4 pb-3">
            <View
              className="flex-row items-center gap-2 rounded-md px-3 py-2.5"
              style={[
                styles.hairline,
                { backgroundColor: colors.raised, borderColor: colors.hairline },
              ]}
            >
              <Ionicons name="search" size={16} color={colors.faint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={friendsOnly ? "Search the riders you follow" : "Search riders"}
                placeholderTextColor={colors.faint}
                keyboardAppearance={dark ? "dark" : "light"}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, fontSize: 15, color: colors.ink }}
              />
              {loading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
            </View>
            {friendsOnly && query.trim().length === 1 ? (
              <T size={11} tone="muted" className="mt-1">
                Keep typing — searches need two characters.
              </T>
            ) : null}
          </View>

          <View className="min-h-[160px]">
            {error ? (
              <EmptyState icon="alert-circle-outline" title="Could not load riders" body={error} />
            ) : loading && !riders.length ? (
              <Spinner label="Loading riders" />
            ) : riders.length ? (
              riders.map((rider) => (
                <Pressable
                  key={rider.id}
                  onPress={() => onPick(rider.username)}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${rider.displayName}`}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Row
                    gap={12}
                    className="px-4 py-3"
                    style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline }}
                  >
                    <Avatar user={rider} size={40} />
                    <View className="flex-1">
                      <T size={15} weight="600" numberOfLines={1}>
                        {rider.displayName}
                      </T>
                      <T size={12} tone="muted" numberOfLines={1}>
                        @{rider.username}
                        {rider.bio ? ` · ${rider.bio}` : ""}
                      </T>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                  </Row>
                </Pressable>
              ))
            ) : (
              <EmptyState
                icon="people-outline"
                title={query ? "No riders found" : "Nobody to pick yet"}
                body={
                  query
                    ? "Try a different name or username."
                    : friendsOnly
                      ? "Follow a few riders first, or search the whole directory."
                      : undefined
                }
                action={
                  friendsOnly ? (
                    <Button
                      label="Search all riders"
                      variant="secondary"
                      onPress={() => {
                        onClose();
                        onPick("__all__");
                      }}
                    />
                  ) : undefined
                }
              />
            )}
          </View>

          <View className="px-4 pt-3">
            <Button label="Cancel" variant="secondary" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hairline: { borderWidth: StyleSheet.hairlineWidth },
});
