import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { ErrorBanner } from "@/components/auth";
import { Button, Card, Chip, Field, Screen, T } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { Ride } from "@/lib/types";

export default function NewRideScreen() {
  const [name, setName] = useState("");
  const [voiceMode, setVoiceMode] = useState<"ptt" | "open">("ptt");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ ride: Ride }>("/api/rides", { name: name.trim(), voiceMode });
      router.replace(`/ride/${res.ride.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the ride.");
      setBusy(false);
    }
  }

  // RN ScrollView has no content-container className, so padding/gap stay inline.
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Card className="gap-3.5">
        <Field
          label="Ride name"
          value={name}
          onChangeText={setName}
          placeholder="Sunday morning loop"
          maxLength={80}
          hint="At least 3 characters. Everyone on the ride sees this."
        />

        <View className="gap-2">
          <T size={13} weight="600" muted>
            Voice mode
          </T>
          <View className="flex-row gap-2.5">
            <Chip
              label="Push to talk"
              icon="mic-outline"
              selected={voiceMode === "ptt"}
              onPress={() => setVoiceMode("ptt")}
            />
            <Chip
              label="Open mic"
              icon="mic"
              selected={voiceMode === "open"}
              onPress={() => setVoiceMode("open")}
            />
          </View>
          <T size={12} muted>
            {voiceMode === "ptt"
              ? "Riders transmit only while holding the talk button. Safer on a busy road."
              : "Riders are always transmitting unless muted. Best for a stop-and-go ride."}
          </T>
        </View>

        <ErrorBanner message={error} />

        <Button
          label="Start ride"
          onPress={onCreate}
          loading={busy}
          disabled={name.trim().length < 3}
          fullWidth
        />
      </Card>

      <T size={12} muted>
        Riders you follow can find the ride in their list, or you can share the invite code once
        it is created.
      </T>
      </ScrollView>
    </Screen>
  );
}