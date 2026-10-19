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
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { usePalette } from "@/lib/palette";

export default function VerifyEmailScreen() {
  const { user } = useSession();
  const { colors } = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const email = user?.email ?? "";

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setInterval(() => {
        setResendCooldown((c) => c - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [resendCooldown]);

  async function onSubmit() {
    setError(null);
    if (code.length !== 6) return;

    setBusy(true);
    try {
      await api.post("/api/auth/verify-email", { code });
      router.replace("/(tabs)");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setError(null);
    setResendBusy(true);
    setResendCooldown(60);
    try {
      await api.post("/api/auth/send-verification");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resend code.");
      setResendCooldown(0);
    } finally {
      setResendBusy(false);
    }
  }

  const canSubmit = code.length === 6;

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

        <Card className="gap-4">
          <View className="items-center gap-2">
            <View
              className="h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: colors.accentSoft }}
            >
              <T size={28} weight="800" tone="accent">
                ✉️
              </T>
            </View>
            <T size={22} weight="800">Verify your email</T>
            <T size={14} tone="muted" className="text-center">
              We sent a 6-digit code to
            </T>
            <T size={14} weight="600" className="text-center">
              {email}
            </T>
          </View>

          <Field
            label="Verification code"
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 6))}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            placeholder="123456"
            maxLength={6}
            error={error}
            style={{ letterSpacing: 8, fontSize: 24, textAlign: "center" }}
            autoFocus
          />

          <ErrorBanner message={error} />

          <Button
            label="Verify"
            onPress={onSubmit}
            loading={busy}
            disabled={!canSubmit}
            fullWidth
          />

          <Pressable
            onPress={resendCode}
            disabled={resendCooldown > 0 || resendBusy}
            accessibilityRole="link"
            className="self-center py-1"
            hitSlop={8}
          >
            <T size={13} weight="600" tone={resendCooldown > 0 ? "muted" : "accent"}>
              {resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : resendBusy
                ? "Sending…"
                : "Didn't receive a code? Resend"}
            </T>
          </Pressable>
        </Card>

        <View className="items-center">
          <Divider className="w-full mb-6" />
          <T size={14} tone="muted" className="mb-1">
            Wrong email?
          </T>
          <Link href="/register" replace>
            <T size={15} weight="700" tone="accent">
              Update your email →
            </T>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}