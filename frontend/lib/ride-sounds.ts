"use client";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AnyAudio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AnyAudio) return null;
  if (!ctx) ctx = new AnyAudio();
  return ctx;
}

function tone(context: AudioContext, target: OscillatorType, start: number, duration: number, freq: number, volume = 0.25) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = target;
  oscillator.frequency.value = freq;
  gain.gain.setValueAtTime(volume, context.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(context.currentTime + start);
  oscillator.stop(context.currentTime + start + duration);
}

async function unlock(context: AudioContext) {
  // iOS Safari boots AudioContexts in the "suspended" state and only releases
  // them from inside a user gesture. Without an explicit resume the first tone —
  // the PTT beep, help/stop signal, or boundary cue — silently never plays, so
  // the mic/voice feedback appears dead on iPhone.
  if (context.state === "suspended") {
    await context.resume();
  }
}

/** Two rising chimes — used for "I need help". */
export async function playHelpSound() {
  const context = audio();
  if (!context) return;
  await unlock(context);
  tone(context, "sine", 0, 0.35, 880, 0.28);
  tone(context, "sine", 0.22, 0.45, 1320, 0.28);
}

/** One long low tone — used for "I've stopped". */
export async function playStopSound() {
  const context = audio();
  if (!context) return;
  await unlock(context);
  tone(context, "sine", 0, 0.6, 392, 0.28);
  tone(context, "sine", 0.6, 0.5, 523, 0.28);
}

/** A subtle confirm blip for the rider who raised the signal. */
export async function playSignalSent() {
  const context = audio();
  if (!context) return;
  await unlock(context);
  tone(context, "square", 0, 0.12, 1046, 0.12);
}

/** A pleasant two-tone chime for new notifications. */
export async function playNotificationSound() {
  const context = audio();
  if (!context) return;
  await unlock(context);
  tone(context, "sine", 0, 0.15, 523, 0.2);
  tone(context, "sine", 0.12, 0.15, 659, 0.2);
  tone(context, "sine", 0.24, 0.15, 784, 0.2);
}

/**
 * Boundary warning sounds.
 *
 * These are deliberately short and distinct, not sirens: the rider is moving
 * and must not be startled into an unsafe manoeuvre. The visual banner is the
 * primary signal; audio is a best-effort nudge and silently does nothing when
 * the browser blocks or mutes audio.
 */
export async function playBoundaryAheadSound() {
  const context = audio();
  if (!context) return;
  await unlock(context);
  tone(context, "triangle", 0, 0.18, 740, 0.22);
  tone(context, "triangle", 0.2, 0.22, 988, 0.22);
  tone(context, "triangle", 0.46, 0.3, 1319, 0.2);
}

export async function playBoundaryBehindSound() {
  const context = audio();
  if (!context) return;
  await unlock(context);
  tone(context, "triangle", 0, 0.22, 660, 0.22);
  tone(context, "triangle", 0.26, 0.26, 494, 0.22);
}

/** Used by the pre-ride "test alert sound" control. */
export async function playBoundaryTestSound() {
  const context = audio();
  if (!context) return;
  await unlock(context);
  tone(context, "sine", 0, 0.2, 880, 0.2);
  tone(context, "sine", 0.28, 0.2, 660, 0.2);
  tone(context, "sine", 0.56, 0.25, 880, 0.2);
}