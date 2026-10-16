/* eslint-disable react-hooks/set-state-in-effect --
 * This screen loads data on mount. The effect only *starts* an async fetch; the
 * state updates it triggers all land after an `await`, so there is no synchronous
 * setState during render. The rule cannot see across the async boundary.
 */
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBanner } from "@/components/auth";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  Field,
  ListRow,
  Screen,
  T,
} from "@/components/ui";
import {
  ApiError,
  api,
  checkConnection,
  getBaseUrl,
  getDeviceId,
  onBaseUrlChange,
  setBaseUrl,
} from "@/lib/api";
import { usePalette } from "@/lib/palette";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { isPasswordValid, PASSWORD_HINT } from "@/lib/validation";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();
  const { user, logout } = useSession();
  const { preference, setPreference } = useTheme();

  // ── server URL ────────────────────────────────────────────────────────────
  const [baseUrl, setBaseUrlState] = useState(getBaseUrl());
  const [draftUrl, setDraftUrl] = useState(getBaseUrl());
  const [probe, setProbe] = useState<{ ok: boolean; detail: string } | null>(null);
  const [probing, setProbing] = useState(false);

  useEffect(
    () =>
      onBaseUrlChange(() => {
        setBaseUrlState(getBaseUrl());
        setDraftUrl(getBaseUrl());
      }),
    [],
  );

  async function testConnection() {
    setProbing(true);
    setProbe(null);
    try {
      if (draftUrl.trim() !== baseUrl) await setBaseUrl(draftUrl);
      setProbe(await checkConnection());
    } finally {
      setProbing(false);
    }
  }

  // ── change password (collapsed by default) ──────────────────────────
  const [securityOpen, setSecurityOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function changePassword() {
    setPasswordError(null);
    if (!isPasswordValid(next)) {
      setPasswordError(PASSWORD_HINT);
      return;
    }
    setPasswordBusy(true);
    try {
      await api.post("/api/auth/change-password", {
        currentPassword: current,
        newPassword: next,
      });
      Alert.alert("Password updated", "Sign in again with your new password.", [
        { text: "OK", onPress: () => void logout() },
      ]);
    } catch (err) {
      setPasswordError(
        err instanceof ApiError ? err.message : "Could not update your password.",
      );
    } finally {
      setPasswordBusy(false);
    }
  }

  const version =
    (Constants.expoConfig?.version as string | undefined) ?? "dev";

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16 },
        ]}
      >
        {/* ── Large title ─────────────────────────────────────────────── */}
        <T size={32} weight="800" style={styles.pageTitle}>
          Settings
        </T>

        {/* ══ ACCOUNT ══════════════════════════════════════════════════ */}
        <T size={11} weight="700" style={[styles.sectionLabel, { color: colors.muted }]}>
          ACCOUNT
        </T>
        <Card padded={false} style={styles.group}>
          <ListRow
            title={user?.displayName ?? user?.username ?? ""}
            subtitle={user?.email ?? `@${user?.username ?? ""}`}
            icon={undefined}
            showChevron
            onPress={() => router.push(`/profile/${user?.username ?? ""}`)}
            right={
              <View style={styles.accountRight}>
                {user?.role === "admin" ? (
                  <Badge label="ADMIN" tone="accent" />
                ) : null}
                <Avatar user={user} size={36} />
              </View>
            }
          />
        </Card>

        {/* ══ APPEARANCE ═══════════════════════════════════════════════ */}
        <T size={11} weight="700" style={[styles.sectionLabel, { color: colors.muted }]}>
          APPEARANCE
        </T>
        <Card padded={false} style={styles.group}>
          <ThemeOption
            title="System"
            subtitle="Follow your device"
            icon="phone-portrait-outline"
            selected={preference === "system"}
            onPress={() => setPreference("system")}
            first
          />
          <Divider />
          <ThemeOption
            title="Light"
            subtitle="Bright canvas, always"
            icon="sunny-outline"
            selected={preference === "light"}
            onPress={() => setPreference("light")}
          />
          <Divider />
          <ThemeOption
            title="Dark"
            subtitle="Easy on the eyes at night"
            icon="moon-outline"
            selected={preference === "dark"}
            onPress={() => setPreference("dark")}
            last
          />
        </Card>

        {/* ══ SECURITY (collapsed until opened) ══════════════════════════ */}
        <Pressable
          onPress={() => setSecurityOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: securityOpen }}
          accessibilityLabel="Security settings"
          className="flex-row items-center justify-between active:opacity-70"
          style={[styles.sectionLabel, { marginBottom: securityOpen ? 6 : 0 }]}
        >
          <T size={11} weight="700" style={{ color: colors.muted, letterSpacing: 0.6 }}>
            SECURITY
          </T>
          <Ionicons
            name={securityOpen ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.muted}
          />
        </Pressable>
        {securityOpen ? (
          <Card style={styles.group}>
            <T size={15} weight="600" style={styles.groupHeading}>
              Change password
            </T>
            <View style={styles.fieldStack}>
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
            </View>
            <ErrorBanner message={passwordError} />
            <Button
              label="Update password"
              onPress={changePassword}
              loading={passwordBusy}
              disabled={!current || !isPasswordValid(next)}
            />
            <T size={11} tone="muted" style={styles.caption}>
              Changing your password signs out every device.
            </T>
          </Card>
        ) : null}

        {/* ══ SERVER ═══════════════════════════════════════════════════ */}
        <T size={11} weight="700" style={[styles.sectionLabel, { color: colors.muted }]}>
          SERVER
        </T>
        <Card style={styles.group}>
          <T size={13} tone="muted" style={styles.groupHint}>
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
          <View style={styles.row}>
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
          </View>

          {probe ? (
            <View
              style={[
                styles.probeBox,
                { backgroundColor: probe.ok ? colors.accentSoft : colors.dangerSoft },
              ]}
            >
              <View style={styles.probeRow}>
                <Ionicons
                  name={probe.ok ? "checkmark-circle" : "close-circle"}
                  size={16}
                  color={probe.ok ? colors.accent : colors.danger}
                />
                <T size={13} weight="600" tone={probe.ok ? "accent" : "danger"}>
                  {probe.ok ? "Connected" : "Not reachable"}
                </T>
              </View>
              <T size={12} tone="muted">
                {probe.detail}
              </T>
              {!probe.ok ? (
                <T size={12} tone="muted" style={styles.probeHint}>
                  Android emulator: use http://10.0.2.2:4000. Physical device:
                  use your computer&apos;s LAN IP, and make sure both are on the
                  same Wi-Fi.
                </T>
              ) : null}
            </View>
          ) : null}

          <Divider />

          <View style={styles.infoRow}>
            <T size={13} tone="muted" style={styles.infoLabel}>
              In use
            </T>
            <T size={13} style={styles.infoValue} numberOfLines={1}>
              {baseUrl}
            </T>
          </View>
        </Card>

        {/* ══ ABOUT ════════════════════════════════════════════════════ */}
        <T size={11} weight="700" style={[styles.sectionLabel, { color: colors.muted }]}>
          ABOUT
        </T>
        <Card padded={false} style={styles.group}>
          <View style={styles.aboutRow}>
            <T size={15} weight="400">
              App version
            </T>
            <T size={15} tone="muted">
              {version}
              {__DEV__ ? " · dev" : ""}
            </T>
          </View>
          <Divider />
          <View style={[styles.aboutRow, styles.aboutRowLast]}>
            <T size={15} weight="400">
              Device binding
            </T>
            <T size={13} tone="muted" numberOfLines={1} style={styles.deviceId}>
              {getDeviceId() ?? "not generated"}
            </T>
          </View>
        </Card>

        <T size={11} tone="muted" style={styles.deviceHint}>
          The device id binds your session to this install, so a copied cookie
          from another device is rejected.
        </T>
      </ScrollView>
    </Screen>
  );
}

function ThemeOption({
  title,
  subtitle,
  icon,
  selected,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
  first?: boolean;
  last?: boolean;
}) {
  const { colors } = usePalette();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      iconTone={selected ? "accent" : "muted"}
      showChevron={false}
      onPress={onPress}
      right={
        selected ? (
          <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
        ) : (
          <View style={{ width: 22 }} />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 48,
    gap: 4,
  },
  pageTitle: {
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  sectionLabel: {
    marginBottom: 6,
    marginTop: 20,
    marginLeft: 4,
    letterSpacing: 0.6,
  },
  group: {
    gap: 0,
    overflow: "hidden",
  },
  groupHeading: {
    marginBottom: 12,
  },
  groupHint: {
    marginBottom: 12,
  },
  fieldStack: {
    gap: 12,
    marginBottom: 12,
  },
  caption: {
    marginTop: 6,
  },
  accountRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  probeBox: {
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  probeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  probeHint: {
    marginTop: 4,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    gap: 8,
  },
  infoLabel: {
    flexShrink: 0,
  },
  infoValue: {
    flex: 1,
    textAlign: "right",
  },
  aboutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  aboutRowLast: {
    // extra space only needed if more rows follow; here it's fine as-is
  },
  deviceId: {
    flex: 1,
    textAlign: "right",
  },
  deviceHint: {
    marginTop: 8,
    marginHorizontal: 4,
    lineHeight: 17,
  },
});
