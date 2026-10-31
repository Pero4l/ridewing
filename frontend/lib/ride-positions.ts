import type { RidePosition } from "./types";

/**
 * One primary group position per rider.
 *
 * LEAD_RIDER and SWEEPER define the two live boundaries, so the backend keeps
 * them unique. The labels are kept here rather than repeated in the page, map
 * and roster so a new role is added in one place.
 */
export const RIDE_POSITIONS: { value: RidePosition; label: string; short: string }[] = [
  { value: "LEAD_RIDER", label: "Lead Rider", short: "Lead" },
  { value: "ASSISTANT_ROAD_CAPTAIN", label: "Assistant Road Captain", short: "Asst captain" },
  { value: "ROAD_MARSHAL", label: "Road Marshal", short: "Marshal" },
  { value: "SWEEPER", label: "Sweeper", short: "Sweeper" },
  { value: "NAVIGATION_OFFICER", label: "Navigation Officer", short: "Navigation" },
  { value: "SAFETY_OFFICER", label: "Safety Officer", short: "Safety" },
  { value: "SUPPORT_RECOVERY_RIDER", label: "Support & Recovery", short: "Recovery" },
  { value: "FORMATION_RIDER", label: "Formation Rider", short: "Formation" },
];

export const POSITION_LABELS: Record<RidePosition, string> = RIDE_POSITIONS.reduce(
  (acc, entry) => ({ ...acc, [entry.value]: entry.label }),
  {} as Record<RidePosition, string>,
);

export const POSITION_SHORT_LABELS: Record<RidePosition, string> = RIDE_POSITIONS.reduce(
  (acc, entry) => ({ ...acc, [entry.value]: entry.short }),
  {} as Record<RidePosition, string>,
);

export function positionLabel(position: RidePosition | null | undefined): string {
  if (!position) return "Formation Rider";
  return POSITION_LABELS[position] ?? "Formation Rider";
}

export function positionShortLabel(position: RidePosition | null | undefined): string {
  if (!position) return "Formation";
  return POSITION_SHORT_LABELS[position] ?? "Formation";
}

export function positionTone(
  position: RidePosition | null | undefined,
): "green" | "amber" | "blue" | "zinc" {
  if (position === "LEAD_RIDER") return "green";
  if (position === "SWEEPER") return "amber";
  if (position === "FORMATION_RIDER" || !position) return "zinc";
  return "blue";
}

/** Marhal roles that should hear about a boundary event (mirrors the backend). */
export const LEADERSHIP_POSITIONS = new Set<RidePosition>([
  "LEAD_RIDER",
  "ASSISTANT_ROAD_CAPTAIN",
  "ROAD_MARSHAL",
  "SWEEPER",
  "SAFETY_OFFICER",
]);
