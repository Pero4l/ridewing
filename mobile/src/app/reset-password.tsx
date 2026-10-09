import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";

import { ErrorBanner } from "@/components/auth";
import { Button, Card, Field } from "@/components/ui";
import { ApiError, postResetPassword } from "@/lib/api";
import { isPasswordValid, PASSWORD_HINT } from "@/lib/validation";

export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!isPasswordValid(password)) {
      setError(PASSWORD_HINT);
      return;
    }
    setBusy(true);
    try {
      await postResetPassword(String(token ?? ""), password);
      // Every session was revoked by the reset, so sign in again.
      router.replace("/login");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not reset your password. The link may have expired.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Card style={{ gap: 14 }}>
          <Field
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
            hint={PASSWORD_HINT}
          />
          <ErrorBanner message={error} />
          <Button
            label="Set new password"
            onPress={onSubmit}
            loading={busy}
            disabled={!token || !isPasswordValid(password)}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}