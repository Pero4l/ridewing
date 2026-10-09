import { View } from "react-native";

import { Banner, Logo, T } from "./ui";

export function Brand() {
  return (
    <View className="items-center gap-3">
      <Logo size={72} rounded={22} />
      <View className="items-center gap-1">
        <T size={28} weight="800" className="tracking-tight">
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
