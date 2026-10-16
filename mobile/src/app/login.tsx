import { Link, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand, ErrorBanner } from "@/components/auth";
import { Button, Card, Divider, Field, T } from "@/components/ui";
import {
  ApiError,
  checkConnection,
  getBaseUrl,
  onBaseUrlChange,
  setBaseUrl,
  unreachableBaseUrlHint,
} from "@/lib/api";
import { useSession } from "@/lib/session";
import { usePalette } from "@/lib/palette";

export default function LoginScreen() {
  const { login } = useSession();
  const { colors } = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(getBaseUrl());
  const [draftUrl, setDraftUrl] = useState(getBaseUrl());
  const [hint, setHint] = useState<string | null>(unreachableBaseUrlHint);
  const [probe, setProbe] = useState<{ ok: boolean; detail: string } | null>(null);
  const [probing, setProbing] = useState(false);

  useEffect(
    () =>
      onBaseUrlChange(() => {
        setUrl(getBaseUrl());
        setDraftUrl(getBaseUrl());
        setHint(unreachableBaseUrlHint());
      }),
    [],
  );

  async function onSubmit() {
    setError(null);

    if (draftUrl.trim() && draftUrl.trim() !== url) {
      await setBaseUrl(draftUrl);
      setUrl(getBaseUrl());
    }

    setBusy(true);
    try {
      await login(identifier.trim(), password);
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

  const canSubmit = identifier.trim().length > 0 && password.length > 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 24,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 32,
          gap: 28,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Brand />

        {/* Main sign-in form */}
        <Card className="gap-4">
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

          {/* Connection troubleshooter — only shown when something goes wrong */}
          {error || probe?.ok === false ? (
            <View
              className="gap-3 rounded-2xl border p-4"
              style={{ borderColor: colors.hairline, backgroundColor: colors.raised }}
            >
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
                placeholder="https://ridewing.onrender.com"
              />
              {hint ? (
                <T size={12} tone="warning">
                  {hint}
                </T>
              ) : null}
              {probe ? (
                <T size={12} tone={probe.ok ? "success" : "danger"}>
                  {probe.ok ? `✓ Connected — ${probe.detail}` : probe.detail}
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
            disabled={!canSubmit}
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

        {/* Register prompt */}
        <View className="items-center">
          <Divider className="w-full mb-6" />
          <T size={14} tone="muted" className="mb-1">
            New here? Join the ride
          </T>
          <Link href="/register" replace>
            <T size={15} weight="700" tone="accent">
              Create a free account →
            </T>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
