"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { Button, Card, Field, Input, PageHeader } from "@/components/ui";
import { ImageUploadField } from "@/components/media-upload";
import { BackIcon, MonitorIcon, MoonIcon, SunIcon, VerifiedBadgeIcon } from "@/components/icons";
import { useTheme } from "@/components/theme-provider";
import type { Theme } from "@/lib/theme";

export default function SettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, refreshUser, logout } = useSession();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [profileImage, setProfileImage] = useState(user?.profileImage ?? "");
  const [make, setMake] = useState(user?.bikeInfo?.make ?? "");
  const [model, setModel] = useState(user?.bikeInfo?.model ?? "");
  const [year, setYear] = useState(user?.bikeInfo?.year ? String(user.bikeInfo.year) : "");
  const [engineCc, setEngineCc] = useState(user?.bikeInfo?.engineCc ? String(user.bikeInfo.engineCc) : "");

  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const { theme, setTheme } = useTheme();

  const emailVerified = Boolean(user?.emailVerifiedAt);
  const hasEmail = Boolean(user?.email);

  const APPEARANCE_OPTIONS: { value: Theme; label: string; icon: typeof SunIcon }[] = [
    { value: "light", label: "Light", icon: SunIcon },
    { value: "system", label: "System", icon: MonitorIcon },
    { value: "dark", label: "Dark", icon: MoonIcon },
  ];

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const bikeInfo = {
        make: make.trim() || undefined,
        model: model.trim() || undefined,
        year: year.trim() ? Number(year) : undefined,
        engineCc: engineCc.trim() ? Number(engineCc) : undefined,
      };
      await api.patch("/api/users/me", {
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        profileImage: profileImage.trim() || null,
        bikeInfo,
      });
      await refreshUser();
      toast.success("Profile saved");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  async function sendVerificationEmail() {
    setVerifying(true);
    try {
      await api.post("/api/auth/send-verification");
      toast.success(`Verification email sent to ${user?.email}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not send verification email");
    } finally {
      setVerifying(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }
    if (newPassword.length < 10) {
      setPasswordError("New password must be at least 10 characters");
      return;
    }
    setChanging(true);
    try {
      await api.post("/api/auth/change-password", {
        currentPassword,
        newPassword,
      });
      toast.success("Password changed — signing you out");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => void logout(), 800);
    } catch (error) {
      setPasswordError(error instanceof ApiError ? error.message : "Could not change password");
    } finally {
      setChanging(false);
    }
  }

  return (
    <div>
      <PageHeader>
        <button type="button" onClick={() => router.back()} className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Back">
          <BackIcon size={18} />
        </button>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Settings</h1>
      </PageHeader>

      <form onSubmit={saveProfile} className="space-y-4 px-4 pb-4 pt-3">
        <Field label="Display name">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} required />
        </Field>
        <Field label="Bio" hint="Short and salty — up to 500 characters.">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            placeholder="Roads, lean angles, coffee stops…"
          />
        </Field>
        <ImageUploadField
          label="Profile photo"
          value={profileImage}
          onChange={setProfileImage}
          hint="Square image works best — JPEG, PNG or WebP up to 10 MB."
        />
        <SectionLabel>Your bike</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Make">
            <Input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Kawasaki" maxLength={40} />
          </Field>
          <Field label="Model">
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ninja 400" maxLength={40} />
          </Field>
          <Field label="Year">
            <Input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="2024" inputMode="numeric" />
          </Field>
          <Field label="Engine cc">
            <Input value={engineCc} onChange={(e) => setEngineCc(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="399" inputMode="numeric" />
          </Field>
        </div>

        <Button type="submit" full loading={saving} disabled={!user}>
          Save profile
        </Button>
      </form>

      <div className="mx-4 my-5 h-px bg-zinc-200/70 dark:bg-zinc-800" />

      <div className="space-y-3 px-4 pb-4">
        <SectionLabel>Appearance</SectionLabel>
        <Card padded={false}>
          <div className="grid grid-cols-3 gap-1.5 p-1.5">
            {APPEARANCE_OPTIONS.map(({ value, label, icon: Icon }) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  aria-pressed={active}
                  className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-xs font-semibold transition-all ${
                    active
                      ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 dark:bg-emerald-500 dark:text-emerald-950"
                      : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  <Icon size={20} />
                  {label}
                </button>
              );
            })}
          </div>
        </Card>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">System follows your device&apos;s theme. Your choice is saved on this device.</p>
      </div>

      {hasEmail && (
        <>
          <div className="mx-4 my-5 h-px bg-zinc-200/70 dark:bg-zinc-800" />
          <div className="space-y-3 px-4 pb-4">
            <SectionLabel>Email verification</SectionLabel>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {emailVerified ? (
                      <span className="inline-flex items-center gap-1.5">
                        <VerifiedBadgeIcon size={16} className="text-emerald-500 dark:text-emerald-400" />
                        Email verified
                      </span>
                    ) : (
                      "Verify your email"
                    )}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">
                    {emailVerified
                      ? "Your verified badge shows next to your name, and you can join any community."
                      : "Confirm your inbox so other riders know you're real."}
                  </p>
                </div>
                {!emailVerified && (
                  <Button size="sm" onClick={() => void sendVerificationEmail()} loading={verifying}>
                    {verifying ? "Sending…" : "Send email"}
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      <div className="mx-4 my-5 h-px bg-zinc-200/70 dark:bg-zinc-800" />

      <form onSubmit={changePassword} className="space-y-4 px-4 pb-4">
        <SectionLabel>Change password</SectionLabel>
        <Field label="Current password">
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
        </Field>
        <Field label="New password" hint="At least 10 characters.">
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" />
        </Field>
        {passwordError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {passwordError}
          </p>
        )}
        <Button type="submit" full variant="secondary" loading={changing}>
          Update password
        </Button>
      </form>

      <div className="px-4 pb-10 pt-2">
        <Button full variant="danger" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{children}</p>;
}