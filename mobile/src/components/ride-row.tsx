import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

import { T } from "./ui";
import { relativeTime } from "@/lib/format";
import type { Ride } from "@/lib/types";

/**
 * One running ride, used by the feed and the rides tab.
 *
 * The leading tile carries a live dot so an active voice room reads as live at
 * a glance rather than as a static list item.
 */
export function RideRow({ ride }: { ride: Ride }) {
  const router = useRouter();
  const roster = ride.participants ?? [];
  const live = ride.status === "active";

  return (
    <Pressable
      onPress={() => router.push(`/ride/${ride.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Open ride ${ride.name}`}
      className="flex-row items-center gap-3 px-4 py-3 active:bg-raised/60"
      android_ripple={{ color: "rgba(0,0,0,0.04)" }}
    >
      <View className="relative h-11 w-11 items-center justify-center rounded-xl bg-accentSoft">
        <Ionicons name="mic" size={20} className="text-accent" />
        {live ? (
          <View className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent" />
        ) : null}
      </View>
      <View className="min-w-0 flex-1">
        <T size={15} weight="600" numberOfLines={1}>
          {ride.name}
        </T>
        <T size={12} muted numberOfLines={1}>
          {ride.creator?.displayName ?? "A rider"} · {roster.length}/{ride.maxParticipants} riders
          {ride.voiceMode === "open" ? " · open mic" : ""}
        </T>
      </View>
      <T size={11} muted className="shrink-0">
        {relativeTime(ride.createdAt)}
      </T>
    </Pressable>
  );
}
