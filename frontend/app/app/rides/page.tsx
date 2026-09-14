"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-fetch";
import { useToast } from "@/components/toast";
import { RideRow } from "@/components/rows";
import { Button, Card, EmptyState, Input, PageHeader, SectionTitle } from "@/components/ui";
import { InlineSpinner } from "@/components/spinner";
import { PlusIcon, RidesIcon } from "@/components/icons";
import type { Ride } from "@/lib/types";

export default function RidesPage() {
  const router = useRouter();
  const toast = useToast();

  const rides = useApi<{ rides: Ride[] }>(() => api.get("/api/rides"), []);

  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  async function joinByCode(event: FormEvent) {
    event.preventDefault();
    if (!code.trim() || joining) return;
    setJoining(true);
    try {
      const res = await api.post<{ ride: Ride }>("/api/rides/join", { code: code.trim() });
      toast.success("Joined ride");
      router.push(`/app/rides/${res.ride.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not join ride");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div>
      <PageHeader>
        <h1 className="flex-1 text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Rides</h1>
        <Link href="/app/rides/new">
          <Button size="sm">
            <PlusIcon size={16} />
            New
          </Button>
        </Link>
      </PageHeader>

      <Card className="mx-4" padded={false}>
        <form onSubmit={joinByCode} className="flex items-center gap-2 p-3">
          <Input
            className="uppercase"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="Invite code (e.g. RIDE123)"
            maxLength={12}
            aria-label="Ride invite code"
          />
          <Button type="submit" size="sm" loading={joining} disabled={!code.trim()}>
            Join
          </Button>
        </form>
      </Card>

      <SectionTitle>Rides you can join</SectionTitle>
      {rides.loading ? (
        <div className="grid place-items-center py-14">
          <InlineSpinner />
        </div>
      ) : rides.error ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{rides.error}</p>
      ) : rides.data && rides.data.rides.length ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rides.data.rides.map((ride) => (
            <RideRow key={ride.id} ride={ride} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<RidesIcon size={32} />}
          title="Nothing running right now"
          description="Start a ride or join with an invite code from a rider you follow."
          action={
            <Link href="/app/rides/new">
              <Button size="sm">Start a ride</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}