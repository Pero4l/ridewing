"use client";

import { useEffect } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui";

/**
 * Catches anything that escapes a page inside the signed-in shell.
 *
 * Without this, an exception during render reaches Next's built-in boundary and the
 * rider is told only that "this page couldn't load", with no way back and no clue
 * what happened. A shared post link opened in a fresh tab is exactly the kind of
 * route where the first render runs before the session is restored, so it gets its
 * own recoverable error screen rather than a dead end.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="px-4">
      <EmptyState
        title="Something went wrong here"
        description={error.message || "This screen failed to load."}
        action={
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              Try again
            </button>
            <Link href="/app" className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
              Back to the feed
            </Link>
          </div>
        }
      />
    </div>
  );
}
