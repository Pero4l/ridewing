/** @type {import('tailwindcss').Config} */

/**
 * Tailwind CSS for the native app, via NativeWind.
 *
 * Note this is Tailwind **v3** config, not v4: NativeWind 4.2.7 — the release
 * that supports Expo SDK 57 — targets v3's `@tailwind` directives and the
 * `nativewind/preset`. The web app in `../frontend` is on v4 and stays that way;
 * they are separate packages with separate toolchains.
 *
 * Colours are declared as CSS variables so light and dark share one token name
 * and the mode flips by swapping the variables on the root, which is what
 * `darkMode: "class"` keys off via the `dark` variant below.
 */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Surface
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        // `card` is an alias for `surface` — used in Card component and several
        // screens. bg-card renders the same white/dark floating card as bg-surface.
        card: "rgb(var(--surface) / <alpha-value>)",
        raised: "rgb(var(--raised) / <alpha-value>)",
        hairline: "rgb(var(--hairline) / <alpha-value>)",
        // `border` is a utility alias for `hairline` so `border-border` / `bg-border`
        // shorthand works in component code without the redundant "hairline" name.
        border: "rgb(var(--hairline) / <alpha-value>)",
        // Content
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        faint: "rgb(var(--faint) / <alpha-value>)",
        // Brand + status
        accent: "rgb(var(--accent) / <alpha-value>)",
        accentStrong: "rgb(var(--accent-strong) / <alpha-value>)",
        accentSoft: "rgb(var(--accent-soft) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        dangerSoft: "rgb(var(--danger-soft) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        onAccent: "rgb(var(--on-accent) / <alpha-value>)",
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        md: "10px",
        lg: "14px",
        xl: "20px",
        "2xl": "24px",
      },
      boxShadow: {
        // Elevation is deliberately faint: cards lift off the tinted canvas
        // rather than floating in space.
        card: "0 1px 2px rgb(9 9 11 / 0.04), 0 4px 12px rgb(9 9 11 / 0.04)",
        // Dark mode cannot use a dark shadow, so the card edge is the border.
        "card-dark": "0 1px 2px rgb(0 0 0 / 0.4)",
        // Raised surfaces: the FAB and the primary call-to-action.
        lift: "0 4px 14px rgb(9 9 11 / 0.12)",
        "lift-accent": "0 4px 14px rgb(16 185 129 / 0.32)",
      },
    },
  },
  // prettier-plugin-tailwindcss sorts classes; it is configured in
  // .prettierrc rather than here, because it is not a CSS plugin.
  plugins: [],
};