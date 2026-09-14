"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Button, Field, Input, PageHeader, Select } from "@/components/ui";
import { BackIcon } from "@/components/icons";
import type { Ride } from "@/lib/types";

export default function NewRidePage() {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState("");
  const [voiceMode, setVoiceMode] = useState<"ptt" | "open">("ptt");
  const [maxParticipants, setMaxParticipants] = useState("8");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const max = Number(maxParticipants);
      const res = await api.post<{ ride: Ride }>("/api/rides", {
        name,
        voiceMode,
        maxParticipants: Number.isFinite(max) && max >= 2 ? max : undefined,
      });
      toast.success("Ride created — share the invite code");
      router.replace(`/app/rides/${res.ride.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the ride");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader>
        <button
          type="button"
          onClick={() => router.back()}
          className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Back"
        >
          <BackIcon size={18} />
        </button>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Start a ride</h1>
      </PageHeader>

      <form onSubmit={onSubmit} className="space-y-4 px-4 pb-8 pt-4">
        <Field label="Ride name" hint="3–80 characters. Make it something riders will recognise.">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunday Canyon Run" required minLength={3} maxLength={80} />
        </Field>
        <Field label="Voice mode" hint="PTT is quieter in a group; open mic is always-on until you mute.">
          <Select value={voiceMode} onChange={(e) => setVoiceMode(e.target.value as "ptt" | "open")}>
            <option value="ptt">Push to talk</option>
            <option value="open">Open mic</option>
          </Select>
        </Field>
        <Field label="Max participants">
          <Input type="number" min={2} max={8} value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} />
        </Field>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}

        <Button type="submit" full loading={submitting}>
          Start ride
        </Button>
      </form>
    </div>
  );
}