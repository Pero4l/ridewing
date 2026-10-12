import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { ErrorBanner } from "@/components/auth";
import { Button, Field, Screen, T } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import type { Ride } from "@/lib/types";

type VoiceMode = "ptt" | "open";

const VOICE_MODES: {
  id: VoiceMode;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
}[] = [
  {
    id: "ptt",
    icon: "radio-outline",
    label: "Push to Talk",
    description: "Transmit only while holding the talk button. Safer on a busy road.",
  },
  {
    id: "open",
    icon: "mic",
    label: "Open Mic",
    description: "Always transmitting unless muted. Best for a stop-and-go ride.",
  },
];

export default function NewRideScreen() {
  const [name, setName] = useState("");
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("ptt");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { colors } = usePalette();

  async function onCreate() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ ride: Ride }>("/api/rides", {
        name: name.trim(),
        voiceMode,
      });
      router.replace(`/ride/${res.ride.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the ride.");
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
                { backgroundColor: colors.accentSoft },
              ]}
            >
              <Ionicons name="mic" size={64} color={colors.accent} />
            </View>
            <T size={28} weight="800" className="text-center tracking-tight" style={styles.heading}>
              Start a Ride
            </T>
            <T size={14} muted className="text-center" style={styles.subtitle}>
              Name your ride, pick a voice mode, and invite your crew.
            </T>
          </View>

          {/* ── Form ──────────────────────────────────────────────────────── */}
          <View style={styles.form}>
            <Field
              label="Ride name"
              value={name}
              onChangeText={setName}
              placeholder="Sunday morning loop"
              maxLength={80}
              hint="At least 3 characters. Everyone on the ride sees this."
              style={styles.nameInput}
            />

            {/* ── Voice mode cards ──────────────────────────────────────── */}
            <View style={styles.sectionHeader}>
              <T size={13} weight="600" muted>
                Voice mode
              </T>
            </View>
            <View style={styles.modeRow}>
              {VOICE_MODES.map((mode) => {
                const selected = voiceMode === mode.id;
                return (
                  <Pressable
                    key={mode.id}
                    onPress={() => setVoiceMode(mode.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={mode.label}
                    style={[
                      styles.modeCard,
                      {
                        borderColor: selected ? colors.accent : colors.hairline,
                        backgroundColor: selected ? colors.accentSoft : colors.surface,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.modeIconWrap,
                        {
                          backgroundColor: selected
                            ? colors.accent
                            : colors.raised,
                        },
                      ]}
                    >
                      <Ionicons
                        name={mode.icon}
                        size={22}
                        color={selected ? colors.onAccent : colors.muted}
                      />
                    </View>
                    <T
                      size={14}
                      weight="700"
                      tone={selected ? "accent" : undefined}
                      style={styles.modeLabel}
                    >
                      {mode.label}
                    </T>
                    <T
                      size={12}
                      muted
                      style={styles.modeDesc}
                    >
                      {mode.description}
                    </T>
                  </Pressable>
                );
              })}
            </View>

            <ErrorBanner message={error} />

            <Button
              label="Start ride"
              onPress={onCreate}
              loading={busy}
              disabled={name.trim().length < 3}
              fullWidth
            />
          </View>
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
  },
  // ── hero
  hero: {
    alignItems: "center",
    paddingTop: 16,
    gap: 12,
  },
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heading: {
    marginTop: 0,
  },
  subtitle: {
    maxWidth: 280,
  },
  // ── form
  form: {
    gap: 20,
  },
  nameInput: {
    fontSize: 18,
    fontWeight: "600",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    marginBottom: -8,
  },
  // ── voice mode cards
  modeRow: {
    flexDirection: "row",
    gap: 12,
  },
  modeCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    padding: 14,
    gap: 8,
    // shadow
    shadowColor: "#09090B",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  modeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modeLabel: {
    marginTop: 2,
  },
  modeDesc: {
    lineHeight: 17,
  },
});
