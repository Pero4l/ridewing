import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import { ErrorBanner } from "@/components/auth";
import { Button, Card, Field, Screen, T } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <Screen>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Card className="gap-4">
          <View className="gap-1">
            <T size={16} weight="700">
              Join with an invite code
            </T>
            <T size={13} tone="muted">
              Ask the ride organiser for the code shown on their ride screen.
            </T>
          </View>

          <Field
            label="Invite code"
            value={code}
            onChangeText={setCode}
            placeholder="E.g. 7KQP2M"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            // Readable entry for a short code people read aloud or screenshot.
            style={{
              letterSpacing: 4,
              fontSize: 22,
              textAlign: "center",
              fontWeight: "700",
            }}
          />

          <ErrorBanner message={error} />

          <Button
            label="Join ride"
            onPress={join}
            loading={busy}
            disabled={normalised.length < 4}
            fullWidth
          />
        </Card>

        <T size={12} tone="muted" className="text-center">
          Anyone with the code can join, so only share it with riders you want on the ride.
        </T>
        </ScrollView>
      </Screen>
    </KeyboardAvoidingView>
  );
}