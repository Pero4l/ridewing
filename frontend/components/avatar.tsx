"use client";

import type { ReactNode } from "react";
import { initialsOf } from "@/lib/format";

type AvatarProps = {
  name?: string | null;
  username?: string;
  image?: string | null;
  size?: number;
  className?: string;
};

const PALETTE = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-fuchsia-500",
];

function hueOf(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function Avatar({ name, username, image, size = 40, className = "" }: AvatarProps) {
  const seed = username ?? name ?? "?";

  if (image) {
    return (
      <img
        src={image}
        alt={username ?? name ?? ""}
        width={size}
        height={size}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`rounded-full shrink-0 grid place-items-center text-white font-semibold select-none ${hueOf(seed)} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.4) }}
    >
      {initialsOf(name, username)}
    </div>
  );
}

export function AvatarRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex items-center ${className}`}>{children}</div>;
}