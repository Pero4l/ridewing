import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePalette } from "@/lib/palette";
import type { PublicUser } from "@/lib/types";

/*
 * The design system, expressed in Tailwind + NativeWind.
 *
 * Rules:
 * 1. Colour comes from CSS variables via theme tokens in `tailwind.config.js`.
 * 2. Ionicons do NOT support `className` for colour — pass the `color` prop.
 * 3. Dynamic values (computed sizes, gaps) go in `style`, not `className`.
 * 4. `overflow-hidden` is the valid NativeWind overflow; `overflow-auto` does
 *    not exist in React Native.
 */

type Tone = "accent" | "danger" | "success" | "warning" | "muted";

const toneText: Record<Tone, string> = {
  accent: "text-accent",
  danger: "text-danger",
  success: "text-success",
  warning: "text-warning",
  muted: "text-muted",
};

const toneSurface: Record<Tone, string> = {
  accent: "bg-accentSoft",
  danger: "bg-dangerSoft",
  success: "bg-accentSoft",
  warning: "bg-accentSoft",
  muted: "bg-raised",
};

// ── text ────────────────────────────────────────────────────────────────────

type TProps = {
  children: ReactNode;
  size?: number;
  weight?: "400" | "500" | "600" | "700" | "800";
  tone?: Tone;
  muted?: boolean;
  numberOfLines?: number;
  className?: string;
  color?: string;
  style?: TextStyle | TextStyle[];
};

export function T({
  children,
  size = 13,
  weight = "400",
  tone,
  muted,
  numberOfLines,
  className = "",
  color,
  style,
}: TProps) {
  const weightClass = `font-${weight}`;
  const colorClass = tone ? toneText[tone] : muted ? "text-muted" : "text-ink";
  return (
    <Text
      numberOfLines={numberOfLines}
      className={`${colorClass} ${weightClass} ${className}`}
      style={[{ fontSize: size, lineHeight: Math.round(size * 1.45) }, color ? { color } : null, style]}
    >
      {children}
    </Text>
  );
}

// ── layout ──────────────────────────────────────────────────────────────────

export function Screen({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  // `overflow-hidden` is the correct NativeWind class; `overflow-auto` does not
  // exist in React Native's layout engine and is silently ignored.
  return (
    <View className={`flex-1 bg-canvas overflow-hidden ${className}`} style={style}>
      {children}
    </View>
  );
}

/**
 * A card. `padded` can be turned off when the card wraps custom content
 * (media, an avatar stack) that wants to reach the edges.
 */
export function Card({
  children,
  className = "",
  padded = true,
  style,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      className={`rounded-2xl border border-hairline bg-surface ${
        padded ? "p-4" : ""
      } ${className}`}
      style={[styles.cardShadow, style]}
    >
      {children}
    </View>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  // Use a pure View with explicit height rather than a border-based approach,
  // which can produce 2px lines due to subpixel rounding.
  return (
    <View
      className={`bg-hairline ${className}`}
      style={{ height: StyleSheet.hairlineWidth }}
    />
  );
}

export function Row({
  children,
  gap = 2,
  className = "",
  style,
}: {
  children: ReactNode;
  gap?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  // Dynamic gap values cannot be expressed as Tailwind classes (JIT only
  // generates classes it sees as static strings). Use `style` here.
  return (
    <View className={`flex-row items-center ${className}`} style={[{ gap }, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({
  children,
  action,
  className = "",
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <View className={`flex-row items-end justify-between px-4 ${className}`}>
      <T size={11} weight="700" className="uppercase tracking-wide text-muted" style={{ letterSpacing: 0.6 }}>
        {children}
      </T>
      {action}
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  right,
  safe = true,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  safe?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-row items-start justify-between gap-3 px-4 pb-3 pt-2"
      style={safe ? { paddingTop: insets.top + 10 } : undefined}
    >
      <View className="min-w-0 flex-1">
        <T size={28} weight="800" numberOfLines={1} className="tracking-tight">
          {title}
        </T>
        {subtitle ? (
          <T size={12} muted className="mt-0.5">
            {subtitle}
          </T>
        ) : null}
      </View>
      {right ? <View className="shrink-0 mt-1">{right}</View> : null}
    </View>
  );
}

// ── controls ────────────────────────────────────────────────────────────────

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  icon,
  fullWidth,
  className = "",
  style,
}: ButtonProps) {
  const { colors } = usePalette();
  const inactive = disabled || loading;

  const surface =
    variant === "primary"
      ? "bg-accent"
      : variant === "danger"
        ? "bg-danger"
        : variant === "secondary"
          ? "bg-surface border border-hairline"
          : "bg-transparent";

  const textColorClass = variant === "primary" || variant === "danger" ? "text-onAccent" : "text-ink";
  const padding = size === "sm" ? "px-3.5 py-2" : "px-5 py-3.5";

  const iconColor =
    variant === "primary" || variant === "danger"
      ? colors.onAccent
      : colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      accessibilityLabel={label}
      disabled={inactive}
      onPress={onPress}
      className={`flex-row items-center justify-center rounded-2xl ${padding} ${surface} ${
        fullWidth ? "w-full" : ""
      } active:opacity-85 ${inactive ? "opacity-50" : ""} ${className}`}
      style={[
        variant === "secondary" ? { borderWidth: StyleSheet.hairlineWidth } : null,
        variant === "primary" && !inactive
          ? {
              shadowColor: "#10B981",
              shadowOpacity: 0.3,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 3 },
              elevation: 4,
            }
          : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" || variant === "danger" ? colors.onAccent : colors.ink}
        />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={size === "sm" ? 15 : 17}
              color={iconColor}
            />
          ) : null}
          <T size={size === "sm" ? 13 : 15} weight="700" className={textColorClass}>
            {label}
          </T>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  size = 40,
  tone = "muted",
  filled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  size?: number;
  tone?: Tone;
  filled?: boolean;
}) {
  const { colors } = usePalette();

  const iconColor = filled
    ? colors.onAccent
    : tone === "accent"
      ? colors.accent
      : tone === "danger"
        ? colors.danger
        : tone === "success"
          ? colors.success
          : tone === "warning"
            ? colors.warning
            : colors.muted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{}}
      onPress={onPress}
      hitSlop={8}
      className={`items-center justify-center rounded-full active:opacity-75 ${
        filled ? "bg-accent" : "bg-raised"
      }`}
      style={{ width: size, height: size }}
    >
      <Ionicons name={icon} size={Math.round(size * 0.46)} color={iconColor} />
    </Pressable>
  );
}

type FieldProps = {
  label: string;
  error?: string | null;
  hint?: string;
} & Omit<React.ComponentProps<typeof TextInput>, "className">;

export function Field({ label, error, hint, ...props }: FieldProps) {
  const { colors } = usePalette();

  return (
    <View className="gap-1.5">
      <T size={13} weight="600" tone="muted">
        {label}
      </T>
      <TextInput
        placeholderTextColor={props.placeholderTextColor ?? colors.faint}
        {...props}
        className={`rounded-2xl border bg-surface px-4 py-3.5 text-[15px] text-ink ${
          error ? "border-danger" : "border-hairline"
        }`}
        style={[{ borderWidth: StyleSheet.hairlineWidth, textAlignVertical: "top" }, props.style as TextStyle | undefined]}
      />
      {error ? (
        <T size={12} tone="danger">
          {error}
        </T>
      ) : hint ? (
        <T size={12} tone="muted">
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  onSubmit,
  placeholder = "Search",
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
}) {
  const { colors } = usePalette();
  return (
    <View
      className="flex-row items-center gap-2 rounded-2xl border border-hairline bg-raised px-3.5 py-2.5"
      style={{ borderWidth: StyleSheet.hairlineWidth }}
    >
      <Ionicons name="search" size={16} color={colors.faint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        className="flex-1 py-0.5 text-[15px] text-ink"
        accessibilityLabel={placeholder}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={8} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={17} color={colors.faint} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 active:opacity-75 ${
        selected ? "border-accent bg-accentSoft" : "border-hairline bg-surface"
      }`}
      style={{ borderWidth: StyleSheet.hairlineWidth }}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={14}
          color={selected ? colors.accent : colors.muted}
        />
      ) : null}
      <T size={13} weight="600" tone={selected ? "accent" : "muted"}>
        {label}
      </T>
    </Pressable>
  );
}

export function ListRow({
  title,
  subtitle,
  icon,
  iconTone = "muted",
  right,
  onPress,
  danger = false,
  showChevron = true,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconTone?: Tone;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
  showChevron?: boolean;
}) {
  const { colors } = usePalette();

  const iconColor = danger
    ? colors.danger
    : iconTone === "accent"
      ? colors.accent
      : iconTone === "success"
        ? colors.success
        : iconTone === "warning"
          ? colors.warning
          : colors.muted;

  const body = (
    <View style={{ gap: 12 }} className="flex-row items-center py-3.5 px-4">
      {icon ? (
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-raised">
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
      ) : null}
      <View className="min-w-0 flex-1">
        <T size={15} weight="600" className={danger ? "text-danger" : undefined}>
          {title}
        </T>
        {subtitle ? (
          <T size={12} muted numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
      {showChevron && onPress ? (
        <Ionicons name="chevron-forward" size={16} color={colors.faint} />
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="active:bg-raised"
      android_ripple={{ color: "rgba(0,0,0,0.05)" }}
    >
      {body}
    </Pressable>
  );
}

export function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View className="items-center gap-0.5">
      <T size={20} weight="800">
        {value}
      </T>
      <T size={11} muted>
        {label}
      </T>
    </View>
  );
}

export function Banner({
  tone = "muted",
  message,
  action,
}: {
  tone?: Tone;
  message: string;
  action?: ReactNode;
}) {
  const { colors } = usePalette();
  const iconColor =
    tone === "accent"
      ? colors.accent
      : tone === "danger"
        ? colors.danger
        : tone === "success"
          ? colors.success
          : tone === "warning"
            ? colors.warning
            : colors.muted;

  return (
    <View
      className={`flex-row items-center gap-3 rounded-2xl px-3.5 py-3 ${toneSurface[tone]}`}
      style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: "transparent" }}
    >
      <Ionicons name="information-circle" size={17} color={iconColor} />
      <T size={13} className="flex-1">
        {message}
      </T>
      {action}
    </View>
  );
}

export function FAB({
  icon,
  onPress,
  label,
  offset = 22,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  offset?: number;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="absolute right-4 h-14 w-14 items-center justify-center rounded-full bg-accent active:opacity-85"
      style={[
        { bottom: insets.bottom + offset },
        {
          shadowColor: "#10B981",
          shadowOpacity: 0.4,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        },
      ]}
    >
      <Ionicons name={icon} size={26} color={colors.onAccent} />
    </Pressable>
  );
}

export function Logo({ size = 64, rounded = 20 }: { size?: number; rounded?: number }) {
  return (
    <Image
      source={require("../../assets/images/icon.png")}
      style={{ width: size, height: size, borderRadius: rounded }}
      contentFit="cover"
      transition={200}
      accessibilityLabel="RideWing"
    />
  );
}

export function Avatar({
  user,
  size = 40,
}: {
  user: Pick<PublicUser, "profileImage" | "username"> | null;
  size?: number;
}) {
  if (user?.profileImage) {
    return (
      <Image
        source={{ uri: user.profileImage }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={120}
      />
    );
  }

  const initial = (user?.username?.[0] ?? "?").toUpperCase();
  const fontSize = Math.round(size * 0.4);

  return (
    <View
      className="items-center justify-center rounded-full bg-raised"
      style={{ width: size, height: size }}
    >
      {/* Explicit layout so the text does not inherit the parent View's
          dimensions and sits centred. `lineHeight` must match `fontSize` to
          prevent the text from being nudged off-centre by the line box. */}
      <Text
        style={{
          fontSize,
          lineHeight: fontSize,
          fontWeight: "700",
          color: undefined,
          includeFontPadding: false,
          // textAlignVertical centres Android; the surrounding flex does iOS.
          textAlignVertical: "center",
          textAlign: "center",
        }}
        className="text-accent"
      >
        {initial}
      </Text>
    </View>
  );
}

export function Badge({ label, tone = "accent" }: { label: string; tone?: Tone }) {
  return (
    <View className={`self-start rounded-full px-2.5 py-0.5 ${toneSurface[tone]}`}>
      <T size={10} weight="700" tone={tone} className="uppercase" style={{ letterSpacing: 0.5 }}>
        {label}
      </T>
    </View>
  );
}

// ── states ──────────────────────────────────────────────────────────────────

export function Spinner({ label }: { label?: string }) {
  const { colors } = usePalette();
  return (
    <View className="items-center gap-2 py-8">
      <ActivityIndicator color={colors.accent} />
      {label ? (
        <T size={13} tone="muted">
          {label}
        </T>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon = "sparkles-outline",
  title,
  body,
  action,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const { colors } = usePalette();
  return (
    <View className="items-center gap-2 px-6 py-12">
      <View className="mb-2 h-16 w-16 items-center justify-center rounded-3xl bg-raised">
        <Ionicons name={icon} size={28} color={colors.accent} />
      </View>
      <T size={16} weight="700" className="text-center">
        {title}
      </T>
      {body ? (
        <T size={13} tone="muted" className="text-center">
          {body}
        </T>
      ) : null}
      {action ? <View className="mt-3">{action}</View> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="alert-circle-outline"
      title="Something went wrong"
      body={message}
      action={onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    shadowColor: "#09090B",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
