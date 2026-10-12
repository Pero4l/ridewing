import { View } from "react-native";

import { Banner, Logo, T } from "./ui";

/**
 * The branded header used on auth screens.
 *
 * Larger logo, tighter wordmark, muted tagline — consistent with Instagram's
 * approach: one strong logo, one title, nothing else competing for attention.
 */
export function Brand() {
  return (
    <View className="items-center gap-3">
      <View
        style={{
          shadowColor: "#10B981",
          shadowOpacity: 0.25,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <Logo size={80} rounded={24} />
      </View>
      <View className="items-center gap-1">
        <T size={32} weight="800" className="tracking-tight">
          RideWing
        </T>
        <T size={14} tone="muted">
          Ride together. Talk together.
        </T>
      </View>
    </View>
  );
}

/** Inline validation / network failure message. */
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <Banner tone="danger" message={message} />;
}
