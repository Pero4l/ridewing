import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand, ErrorBanner } from "@/components/auth";
import { Button, Card, Divider, Field, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  DISPLAY_NAME_MAX,
  isPasswordValid,
  PASSWORD_HINT,
  USERNAME_HINT,
  USERNAME_MAX,
  USERNAME_MIN,
} from "@/lib/validation";
import { useSession } from "@/lib/session";

export default function RegisterScreen() {
  const { register } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [localPasswordError, setLocalPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setErrors({});

    const badPassword = !isPasswordValid(password) ? PASSWORD_HINT : null;
    setLocalPasswordError(badPassword);
    if (badPassword || username.trim().length < USERNAME_MIN) return;

    setBusy(true);
    try {
      await register({
        username: username.trim().toLowerCase(),
        displayName: displayName.trim() || username.trim(),
        email: email.trim() || undefined,
        password,
      });
      router.replace("/(tabs)");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details?.length) {
          const map: Record<string, string> = {};
          for (const detail of err.details) {
            if (detail.field) map[detail.field] = detail.message ?? "Invalid value";
          }
          if (Object.keys(map).length) {
            setErrors(map);
            setBusy(false);
            return;
          }
        }
        setError(err.message);
      } else {
        setError("Could not create your account. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const ready =
    username.trim().length >= USERNAME_MIN && isPasswordValid(password) && !localPasswordError;

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
          <Field
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            maxLength={USERNAME_MAX}
            hint={USERNAME_HINT}
            error={errors.username}
          />
          <Field
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={DISPLAY_NAME_MAX}
            hint="Optional — defaults to your username."
            error={errors.displayName}
          />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            hint="For ride invitations and account recovery."
            error={errors.email}
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
            hint={PASSWORD_HINT}
            error={errors.password ?? localPasswordError}
          />

          <ErrorBanner message={error} />

          <Button
            label="Create account"
            onPress={onSubmit}
            loading={busy}
            disabled={!ready}
            fullWidth
          />
        </Card>

        {/* Login link */}
        <View className="items-center">
          <Divider className="w-full mb-6" />
          <T size={14} tone="muted" className="mb-1">
            Already have an account?
          </T>
          <Link href="/login" replace>
            <T size={15} weight="700" tone="accent">
              Sign in →
            </T>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
