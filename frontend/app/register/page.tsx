"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { AuthLink, AuthShell } from "@/components/auth-shell";
import { Button, Field, Input } from "@/components/ui";

export default function RegisterPage() {
  const { register } = useSession();
  const router = useRouter();

  const [form, setForm] = useState({
    username: "",
    displayName: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set(field: keyof typeof form) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setError("Provide an email address or a phone number");
      return;
    }

    setSubmitting(true);
    try {
      await register({
        username: form.username,
        displayName: form.displayName || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        password: form.password,
      });
      router.replace("/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Create your rider profile</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Private by design — you choose who you ride with.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">

      <Field label="Full name">
          <Input value={form.displayName} onChange={set("displayName")} placeholder="Alex Rider" maxLength={60} required />
        </Field>
        
        <Field label="Username" hint="Lowercase letters, numbers and underscores. 3–30 characters.">
          <Input
            autoFocus
            autoComplete="username"
            value={form.username}
            onChange={set("username")}
            placeholder="ptb"
            required
            minLength={3}
            maxLength={30}
          />
        </Field>
        

        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" error={!form.email.trim() && !form.phone.trim() ? "Add an email or phone" : undefined}>
            <Input type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@example.com" />
          </Field>
          <Field label="Phone (E.164)">
            <Input type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} placeholder="+15550001122" />
          </Field>
        </div>

        <Field label="Password" hint="At least 10 characters.">
          <Input type="password" autoComplete="new-password" value={form.password} onChange={set("password")} required minLength={10} />
        </Field>
        <Field label="Confirm password">
          <Input
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={set("confirm")}
            required
            minLength={10}
          />
        </Field>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
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