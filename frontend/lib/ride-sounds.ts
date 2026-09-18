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

/** Two rising chimes — used for "I need help". */
export function playHelpSound() {
  const context = audio();
  if (!context) return;
  tone(context, "sine", 0, 0.35, 880, 0.28);
  tone(context, "sine", 0.22, 0.45, 1320, 0.28);
}

/** One long low tone — used for "I've stopped". */
export function playStopSound() {
  const context = audio();
  if (!context) return;
  tone(context, "sine", 0, 0.6, 392, 0.28);
  tone(context, "sine", 0.6, 0.5, 523, 0.28);
}

/** A subtle confirm blip for the rider who raised the signal. */
export function playSignalSent() {
  const context = audio();
  if (!context) return;
  tone(context, "square", 0, 0.12, 1046, 0.12);
}