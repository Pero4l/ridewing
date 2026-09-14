"use client";

import { VerifiedBadgeIcon } from "@/components/icons";
import type { PublicUser } from "@/lib/types";

/** Blue/emerald check for riders who confirmed their email address. */
export function VerifiedBadge({ user, size = 14, className = "" }: { user: Pick<PublicUser, "emailVerifiedAt"> | null | undefined; size?: number; className?: string }) {
  if (!user?.emailVerifiedAt) return null;
  return (
    <span
      title="Verified email"
      className={`inline-flex shrink-0 items-center text-emerald-500 dark:text-emerald-400 ${className}`}
    >
      <VerifiedBadgeIcon size={size} />
    </span>
  );
}