/**
 * Client-side mirror of the backend's validation rules.
 *
 * These are duplicated on purpose — the backend is authoritative — but the app
 * needs to know them to show accurate hints and fail fast. They previously
 * drifted: the app told riders "at least 10 characters" while the API demanded an
 * uppercase letter and a number, so a perfectly reasonable password was rejected
 * on submit with no explanation.
 *
 * Source of truth: `backend/src/validators/common.validator.js`.
 */

/** Mirrors the `password` schema there: length, lower, upper, digit, ≤72 bytes. */
export const PASSWORD_MIN = 6;

export const PASSWORD_RULES = [
  { test: (v: string) => v.length >= PASSWORD_MIN, message: `at least ${PASSWORD_MIN} characters` },
  { test: (v: string) => /[a-z]/.test(v), message: "a lowercase letter" },
  { test: (v: string) => /[A-Z]/.test(v), message: "an uppercase letter" },
  { test: (v: string) => /\d/.test(v), message: "a number" },
];

export const PASSWORD_HINT = "Needs " + PASSWORD_RULES.map((r) => r.message).join(", ") + ".";

/** Returns the first unmet rule, or null when the password is acceptable. */
export function passwordProblem(value: string): string | null {
  if (new TextEncoder().encode(value).length > 72) return "too long";
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(value)) return `Password needs ${rule.message}`;
  }
  return null;
}

export function isPasswordValid(value: string): boolean {
  return passwordProblem(value) === null;
}

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 30;
export const USERNAME_HINT = "2–30 characters: lowercase letters, numbers and underscores.";
export const DISPLAY_NAME_MAX = 60;
export const BIO_MAX = 500;
export const POST_MAX = 2000;
export const COMMENT_MAX = 1000;
export const MESSAGE_MAX = 2000;
export const RIDE_NAME_MIN = 3;
export const RIDE_NAME_MAX = 80;
export const COMMUNITY_NAME_MIN = 3;
export const COMMUNITY_NAME_MAX = 80;
export const COMMUNITY_BIO_MAX = 1000;
export const SUBJECT_MAX = 120;
export const SUPPORT_BODY_MAX = 5000;