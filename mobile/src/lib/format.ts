import dayjs from "dayjs";
import relativeTimePlugin from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTimePlugin);

/** Human-friendly relative time ("3m", "2h"). */
export function relativeTime(value: string): string {
  const parsed = dayjs(value);
  if (!parsed.isValid()) return "";
  const diff = dayjs().diff(parsed, "second");
  if (diff < 45) return "just now";
  return parsed.fromNow();
}

/** For a message bubble: time today, "Yesterday", then a date. */
export function messageTime(value: string): string {
  const parsed = dayjs(value);
  if (!parsed.isValid()) return "";
  const now = dayjs();
  if (parsed.isSame(now, "day")) return parsed.format("HH:mm");
  if (parsed.isSame(now.subtract(1, "day"), "day")) return "Yesterday";
  if (parsed.isSame(now, "year")) return parsed.format("D MMM");
  return parsed.format("D MMM YYYY");
}

export function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

/** Joins a bike into something readable, skipping the parts we do not have. */
export function bikeLabel(bike: {
  make?: string;
  model?: string;
  year?: number;
  nickname?: string;
}): string | null {
  const parts = [bike.make, bike.model, bike.year ? String(bike.year) : null].filter(Boolean);
  const label = parts.join(" ");
  return bike.nickname ? (label ? `${label} "${bike.nickname}"` : bike.nickname) : label || null;
}