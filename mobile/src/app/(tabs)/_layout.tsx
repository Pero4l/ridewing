import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet, type OpaqueColorValue } from "react-native";

import { usePalette } from "@/lib/palette";
import { useUnreadCount } from "@/lib/use-unread";

/** Tab icons are Ionicons rather than the SF-Symbols-only `expo-symbols`. */
function TabIcon({
  name,
  focused,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  // React Navigation types this as ColorValue; the tints we pass are strings.
  color: string | OpaqueColorValue;
}) {
  return <Ionicons name={name} size={focused ? 27 : 26} color={color as string} />;
}

export default function TabsLayout() {
  // Tab-bar tints bypass Tailwind, so read the palette directly. Active is ink
  // (Instagram language), not the brand accent.
  const { colors } = usePalette();
  // Live unread total across every thread, so the tab shows a badge rather than
  // silently accumulating unread messages.
  const unread = useUnreadCount();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Instagram language: the active icon is solid ink, inactive is a muted
        // outline — never the brand color. Labels are hidden; the icons carry it.
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.hairline,
          borderTopWidth: StyleSheet.hairlineWidth,
          paddingTop: 8,
          paddingBottom: 10,
          height: 62,
        },
        tabBarLabelStyle: { display: "none" },
        sceneStyle: { backgroundColor: colors.canvas },
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "home" : "home-outline"} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="rides"
        options={{
          title: "Rides",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "navigate-circle" : "navigate-circle-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="communities"
        options={{
          title: "Communities",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "people" : "people-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{
          title: "Reels",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "film" : "film-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#FF3040",
            color: "#fff",
            fontSize: 11,
            fontWeight: "700",
            minWidth: 18,
            height: 18,
          },
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "person-circle" : "person-circle-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}