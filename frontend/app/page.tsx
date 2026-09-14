import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "RideWing — Ride with riders you trust",
  description:
    "RideWing is a private ride network for motorcycle riders: live group voice, location-aware chat, trusted communities and a rider feed.",
};

export default function Home() {
  return (
    <main className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <Header />

      <Hero />
      <Features />
      <HowItWorks />
      <Testimonials />
      <FinalCta />
      <Footer />

      <div className="pointer-events-none fixed inset-x-0 top-0 z-10 h-40 bg-gradient-to-b from-white/70 to-transparent dark:from-zinc-950/70" />
    </main>
  );
}

function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.5c1.6 2.6 3.4 4.2 6 5.5-.7 4.2-3.1 7.2-6 8.4-2.9-1.2-5.3-4.2-6-8.4 2.6-1.3 4.4-2.9 6-5.5Z" opacity="0.92" />
      <path d="M3 17.5c1.9-.4 3.6-.2 5.2.5C9.7 19 11 20.2 12 22c1-1.8 2.3-3 3.8-4 1.6-.7 3.3-.9 5.2-.5-.8 2.3-2.1 4-4.5 4.5-1.3 1.2-3 2-4.5 2.5-1.5-.5-3.2-1.3-4.5-2.5C5.1 21.5 3.8 19.8 3 17.5Z" />
    </svg>
  );
}

function Header() {
  return (
    <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/25">
          <Logo className="h-5 w-5" />
        </span>
        RideWing
      </Link>
      <nav className="hidden items-center gap-7 text-sm font-medium text-zinc-600 dark:text-zinc-400 md:flex">
        <a href="#features" className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">Features</a>
        <a href="#how" className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">How it works</a>
        <a href="#stories" className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">Riders</a>
      </nav>
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition-colors hover:bg-emerald-500"
        >
          Get started
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 pt-16 pb-24 text-center md:pt-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(55%_70%_at_50%_0%,rgb(16_185_129/0.14),transparent)]" />
      <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-600/20 bg-emerald-600/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        Built for riders you trust
      </p>
      <h1 className="mx-auto mt-6 max-w-3xl text-4xl leading-[1.1] font-bold tracking-tight text-balance md:text-6xl">
        Ride together.
        <br />
        <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent dark:from-emerald-400 dark:to-teal-300">
          Never ride alone.
        </span>
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
        RideWing is a private network for motorcycle riders. Spin up a live voice
        ride with one tap, keep the chatter in trusted communities, and follow the
        riders who share your roads.
      </p>
      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/register"
          className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-600 px-7 text-base font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all hover:bg-emerald-500 sm:w-auto"
        >
          Start riding free
        </Link>
        <Link
          href="/login"
          className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-zinc-300 bg-white px-7 text-base font-semibold text-zinc-800 shadow-xs transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:w-auto"
        >
          Sign in
        </Link>
      </div>
      <p className="mt-6 text-xs text-zinc-400 dark:text-zinc-500">
        Free to join · No ads · Your data stays yours
      </p>
    </section>
  );
}

type Feature = { icon: ReactNode; title: string; body: string };

function Features() {
  const features: Feature[] = [
    {
      icon: <MicGlyph />,
      title: "Live voice rides",
      body: "Open a ride and every rider hears each other instantly over a low-latency voice channel. PTT or open mic — your call.",
    },
    {
      icon: <CommunityGlyph />,
      title: "Trusted communities",
      body: "Private groups with moderation and verified profiles. Join crews that ride your routes, not a cacophony of strangers.",
    },
    {
      icon: <ChatGlyph />,
      title: "Chat while you cruise",
      body: "Direct DMs and group chats with read receipts. Talk is optional; the group chat always has the plan.",
    },
    {
      icon: <FeedGlyph />,
      title: "A feed for the road",
      body: "Photos, route notes and banter from the riders you follow — short posts, real riding, zero noise.",
    },
    {
      icon: <VerifyGlyph />,
      title: "Who's actually there",
      body: "Email-verified profiles and live rosters on every ride. You always know who is riding with you.",
    },
    {
      icon: <LockGlyph />,
      title: "Private by design",
      body: "Password-hashed, cookie-backed sessions and scoped tokens. No social graph sold to anyone, ever.",
    },
  ];

  return (
    <section id="features" className="border-t border-zinc-200/70 bg-white py-20 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Features"
          title="Everything between ride-outs"
          body="RideWing stays out of the way until the road calls — then it's your comms."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm shadow-zinc-950/[0.03] transition-all hover:-translate-y-0.5 hover:border-emerald-500/30 hover:shadow-md hover:shadow-emerald-500/5 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none"
            >
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
                {feature.icon}
              </div>
              <h3 className="text-base font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", title: "Set up your rider profile", body: "Add your bike, a photo and your style. Verification keeps the crew real." },
    { n: "02", title: "Join communities or follow riders", body: "Find the people who ride your roads. Requests and approvals mean no randoms." },
    { n: "03", title: "Open a ride and cruise", body: "One tap starts a live voice ride with a shareable invite code. Roll out." },
  ];

  return (
    <section id="how" className="mx-auto max-w-6xl px-6 py-20">
      <SectionHeading eyebrow="How it works" title="On the road in three steps" />
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {steps.map((step) => (
          <div key={step.n} className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/60">
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{step.n}</span>
            <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Testimonials() {
  const quotes = [
    {
      name: "Maya O.",
      role: "Adventure touring",
      text: "We did a 900 km weekend with three bikes and never dropped a turn. The voice ride just works.",
    },
    {
      name: "Dev R.",
      role: "Track days",
      text: "Closed group, verified riders, and the chat actually has the plan. This is what a riding app should feel like.",
    },
    {
      name: "Sam O.",
      role: "Daily commuter",
      text: "I open a ride on my way home and my lane-splitting crew rolls together. Simple and private.",
    },
  ];

  return (
    <section id="stories" className="border-t border-zinc-200/70 bg-white py-20 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow="Riders" title="Loved on the road" />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {quotes.map((quote) => (
            <figure key={quote.name} className="flex h-full flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm shadow-zinc-950/[0.03] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
              <blockquote className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                “{quote.text}”
              </blockquote>
              <figcaption className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <p className="text-sm font-semibold">{quote.name}</p>
                <p className="text-xs text-zinc-400">{quote.role}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="relative overflow-hidden rounded-3xl bg-zinc-900 px-6 py-16 text-center text-zinc-50 shadow-xl shadow-zinc-950/20 dark:bg-zinc-900">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_100%_at_50%_0%,rgb(16_185_129/0.35),transparent)]" />
        <h2 className="relative text-3xl font-bold tracking-tight md:text-4xl">Ready to roll out?</h2>
        <p className="relative mx-auto mt-4 max-w-lg text-zinc-300">
          Create your rider profile in under a minute. It&apos;s free, and your roads
          already have a seat waiting.
        </p>
        <Link
          href="/register"
          className="relative mt-8 inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-500 px-7 text-base font-semibold text-white shadow-lg shadow-emerald-500/30 transition-colors hover:bg-emerald-400"
        >
          Create your account
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 pb-10 sm:flex-row">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-emerald-600 text-white">
          <Logo className="h-3.5 w-3.5" />
        </span>
        RideWing
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        © {new Date().getFullYear()} RideWing. Ride with the crew you trust.
      </p>
      <div className="flex items-center gap-5 text-xs text-zinc-400 dark:text-zinc-600">
        <Link href="/login" className="transition-colors hover:text-zinc-700 dark:hover:text-zinc-300">Sign in</Link>
        <Link href="/register" className="transition-colors hover:text-zinc-700 dark:hover:text-zinc-300">Join</Link>
      </div>
    </footer>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-bold tracking-widest text-emerald-600 uppercase dark:text-emerald-400">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>}
    </div>
  );
}

function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3.5" />
    </svg>
  );
}
function CommunityGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3 2.5-5 6.5-5s6.5 2 6.5 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 15.5c2.8.3 6 2 6 4.5" />
    </svg>
  );
}
function ChatGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-8 8H4l2.5-2.9A8 8 0 1 1 21 12Z" />
      <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeWidth={2.5} />
    </svg>
  );
}
function FeedGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m4 19 5.5-5.5 3 3L17 12l4 4" />
    </svg>
  );
}
function VerifyGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 2.5 2.4 1.8 3-.2 1 2.8 2.4 1.8-1 2.9 1 2.9-2.4 1.8-1 2.8-3-.2-2.4 1.8-2.4-1.8-3 .2-1-2.8-2.4-1.8 1-2.9-1-2.9 2.4-1.8 1-2.8 3 .2Z" />
      <path d="m8.5 12 2.4 2.4L15.5 9.5" />
    </svg>
  );
}
function LockGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v2.5" />
    </svg>
  );
}