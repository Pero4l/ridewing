"use client";

import { useState, type FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { AuthLink, AuthShell } from "@/components/auth-shell";
import { safeRedirect } from "@/lib/redirect";
import { Button, Field, Input, PasswordInput } from "@/components/ui";

type FormState = {
  username: string;
  displayName: string;
  email: string;
  phone: string;
  password: string;
  confirm: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const USERNAME_RE = /^[a-z0-9_]+$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Matches the separators the API strips, so the hint and the rule agree. */
const PHONE_SEPARATORS = /[\s()-]/g;

/**
 * Phone numbers are stored digits-only. Someone typing "0903 123 4567" or
 * "(0903) 123-4567" should not be told their own number is invalid, so the
 * client normalizes with the same rule the server applies.
 */
function normalizePhone(value: string): string {
  return value.trim().replace(PHONE_SEPARATORS, "");
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  const username = form.username.trim().toLowerCase();
  const email = form.email.trim();
  const phone = form.phone.trim();

  if (!form.displayName.trim()) {
    errors.displayName = "Full name is required";
  } else if (form.displayName.trim().length > 60) {
    errors.displayName = "Full name must be at most 60 characters";
  }

  if (!username) {
    errors.username = "Username is required";
  } else if (username.length < 2) {
    errors.username = "Username must be at least 2 characters";
  } else if (username.length > 30) {
    errors.username = "Username must be at most 30 characters";
  } else if (!USERNAME_RE.test(username)) {
    errors.username = "Only lowercase letters, numbers and underscores are allowed";
  }

  if (!email && !phone) {
    errors.email = "Add an email or a phone number";
  } else if (email && !EMAIL_RE.test(email)) {
    errors.email = "Enter a valid email address";
  }

  if (phone && !/^(\+[1-9]\d{6,18}|\d{7,15})$/.test(normalizePhone(phone))) {
    errors.phone = "Enter a valid phone number, e.g. 09031234567 or +14155550123";
  }

  if (!form.password) {
    errors.password = "Password is required";
  } else if (!PASSWORD_RE.test(form.password)) {
    errors.password = "6+ characters with an uppercase letter, a lowercase letter and a number";
  }

  if (!form.confirm) {
    errors.confirm = "Confirm your password";
  } else if (form.confirm !== form.password) {
    errors.confirm = "Passwords do not match";
  }

  return errors;
}

export default function RegisterPage() {
  // `useSearchParams` opts the route into client rendering, so it needs a
  // Suspense boundary or the whole build fails static generation.
  return (
    <Suspense fallback={<AuthShell><div className="min-h-40" /></AuthShell>}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const { register } = useSession();
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  // A guest who tapped "join the conversation" on a post lands here; after
  // signing up they should return to that post, not the feed.
  const redirectTo = safeRedirect(searchParams.get("next"));

  const [form, setForm] = useState<FormState>({
    username: "",
    displayName: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set(field: keyof FormState) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      setErrors((current) => ({ ...current, [field]: undefined }));
      setServerError(null);
    };
  }

  /**
   * Cleans a field once the rider leaves it, rather than rejecting the value
   * on submit. Accidental leading/trailing spaces and pasted "(0903) 123-4567"
   * are the common case here, and a visible correction is far kinder than an
   * error about a space the rider cannot see.
   */
  function normalizeOnBlur(field: "username" | "displayName" | "email" | "phone") {
    return () => {
      setForm((current) => {
        const raw = current[field];
        const next =
          field === "username"
            ? raw.trim().toLowerCase()
            : field === "phone"
              ? normalizePhone(raw)
              : raw.trim();
        return next === raw ? current : { ...current, [field]: next };
      });
    };
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setServerError(null);

    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSubmitting(true);
    try {
      await register({
        username: form.username.trim().toLowerCase(),
        displayName: form.displayName.trim(),
        email: form.email.trim().toLowerCase() || undefined,
        phone: normalizePhone(form.phone) || undefined,
        password: form.password,
      });
      toast.success("Welcome to RideWing! Your account is ready.");
      router.replace(redirectTo);
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        const fieldMap: Record<string, keyof FormState> = {
          username: "username",
          displayName: "displayName",
          email: "email",
          phone: "phone",
          password: "password",
        };
        const details = err.details as Array<{ field?: string; message?: string }>;
        const byField: FormErrors = {};
        for (const item of details) {
          const field = fieldMap[item.field ?? ""];
          if (field) byField[field] = item.message;
        }
        if (Object.keys(byField).length) {
          setErrors(byField);
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError(err instanceof ApiError ? err.message : "Registration failed. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Create your rider profile</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Your ride, your crew — join the road.</p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Full name" error={errors.displayName}>
          <Input
            value={form.displayName}
            onChange={set("displayName")}
            onBlur={normalizeOnBlur("displayName")}
            placeholder="Alex Rider"
            maxLength={60}
            invalid={Boolean(errors.displayName)}
          />
        </Field>

        <Field label="Username" hint="2–30 characters. Lowercase letters, numbers and underscores." error={errors.username}>
          <Input
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={form.username}
            onChange={set("username")}
            onBlur={normalizeOnBlur("username")}
            placeholder="alexrider"
            maxLength={30}
            invalid={Boolean(errors.username)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" error={errors.email}>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={form.email}
              onChange={set("email")}
              onBlur={normalizeOnBlur("email")}
              placeholder="you@example.com"
              invalid={Boolean(errors.email)}
            />
          </Field>
          <Field label="Phone (optional)" hint="Digits only" error={errors.phone}>
            <Input
              type="tel"
              // A numeric keypad beats a full keyboard here, and `+` is kept
              // reachable because international numbers are a first-class case.
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={set("phone")}
              onBlur={normalizeOnBlur("phone")}
              placeholder="09031234567"
              invalid={Boolean(errors.phone)}
            />
          </Field>
        </div>

        <Field label="Password" hint="6+ characters with at least one uppercase letter, one lowercase letter and one number." error={errors.password}>
          <PasswordInput
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
            invalid={Boolean(errors.password)}
          />
        </Field>
        <Field label="Confirm password" error={errors.confirm}>
          <PasswordInput
            autoComplete="new-password"
            value={form.confirm}
            onChange={set("confirm")}
            invalid={Boolean(errors.confirm)}
          />
        </Field>

        {serverError && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {serverError}
          </p>
        )}

        <Button type="submit" full loading={submitting} size="lg">
          Create account
        </Button>
      </form>

      <div className="mt-6 flex items-center justify-center">
        <AuthLink href="/login">Already have an account</AuthLink>
      </div>
    </AuthShell>
  );
}