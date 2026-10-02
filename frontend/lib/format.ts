import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/en";

dayjs.extend(relativeTime);

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = dayjs(iso);
  if (!then.isValid()) return "";
  const now = dayjs();
  const diffMinutes = now.diff(then, "minute");
  if (diffMinutes < 1) return "now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = now.diff(then, "hour");
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = now.diff(then, "day");
  if (diffDays < 7) return `${diffDays}d`;
  // Instagram style: show "MMM D" for current year, "MMM D, YYYY" for past years
  if (then.year() === now.year()) {
    return then.format("MMM D");
  }
  return then.format("MMM D, YYYY");
}

export function fullDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return dayjs(iso).format("MMM D, h:mm A");
}

export function fullDateOnly(iso: string | null | undefined): string {
  if (!iso) return "";
  return dayjs(iso).format("MMM D, YYYY");
}

export function clockTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return dayjs(iso).format("h:mm A");
}

export function initialsOf(displayName: string | null | undefined, username?: string): string {
  const source = displayName?.trim() || username?.trim() || "?";
  const parts = source.split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase();
}

export function bikeLabel(bike: { make?: string; model?: string; year?: number } | null | undefined): string {
  if (!bike || (!bike.make && !bike.model)) return "";
  return [bike.year, bike.make, bike.model].filter(Boolean).join(" ");
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}