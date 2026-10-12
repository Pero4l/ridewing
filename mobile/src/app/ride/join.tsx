import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { ErrorBanner } from "@/components/auth";
import { Button, Screen, T } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import type { Ride } from "@/lib/types";

/**
 * Join a ride with an invite code.
 *
 * Without this the invite code is a dead end: the ride screen *shows* a code but
 * there was no way anywhere in the app to redeem one, so rides could only be
 * joined by opening them from the list — which only surfaces rides started by
 * riders you follow.
 */
export default function JoinRideScreen() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { colors } = usePalette();

  const normalised = code.trim().toUpperCase();

  async function join() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ ride: Ride; rejoined: boolean }>("/api/rides/join", {
        code: normalised,
      });
      router.replace(`/ride/${res.ride.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not join that ride. Check the code and try again.",
      );
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <View style={styles.hero}>
            <View
              style={[
                styles.iconCircle,
                {
                  backgroundColor: colors.raised,
                  // elevated ring
                  shadowColor: "#09090B",
                  shadowOpacity: 0.1,
                  shadowRadius: 20,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 6,
                },
              ]}
            >
              <Ionicons name="key" size={56} color={colors.accent} />
            </View>
            <T size={28} weight="800" className="text-center tracking-tight" style={styles.heading}>
              Join a Ride
            </T>
            <T size={14} muted className="text-center" style={styles.subtitle}>
              Enter the invite code from the ride organiser.
            </T>
          </View>

          {/* ── Code input ────────────────────────────────────────────────── */}
          <View
            style={[
              styles.codeCard,
              {
                backgroundColor: colors.surface,
                borderColor: normalised.length > 0 ? colors.accent : colors.hairline,
              },
            ]}
          >
            <TextInput
              value={code}
              onChangeText={(text) => setCode(text.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="A1B2C3"
              placeholderTextColor={colors.faint}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              maxLength={12}
              returnKeyType="go"
              onSubmitEditing={normalised.length >= 4 ? join : undefined}
              style={[
                styles.codeInput,
                {
                  color: colors.ink,
                  // monospace feel via wide letter-spacing + system monospace font
                  fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
                },
              ]}
              accessibilityLabel="Invite code"
            />
            {normalised.length > 0 && (
              <Pressable
                onPress={() => setCode("")}
                hitSlop={12}
                accessibilityLabel="Clear code"
                style={styles.clearBtn}
              >
                <Ionicons name="close-circle" size={20} color={colors.faint} />
              </Pressable>
            )}
          </View>

          <ErrorBanner message={error} />

          <Button
            label="Join ride"
            onPress={join}
            loading={busy}
            disabled={normalised.length < 4}
            fullWidth
          />

          {/* ── Footer note ───────────────────────────────────────────────── */}
          <T size={12} muted className="text-center" style={styles.note}>
            Anyone with the code can join — only share it with riders you want on the ride.
          </T>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    padding: 24,
    gap: 24,
    flexGrow: 1,
  },
  // ── hero
  hero: {
    alignItems: "center",
    paddingTop: 16,
    gap: 12,
  },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heading: {
    marginTop: 0,
  },
  subtitle: {
    maxWidth: 260,
  },
  // ── code card
  codeCard: {
    borderRadius: 20,
    borderWidth: 2,
    paddingHorizontal: 20,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    // shadow
    shadowColor: "#09090B",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  codeInput: {
    flex: 1,
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: 10,
    textAlign: "center",
    paddingVertical: 16,
    // prevent extra height from inner Android line-height padding
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  clearBtn: {
    paddingLeft: 8,
  },
  // ── footer
  note: {
    paddingHorizontal: 8,
    marginTop: 4,
  },
});
