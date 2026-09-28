/**
 * Same-app redirect targets.
 *
 * The `next` query parameter is attacker-controlled — it arrives from a link
 * somebody shared. Handing it straight to the router would turn `/login?next=…`
 * into an open redirect, so the only shape accepted is a single-slash-prefixed
 * in-app path. `//evil.com` and `/\evil.com` both parse as protocol-relative
 * URLs in a browser, which is why the second character is checked too.
 */
export function safeRedirect(next: string | null | undefined, fallback = "/app"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
