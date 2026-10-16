import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { OpaqueColorValue } from "react-native";

import { useColorScheme } from "nativewind";

import { palette } from "@/lib/palette";
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
  return <Ionicons name={name} size={24} color={color as string} />;
}

export default function TabsLayout() {
  // Tab-bar tint colours are plain props rather than classNames, so they cannot
  // use theme tokens — these literal values mirror `global.css` and are swapped
  // with the scheme so the bar does not stay light in dark mode.
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === "dark";
  const colors = dark ? palette.dark : palette.light;
  // Live unread total across every thread, so the tab shows a badge rather than
  // silently accumulating unread messages.
  const unread = useUnreadCount();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.hairline,
          // The bar sits on a tinted canvas, so an opaque surface plus the hairline
          // is what separates it; no blur library is needed for that to read right.
          borderTopWidth: 0.5,
          paddingTop: 12,
          paddingBottom: 12,
        },
        tabBarLabelStyle: { fontSize: 13, fontWeight: "600" },
        sceneStyle: { backgroundColor: colors.canvas },
        // Instagram-like: show label always, small font
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
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
              name={focused ? "navigate" : "navigate-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="communities"
        options={{
          title: "Groups",
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
        name="messages"
        options={{
          title: "Messages",
          tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: dark ? "#F87171" : "#DC2626" },
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "You",
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