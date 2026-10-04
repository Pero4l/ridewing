/**
 * Brand assets, derived from `public/ridewinglogo.png` by
 * `scripts/generate-icons.mjs`. Nothing here is hand-drawn: the wing SVG that used
 * to stand in for the logo is gone, because it was never the real thing.
 *
 * One constraint drives every placement below. Both logos are *white* artwork
 * with green or amber accents, so they only read against a dark surface — drop
 * the full lockup on the app's light background and the wordmark disappears
 * entirely. That is why the full logo always sits on its own dark plate here
 * rather than straight onto a page.
 *
 * The small icon uses only the mark's green wing blades, which are solid enough
 * to survive a 32px header and a 16px browser tab where the full mark smears.
 */

const GRANDCREST_URL = "https://grandcrest.vercel.app";

/** The near-black the logo plates use; matches `bg-[#101312]` in the CSS. */
const PLATE_CLASS = "bg-[#101312]";

/**
 * The square app mark: green wing blades on a dark plate.
 *
 * This is the one that works at every size the app needs — header, tab icon,
 * home screen, push notification — so it is what every compact slot uses.
 */
export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ring-white/10 ${PLATE_CLASS} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ridewing-blades.png" alt="" aria-hidden className="w-[74%] object-contain" />
    </span>
  );
}

/**
 * The full logo — mark, RIDEWING wordmark and tagline — on a dark plate.
 *
 * For the places with room to be read properly: the signed-out auth screens and
 * the landing hero. Sized by width because the artwork is 429×225, so a width
 * keeps the proportions without the caller having to know that.
 */
export function BrandLockup({ className = "w-60" }: { className?: string }) {
  return (
    // `flex`, not `inline-flex`: the plate is a block in the flow so that whatever
    // follows it starts on the next line. Left inline it sits shoulder to
    // shoulder with the next element instead of stacking above it.
    <span
      className={`flex items-center justify-center overflow-hidden rounded-2xl px-6 py-5 ring-1 ring-white/10 ${PLATE_CLASS} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ridewing-lockup.png" alt="RideWing" className="w-full" />
    </span>
  );
}

/**
 * "Built by Grandcrest Technology", linking to the company that built RideWing.
 *
 * An outbound link, so it opens in a new tab and carries `rel="noopener
 * noreferrer"` — without `noopener` the opened page gets a handle on this one
 * via `window.opener`.
 */
export function GrandcrestCredit({ className = "" }: { className?: string }) {
  return (
    <a
      href={GRANDCREST_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-2 text-xs text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-200 ${className}`}
    >
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-lg ring-1 ring-white/10 ${PLATE_CLASS}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/grandcrest1.png" alt="" aria-hidden className="w-[80%] object-contain" />
      </span>
      <span>
        Built by{" "}
        <span className="font-semibold text-zinc-700 underline-offset-2 group-hover:underline dark:text-zinc-300">
          Grandcrest Technology
        </span>
      </span>
    </a>
  );
}

/** Wordmark text, for slots that pair the square mark with a name. */
export function BrandName({ className = "" }: { className?: string }) {
  return <span className={`font-bold tracking-tight ${className}`}>RideWing</span>;
}
