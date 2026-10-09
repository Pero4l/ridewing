import { useColorScheme } from "nativewind";

/**
 * Raw colour values, for the handful of props that cannot take a `className`.
 *
 * `placeholderTextColor`, navigator header styles and tab-bar tints are all
 * plain props rather than styleable elements, so they need a literal colour.
 * Everything else in the app is styled with Tailwind tokens from `global.css` —
 * this file exists only for those prop-shaped holes.
 *
 * ⚠️ These hex values MUST stay in sync with the CSS variables in `global.css`.
 * They are the same palette expressed twice, because one side is consumed by the
 * Tailwind compiler and the other by props that bypass it.
 */
export const palette = {
  light: {
    canvas: "#F6F7F9",
    surface: "#FFFFFF",
    raised: "#F4F4F5",
    hairline: "#E4E4E7",
    ink: "#18181B",
    muted: "#71717A",
    faint: "#A1A1AA",
    accent: "#10B981",
    accentStrong: "#059669",
    accentSoft: "#ECFDF5",
    danger: "#DC2626",
    dangerSoft: "#FEF2F2",
    success: "#16A34A",
    warning: "#D97706",
    onAccent: "#FFFFFF",
  },
  dark: {
    canvas: "#0B0B0E",
    surface: "#141417",
    raised: "#1C1C1F",
    hairline: "#27272A",
    ink: "#F4F4F5",
    muted: "#A1A1AA",
    faint: "#71717A",
    accent: "#34D399",
    accentStrong: "#10B981",
    accentSoft: "#0C3428",
    danger: "#F87171",
    dangerSoft: "#2A1414",
    success: "#4ADE80",
    warning: "#FBBF24",
    onAccent: "#052E22",
  },
} as const;

export type Palette = { [K in keyof (typeof palette)["light"]]: string };

export function usePalette(): { colors: Palette; dark: boolean } {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === "dark";
  return { colors: dark ? palette.dark : palette.light, dark };
}
