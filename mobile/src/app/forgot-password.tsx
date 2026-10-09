import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";

import { ErrorBanner } from "@/components/auth";
import { Button, Card, Field, T } from "@/components/ui";
import { ApiError, postForgotPassword } from "@/lib/api";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await postForgotPassword(email.trim());
      // Always shown, whether or not the address exists — the response must not
      // reveal which accounts are real.
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the email. Try again.");
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
          {sent ? (
            <T size={14}>
              If that address has an account, a reset link is on its way. The link expires
              shortly, so use it soon.
            </T>
          ) : (
            <>
              <T size={14} muted>
                Enter the email on your account and we will send you a link to choose a new
                password.
              </T>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
              />
              <ErrorBanner message={error} />
              <Button
                label="Send reset link"
                onPress={onSubmit}
                loading={busy}
                disabled={!email.trim()}
              />
            </>
          )}
        </Card>

        <Button
          label="Back to sign in"
          variant="ghost"
          onPress={() => router.back()}
          style={{ alignSelf: "center" }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}