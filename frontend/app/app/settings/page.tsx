"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { VerifiedBadge } from "@/components/verified-badge";
import { useSession } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/avatar";
import { Button, Card, Field, Input, PageHeader } from "@/components/ui";
import { ImageUploadField } from "@/components/media-upload";
import { SpinnerIcon } from "@/components/spinner";
import { BackIcon, BellIcon, ChevronRightIcon, MonitorIcon, MoonIcon, SunIcon, VerifiedBadgeIcon } from "@/components/icons";
import { useTheme } from "@/components/theme-provider";
import { pushSupport, subscribeToPush, unsubscribeFromPush, currentSubscription } from "@/lib/push";
import type { Theme } from "@/lib/theme";

export default function SettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, refreshUser, logout } = useSession();

  const [username, setUsername] = useState(user?.username ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [profileImage, setProfileImage] = useState(user?.profileImage ?? "");
  const [make, setMake] = useState(user?.bikeInfo?.make ?? "");
  const [model, setModel] = useState(user?.bikeInfo?.model ?? "");
  const [year, setYear] = useState(user?.bikeInfo?.year ? String(user.bikeInfo.year) : "");
  const [engineCc, setEngineCc] = useState(user?.bikeInfo?.engineCc ? String(user.bikeInfo.engineCc) : "");

  const [saving, setSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const { theme, setTheme } = useTheme();

  const [pushSupportState, setPushSupportState] = useState(() => pushSupport());
  const [pushOn, setPushOn] = useState(false);
  const [soundAlerts, setSoundAlerts] = useState(() => localStorage.getItem("ridewing:sounds") !== "off");
  const [appPrefsSaving, setAppPrefsSaving] = useState(false);

  // Track current time for username cooldown display (updates every minute)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const emailVerified = Boolean(user?.emailVerifiedAt);
  const hasEmail = Boolean(user?.email);
  const usernameChangedAt = user?.usernameChangedAt ? new Date(user.usernameChangedAt) : null;
  const canChangeUsername = !usernameChangedAt || now - usernameChangedAt.getTime() >= 7 * 24 * 60 * 60 * 1000;
  const nextChangeDate = usernameChangedAt ? new Date(usernameChangedAt.getTime() + 7 * 24 * 60 * 60 * 1000) : null;

  // Sections start collapsed; expandables open only when the owner taps them and
  // re-close after a save, so the page never auto-opens onto personal info.
  const [open, setOpen] = useState<"profile" | "appearance" | "password" | "preferences" | null>(null);

  // Hydrate the toggle from the device's real subscription state. The previous
  // version awaited `navigator.serviceWorker.ready`, which never resolves on a
  // device that has never subscribed, so the switch silently stayed off.
  //
  // `pushSupport()` is seeded in the state initializer rather than assigned in
  // the effect: it is a pure read of the environment, so there is no reason to
  // render a wrong answer first and correct it on the next pass.
  useEffect(() => {
    if (!pushSupport().supported) return;
    let cancelled = false;
    currentSubscription()
      .then((subscription) => {
        if (!cancelled) setPushOn(Boolean(subscription));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const APPEARANCE_OPTIONS: { value: Theme; label: string; icon: typeof SunIcon }[] = [
    { value: "light", label: "Light", icon: SunIcon },
    { value: "system", label: "System", icon: MonitorIcon },
    { value: "dark", label: "Dark", icon: MoonIcon },
  ];

  function toggleSection(section: typeof open) {
    setOpen((current) => (current === section ? null : section));
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setUsernameError(null);
    try {
      const bikeInfo = {
        make: make.trim() || undefined,
        model: model.trim() || undefined,
        year: year.trim() ? Number(year) : undefined,
        engineCc: engineCc.trim() ? Number(engineCc) : undefined,
      };
      await api.patch("/api/users/me", {
        username: username.trim().toLowerCase(),
        bio: bio.trim() || null,
        profileImage: profileImage.trim() || null,
        bikeInfo,
      });
      await refreshUser();
      setOpen("profile");
      toast.success("Profile saved");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.message.includes("username") || error.message.includes("Username")) {
          setUsernameError(error.message);
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error("Could not save profile");
      }
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

  async function togglePush(next: boolean) {
    if (appPrefsSaving) return;
    setAppPrefsSaving(true);
    try {
      const result = next ? await subscribeToPush() : await unsubscribeFromPush();
      if (result.ok) {
        setPushOn(next);
      } else {
        setPushOn(false);
        toast.error(result.message);
        setPushSupportState(pushSupport());
      }
    } finally {
      setAppPrefsSaving(false);
    }
  }

  function toggleSounds() {
    const next = !soundAlerts;
    setSoundAlerts(next);
    localStorage.setItem("ridewing:sounds", next ? "on" : "off");
  }

  function formatCooldownDate(date: Date): string {
    return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }

  return (
    <div>
      <PageHeader>
        <button type="button" onClick={() => router.back()} className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Back">
          <BackIcon size={18} />
        </button>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Settings</h1>
      </PageHeader>

      {user && (
        <div className="mb-2 flex items-center gap-3 px-4 py-3">
          <Avatar name={user.displayName ?? "@"} username={user.username ?? ""} image={user.profileImage} size={56} />
          <div className="min-w-0">
            <p className="flex items-center gap-1 truncate font-semibold text-zinc-900 dark:text-zinc-100">
              <span className="truncate">{user.displayName ?? user.username}</span>
              <VerifiedBadge user={user} size={15} />
            </p>
            <p className="truncate text-sm text-zinc-400">@{user.username}</p>
          </div>
        </div>
      )}

      <div className="space-y-2.5 px-4 pb-4 pt-1">
        <Section
          open={open === "profile"}
          onToggle={() => toggleSection("profile")}
          title="Personal information"
          hint="Username, bio, photo and your bike"
        >
          <form onSubmit={saveProfile} className="space-y-4">
            <Field label="Username" hint="Lowercase letters, numbers, underscores (2–30 chars).">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">@</span>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  maxLength={30}
                  minLength={2}
                  required
                  disabled={!canChangeUsername}
                  className="pl-7"
                />
              </div>
              {!canChangeUsername && nextChangeDate && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  You can change your username again on {formatCooldownDate(nextChangeDate)}.
                </p>
              )}
              {usernameError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">{usernameError}</p>
              )}
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
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Your bike</p>
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
            <Button type="submit" full loading={saving} disabled={!canChangeUsername && saving}>
              Save profile
            </Button>
          </form>
        </Section>

        <Section
          open={open === "appearance"}
          onToggle={() => toggleSection("appearance")}
          title="Appearance"
          hint="Light, dark or system theme"
        >
          <div className="space-y-3">
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
        </Section>

        <Section
          open={open === "password"}
          onToggle={() => toggleSection("password")}
          title="Password & security"
          hint={hasEmail ? (emailVerified ? "Email verified" : "Verify your email") : "Change your password"}
        >
          <div className="space-y-4">
            {hasEmail ? (
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
            ) : (
              <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                No email address is linked to this account.
              </p>
            )}

            <form onSubmit={changePassword} className="space-y-4">
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
          </div>
        </Section>

        <Section
          open={open === "preferences"}
          onToggle={() => toggleSection("preferences")}
          title="App preferences"
          hint="Notifications and ride alerts"
        >
          <div className="space-y-3">
            <ToggleRow
              icon={<BellIcon size={18} />}
              title="Push notifications"
              description="Ride signals, messages and mentions even when the app is closed."
              busy={appPrefsSaving}
              value={pushSupportState.supported && pushOn}
              onChange={(next) => void togglePush(next)}
            />
            {!pushSupportState.supported && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                {pushSupportState.message}
              </p>
            )}
            <ToggleRow
              icon={<BellIcon size={18} />}
              title="Ride alert sounds"
              description="Play a sound in rides when another rider needs help or stops."
              value={soundAlerts}
              onChange={toggleSounds}
            />
          </div>
        </Section>
      </div>

      <div className="px-4 pb-10 pt-2">
        <Button full variant="danger" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

function Section({ open, onToggle, title, hint, children }: { open: boolean; onToggle: () => void; title: string; hint?: string; children: ReactNode }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-4 text-left active:bg-zinc-50 dark:active:bg-zinc-800">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</span>
          {hint ? <span className="mt-0.5 block truncate text-xs text-zinc-400">{hint}</span> : null}
        </span>
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-500 transition-transform dark:bg-zinc-800 dark:text-zinc-400 ${open ? "rotate-90" : ""}`}>
          <ChevronRightIcon size={16} />
        </span>
      </button>
      {open && <div className="border-t border-zinc-100 px-4 py-4 dark:border-zinc-800">{children}</div>}
    </Card>
  );
}

function ToggleRow({ icon, title, description, value, disabled = false, busy = false, onChange }: {
  icon: ReactNode;
  title: string;
  description: string;
  value: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange: (next: boolean) => void;
}) {
  const inert = disabled || busy;
  return (
    <div className={`flex items-center gap-3 ${inert ? "opacity-60" : ""}`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
        <span className="block text-xs text-zinc-400">{description}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-busy={busy}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          value ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
        } ${disabled ? "cursor-not-allowed" : ""}`}
      >
        {busy ? (
          <span className="absolute inset-0 grid place-items-center">
            <SpinnerIcon size={14} className="mx-auto animate-spin text-white mix-blend-normal" />
          </span>
        ) : null}
        <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}