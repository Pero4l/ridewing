"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { AuthLink, AuthShell } from "@/components/auth-shell";
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

  if (phone && !/^(\+[1-9]\d{6,18}|\d{7,15})$/.test(phone.replace(/[\s()-]/g, ""))) {
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
  const { register } = useSession();
  const router = useRouter();
  const toast = useToast();

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
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        password: form.password,
      });
      toast.success("Welcome to RideWing! Your account is ready.");
      router.replace("/app");
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
            placeholder="Alex Rider"
            maxLength={60}
            invalid={Boolean(errors.displayName)}
          />
        </Field>

        <Field label="Username" hint="2–30 characters. Lowercase letters, numbers and underscores." error={errors.username}>
          <Input
            autoFocus
            autoComplete="username"
            value={form.username}
            onChange={set("username")}
            placeholder="alexrider"
            maxLength={30}
            invalid={Boolean(errors.username)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" error={errors.email}>
            <Input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={set("email")}
              placeholder="you@example.com"
              invalid={Boolean(errors.email)}
            />
          </Field>
          <Field label="Phone (optional)" error={errors.phone}>
            <Input
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={set("phone")}
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