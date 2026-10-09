/* eslint-disable react-hooks/set-state-in-effect --
 * This screen loads data on mount. The effect only *starts* an async fetch; the
 * state updates it triggers all land after an `await`, so there is no synchronous
 * setState during render. The rule cannot see across the async boundary.
 */
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";

import { ErrorBanner } from "@/components/auth";
import { Badge, Button, Card, Divider, Field, Row, Screen, T } from "@/components/ui";
import {
  ApiError,
  api,
  checkConnection,
  getBaseUrl,
  getDeviceId,
  onBaseUrlChange,
  setBaseUrl,
} from "@/lib/api";
import { isPasswordValid, PASSWORD_HINT } from "@/lib/validation";
import { useSession } from "@/lib/session";
import Constants from "expo-constants";

export default function SettingsScreen() {
  const { user, logout } = useSession();

  const [baseUrl, setBaseUrlState] = useState(getBaseUrl());
  const [draftUrl, setDraftUrl] = useState(getBaseUrl());
  const [probe, setProbe] = useState<{ ok: boolean; detail: string } | null>(null);
  const [probing, setProbing] = useState(false);

  // The base URL can change from Settings, so mirror it rather than reading it once.
  useEffect(() => onBaseUrlChange(() => {
    setBaseUrlState(getBaseUrl());
    setDraftUrl(getBaseUrl());
  }), []);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (done) setDone(false);
  }, [done]);

  async function testConnection() {
    setProbing(true);
    setProbe(null);
    try {
      // Apply the draft first so the probe tests what they just typed.
      if (draftUrl.trim() !== baseUrl) await setBaseUrl(draftUrl);
      setProbe(await checkConnection());
    } finally {
      setProbing(false);
    }
  }

  async function changePassword() {
    setError(null);
    if (!isPasswordValid(next)) {
      setError(PASSWORD_HINT);
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/auth/change-password", { currentPassword: current, newPassword: next });
      // The backend revokes every session on a password change, so the stored
      // refresh cookie is dead — sign out cleanly rather than leaving the app in
      // a half-authed state.
      Alert.alert("Password updated", "Sign in again with your new password.", [
        { text: "OK", onPress: () => void logout() },
      ]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Card className="gap-3">
          <Row className="justify-between">
            <T size={16} weight="700">
              Account
            </T>
            {user?.role === "admin" ? <Badge label="ADMIN" tone="accent" /> : null}
          </Row>
          <Divider />
          <View className="gap-1">
            <T size={13} tone="muted">
              Signed in as
            </T>
            <T size={15} weight="600">
              @{user?.username}
            </T>
          </View>
          {user?.email ? (
            <View className="gap-1">
              <T size={13} tone="muted">
                Email
              </T>
              <T size={15}>{user.email}</T>
            </View>
          ) : null}
          <Button
            label="View public profile"
            variant="secondary"
            onPress={() => router.push(`/profile/${user?.username ?? ""}`)}
          />
        </Card>

        <Card className="gap-3.5">
          <T size={16} weight="700">
            Change password
          </T>
          <Field
            label="Current password"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
          />
          <Field
            label="New password"
            value={next}
            onChangeText={setNext}
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
            hint={PASSWORD_HINT}
          />
          <ErrorBanner message={error} />
          <Button
            label="Update password"
            onPress={changePassword}
            loading={busy}
            disabled={!current || !isPasswordValid(next)}
          />
          <T size={11} tone="muted">
            Changing your password signs out every device.
          </T>
        </Card>

        <Card className="gap-3">
          <T size={16} weight="700">
            Server
          </T>
          <T size={12} tone="muted">
            Where this app looks for RideWing. Change it if you are testing on a
            device or emulator where localhost is not your computer.
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

          <Row gap={10}>
            <Button
              label="Test & save"
              style={{ flex: 1 }}
              loading={probing}
              onPress={testConnection}
            />
            <Button
              label="Reset"
              variant="secondary"
              onPress={() => {
                setDraftUrl(getBaseUrl());
                setProbe(null);
              }}
            />
          </Row>

          {probe ? (
            <View
              className={`rounded-md px-3 py-3 ${probe.ok ? "bg-accentSoft" : "bg-dangerSoft"}`}
            >
              <T size={13} weight="600" tone={probe.ok ? "accent" : "danger"}>
                {probe.ok ? "Connected" : "Not reachable"}
              </T>
              <T size={12} tone="muted">
                {probe.detail}
              </T>
              {!probe.ok ? (
                <T size={12} tone="muted" className="mt-1">
                  Android emulator: use http://10.0.2.2:4000. Physical device: use your
                  computer&apos;s LAN IP, and make sure both are on the same Wi-Fi.
                </T>
              ) : null}
            </View>
          ) : null}

          <Divider />
          <View className="gap-1">
            <T size={13} tone="muted">
              In use
            </T>
            <T size={13}>{baseUrl}</T>
          </View>
          <View className="gap-1">
            <T size={13} tone="muted">
              App version
            </T>
            <T size={13}>
              {(Constants.expoConfig?.version as string) ?? "dev"}
              {__DEV__ ? " · development" : ""}
            </T>
          </View>
          <View className="gap-1">
            <T size={13} tone="muted">
              Device binding
            </T>
            <T size={13} numberOfLines={1}>
              {getDeviceId() ?? "not generated"}
            </T>
          </View>
          <T size={11} tone="muted">
            The device id binds your session to this install, so a copied cookie from
            another device is rejected.
          </T>
        </Card>

        <Button label="Sign out" variant="secondary" onPress={() => void logout()} />
      </ScrollView>
    </Screen>
  );
}