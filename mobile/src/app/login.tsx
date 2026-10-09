import { Link, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";

import { Brand, ErrorBanner } from "@/components/auth";
import { Button, Card, Field, T } from "@/components/ui";
import {
  ApiError,
  checkConnection,
  getBaseUrl,
  onBaseUrlChange,
  setBaseUrl,
  unreachableBaseUrlHint,
} from "@/lib/api";
import { useSession } from "@/lib/session";

export default function LoginScreen() {
  const { login } = useSession();
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(getBaseUrl());
  const [draftUrl, setDraftUrl] = useState(getBaseUrl());
  const [hint, setHint] = useState<string | null>(unreachableBaseUrlHint);
  const [probe, setProbe] = useState<{ ok: boolean; detail: string } | null>(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => onBaseUrlChange(() => {
    setUrl(getBaseUrl());
    setDraftUrl(getBaseUrl());
    setHint(unreachableBaseUrlHint());
  }), []);

  async function onSubmit() {
    setError(null);

    // Persist an edited URL before trying, so the request goes where they typed.
    if (draftUrl.trim() && draftUrl.trim() !== url) {
      await setBaseUrl(draftUrl);
      setUrl(getBaseUrl());
    }

    setBusy(true);
    try {
      await login(identifier.trim(), password);
      // The root layout swaps stacks once the session resolves; replacing here
      // as well keeps the transition immediate.
      router.replace("/(tabs)");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setProbing(true);
    setProbe(null);
    try {
      if (draftUrl.trim()) await setBaseUrl(draftUrl);
      setProbe(await checkConnection());
      setUrl(getBaseUrl());
      setHint(unreachableBaseUrlHint());
    } finally {
      setProbing(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        // RN's ScrollView has no content-container className, so the container
        // padding stays a style object.
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Brand />

        <Card className="gap-3.5">
          <Field
            label="Username, email or phone"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            returnKeyType="next"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />

          <ErrorBanner message={error} />

          {error || probe?.ok === false ? (
            <View className="gap-2.5 rounded-2xl border border-border bg-raised p-3.5">
              <T size={13} weight="700">
                Cannot reach the RideWing server
              </T>
              <Field
                label="API base URL"
                value={draftUrl}
                onChangeText={setDraftUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="http://192.168.1.20:4000"
              />
              {hint ? (
                <T size={12} tone="warning">
                  {hint}
                </T>
              ) : null}
              {probe ? (
                <T size={12} tone={probe.ok ? "success" : "danger"}>
                  {probe.ok ? `Connected. ${probe.detail}` : probe.detail}
                </T>
              ) : null}
              <Button
                label="Test connection"
                variant="secondary"
                loading={probing}
                onPress={testConnection}
              />
            </View>
          ) : null}

          <Button
            label="Sign in"
            onPress={onSubmit}
            loading={busy}
            disabled={!identifier.trim() || !password}
            fullWidth
          />

          <Pressable
            onPress={() => router.push("/forgot-password")}
            accessibilityRole="link"
            className="self-center py-1"
            hitSlop={8}
          >
            <T size={13} weight="600" tone="accent">
              Forgot your password?
            </T>
          </Pressable>
        </Card>

        <View className="items-center gap-1">
          <T size={14} tone="muted">
            New here? Join the ride
          </T>
          <Link href="/register" replace>
            <T size={15} weight="700" tone="accent">
              Create an account
            </T>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
