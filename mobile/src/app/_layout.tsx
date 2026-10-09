// Two levels up: this file is `src/app/_layout.tsx`, so `../` is `src/` and
// `../../` is the project root, where the Tailwind entry stylesheet lives. This
// must be the *root* `_layout` — a nested layout loads its CSS after
// node_modules CSS and breaks the intended style order.
import "../../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useColorScheme } from "nativewind";

import { palette } from "@/lib/palette";
import { SessionProvider, useSession } from "@/lib/session";

type StackScreenConfig = {
  name: string;
  options: { title?: string; headerShown?: boolean };
};

/**
 * Root layout.
 *
 * Session state decides which stack the rider sees: a signed-in rider never sees
 * the auth screens, and a guest never sees the tabs. The check is held on
 * `loading` until the stored token has been verified against the API, so a
 * returning rider is not shown the sign-in screen for a frame.
 */
function RootNavigator() {
  const { status } = useSession();
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === "dark";
  const colors = dark ? palette.dark : palette.light;

  const guestScreens: StackScreenConfig[] = [
    { name: "index", options: { headerShown: false } },
    { name: "login", options: { headerShown: false } },
    { name: "register", options: { headerShown: false } },
    { name: "forgot-password", options: { title: "Reset password" } },
    { name: "reset-password", options: { title: "New password" } },
  ];

  const authedScreens: StackScreenConfig[] = [
    { name: "index", options: { headerShown: false } },
    { name: "(tabs)", options: { headerShown: false } },
    { name: "post/[postId]", options: { title: "Post" } },
    { name: "compose", options: { title: "New post" } },
    { name: "ride/[rideId]", options: { title: "Ride" } },
    { name: "ride/new", options: { title: "Start a ride" } },
    { name: "ride/join", options: { title: "Join a ride" } },
    { name: "community/[slug]", options: { title: "Community" } },
    { name: "community/new", options: { title: "New community" } },
    { name: "thread/[conversationId]", options: { headerShown: false } },
    { name: "profile/[username]", options: { title: "Rider" } },
    { name: "notifications", options: { title: "Notifications" } },
    { name: "search", options: { title: "Search riders" } },
    { name: "settings", options: { title: "Settings" } },
    { name: "support", options: { title: "Support" } },
  ];

  // `loading` keeps only the splash route, so the navigator never flashes the
  // sign-in screens at an already-authenticated rider.
  const screens: StackScreenConfig[] =
    status === "loading"
      ? [{ name: "index", options: { headerShown: false } }]
      : status === "guest"
        ? guestScreens
        : authedScreens;

  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          // Navigator chrome takes plain colour values rather than classNames, so
          // these read from `palette` — the prop-shaped mirror of the tokens.
          // The header sits on the canvas (not on a card) and drops its shadow so
          // screens separate on the hairline alone.
          headerStyle: { backgroundColor: colors.canvas },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: "700", fontSize: 17 },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.canvas },
        }}
      >
        {/* Flat array, deliberately NOT wrapped in a Fragment.

            expo-router's `mapProtectedScreen` walks the Stack's children with
            `React.Children.toArray`, which does *not* flatten Fragments — a
            fragment arrives as a single child whose `type` is
            `Symbol(react.fragment)`. Its fallback branch then interpolates
            `child.type` into a string and throws "Cannot convert Symbol to
            string", which takes down the entire app on first render.
            Rendering a plain array of <Stack.Screen> avoids that entirely. */}
        {screens.map((screen) => (
          <Stack.Screen key={screen.name} name={screen.name} options={screen.options} />
        ))}
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

/**
 * Root error boundary.
 *
 * Without this, any render error takes the whole app to a fatal redbox with no
 * way out but a reload. Expo Router picks this up automatically for the root
 * navigator, so a failure shows an explanation and a retry instead.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <SafeAreaProvider>
      <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 24, gap: 12 }}>
        <Text className="text-2xl font-extrabold text-ink">Something broke</Text>
        <Text className="text-[15px] text-muted">
          The app hit an unexpected error while rendering this screen.
        </Text>
        <View className="rounded-md bg-raised px-3 py-3">
          <Text className="text-[13px] text-ink" selectable>
            {error?.message ?? "Unknown error"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={retry}
          className="items-center rounded-md bg-accent px-4 py-3.5"
        >
          <Text className="text-[15px] font-semibold text-onAccent">Try again</Text>
        </Pressable>
        <Text className="text-[11px] text-faint">
          If this keeps happening, restart the app. If you are running in Expo Go, note that
          ride voice needs a development build.
        </Text>
      </ScrollView>
    </SafeAreaProvider>
  );
}