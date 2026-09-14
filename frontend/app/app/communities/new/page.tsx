"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Button, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { BackIcon } from "@/components/icons";
import { ImageUploadField } from "@/components/media-upload";

export default function NewCommunityPage() {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [image, setImage] = useState("");
  const [joinPolicy, setJoinPolicy] = useState<"open" | "request">("request");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { community } = await api.post<{ community: { slug: string } }>("/api/communities", {
        name,
        bio: bio.trim() || undefined,
        image: image.trim() || undefined,
        joinPolicy,
      });
      toast.success("Community created");
      router.replace(`/app/communities/${community.slug}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the community");
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
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">New community</h1>
      </PageHeader>

      <form onSubmit={onSubmit} className="space-y-4 px-4 pb-8 pt-4">
        <Field label="Name" hint="3–80 characters.">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Canyon Carvers" required minLength={3} maxLength={80} />
        </Field>
        <Field label="Description">
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Who rides here and why?" maxLength={1000} />
        </Field>
        <ImageUploadField label="Cover image" value={image} onChange={setImage} aspect="wide" hint="Wide banner — JPEG, PNG or WebP up to 10 MB." />
        <Field label="Who can join?" hint="Request means riders ask and a moderator approves.">
          <Select value={joinPolicy} onChange={(e) => setJoinPolicy(e.target.value as "open" | "request")}>
            <option value="request">Request to join</option>
            <option value="open">Anyone can join</option>
          </Select>
        </Field>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}

        <Button type="submit" full loading={submitting}>
          Create community
        </Button>
      </form>
    </div>
  );
}