import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { Brand } from "@/components/auth";
import { T } from "@/components/ui";
import { unreachableBaseUrlHint } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import { useSession } from "@/lib/session";

/** After this long without a session decision, say why rather than spin forever. */
const SLOW_THRESHOLD_MS = 4000;

export default function Index() {
  const { status } = useSession();
  const { colors } = usePalette();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => setSlow(true), SLOW_THRESHOLD_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (status === "authed") return <Redirect href="/(tabs)" />;
  if (status === "guest") return <Redirect href="/login" />;

  // Restoring the session can only finish once the API answers, so this is a real
  // wait rather than a flash. Showing a branded loading state — and, if it drags,
  // the reason — stops it reading as a frozen app.
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas px-6">
      <Brand />
      <ActivityIndicator color={colors.accent} />

      {slow ? (
        <View className="items-center gap-1">
          <T size={13} tone="muted" className="text-center">
            Still trying to reach the RideWing server…
          </T>
          {unreachableBaseUrlHint() ? (
            <T size={12} tone="warning" className="text-center">
              {unreachableBaseUrlHint()}
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}