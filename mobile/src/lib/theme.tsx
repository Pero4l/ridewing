import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme as useNativeWindScheme } from "nativewind";

export type ThemePreference = "system" | "light" | "dark";

type ThemeContextValue = {
  /** What the rider chose. `system` follows the OS. */
  preference: ThemePreference;
  /** The resolved scheme actually on screen. */
  effective: "light" | "dark";
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_KEY = "ridewing:theme";

type SecureStoreModule = typeof import("expo-secure-store");

function loadSecureStore(): SecureStoreModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-secure-store") as SecureStoreModule;
  } catch {
    return null;
  }
}

async function readTheme(): Promise<ThemePreference | null> {
  try {
    const raw = await loadSecureStore()?.getItemAsync(THEME_KEY);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : null;
  } catch {
    return null;
  }
}

async function writeTheme(value: ThemePreference): Promise<void> {
  try {
    await loadSecureStore()?.setItemAsync(THEME_KEY, value);
  } catch {
    // Best-effort — the theme still applies for this session.
  }
}

export function useTheme(): ThemeContextValue {
  const value = use(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme, setColorScheme } = useNativeWindScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  // Restore the saved choice on launch. NativeWind defaults to following the
  // OS, so only non-system prefs need applying here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await readTheme();
      if (cancelled || !saved || saved === "system") return;
      setPreferenceState(saved);
      setColorScheme(saved);
    })();
    return () => {
      cancelled = true;
    };
    // setColorScheme is stable; applying once on mount is the whole job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      // `system` hands control back to the OS; light/dark pins it.
      setColorScheme(next);
      void writeTheme(next);
    },
    [setColorScheme],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      effective: colorScheme === "dark" ? "dark" : "light",
      setPreference,
    }),
    [preference, colorScheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
