"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { Badge, Button, EmptyState, Field, Input, PageHeader, SectionTitle, Textarea } from "@/components/ui";
import { InlineSpinner } from "@/components/spinner";
import { timeAgo } from "@/lib/format";
import { SupportIcon } from "@/components/icons";
import type { SupportTicket } from "@/lib/types";

function TicketRow({ ticket }: { ticket: SupportTicket }) {
  const resolved = ticket.status === "resolved";
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{ticket.subject}</h3>
        <Badge tone={resolved ? "green" : "amber"}>{resolved ? "Resolved" : "Open"}</Badge>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{ticket.body}</p>
      <div className="mt-2.5 flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
        <span>{timeAgo(ticket.createdAt)}</span>
        {resolved && (
          <>
            <span aria-hidden>·</span>
            <span>
              Resolved {timeAgo(ticket.resolvedAt)}{ticket.resolver ? ` by ${ticket.resolver.displayName ?? ticket.resolver.username}` : ""}
            </span>
          </>
        )}
      </div>
      {resolved && ticket.resolutionNote ? (
        <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <span className="font-semibold">Reply: </span>
          {ticket.resolutionNote}
        </p>
      ) : null}
    </div>
  );
}

function AdminQueueRow({
  ticket,
  note,
  resolving,
  onNote,
  onResolve,
}: {
  ticket: SupportTicket;
  note: string;
  resolving: boolean;
  onNote: (value: string) => void;
  onResolve: () => void;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{ticket.subject}</h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {ticket.creator?.displayName ?? "Someone"} · @{ticket.creator?.username ?? "unknown"} · {timeAgo(ticket.createdAt)}
          </p>
        </div>
        <Badge tone="amber">Open</Badge>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{ticket.body}</p>
      <div className="mt-3 space-y-2">
        <Textarea
          value={note}
          placeholder="Resolution note (optional)"
          maxLength={1000}
          rows={2}
          className="min-h-0"
          onChange={(e) => onNote(e.target.value)}
        />
        <Button variant="secondary" size="sm" loading={resolving} onClick={onResolve} className="w-full">
          Mark as resolved
        </Button>
      </div>
    </div>
  );
}

export default function SupportPage() {
  const { user } = useSession();
  const toast = useToast();
  const isAdmin = user?.role === "admin";

  const [mine, setMine] = useState<SupportTicket[] | null>(null);
  const [queue, setQueue] = useState<SupportTicket[] | null>(null);
  const [history, setHistory] = useState<SupportTicket[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [resolvingTicketId, setResolvingTicketId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const loadMine = useCallback(async (silent = false) => {
    try {
      const res = await api.get<{ tickets: SupportTicket[] }>("/api/support/tickets");
      setMine(res.tickets);
      setError(null);
    } catch (err) {
      if (!silent) setError(err instanceof ApiError ? err.message : "Could not load your tickets");
    }
  }, []);

  const loadAdmin = useCallback(async (silent = false) => {
    try {
      const [open, resolved] = await Promise.all([
        api.get<{ tickets: SupportTicket[] }>("/api/support/admin/tickets?status=open"),
        api.get<{ tickets: SupportTicket[] }>("/api/support/admin/tickets?status=resolved"),
      ]);
      setQueue(open.tickets);
      setHistory(resolved.tickets);
      setError(null);
    } catch (err) {
      if (!silent) setError(err instanceof ApiError ? err.message : "Could not load the admin queue");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ tickets: SupportTicket[] }>("/api/support/tickets");
        if (!cancelled) setMine(res.tickets);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load your tickets");
      }
      if (isAdmin) await loadAdmin();
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadMine(true);
        if (isAdmin) void loadAdmin(true);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post("/api/support/tickets", { subject, body });
      toast.success("Ticket submitted");
      setSubject("");
      setBody("");
      setShowNew(false);
      void loadMine();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not submit the ticket");
    } finally {
      setSubmitting(false);
    }
  }

  async function resolve(ticketId: string) {
    if (resolvingTicketId) return;
    setResolvingTicketId(ticketId);
    try {
      const note = notes[ticketId];
      await api.put(`/api/support/admin/tickets/${ticketId}/resolve`, note?.trim() ? { note } : {});
      toast.success("Ticket resolved");
      void loadAdmin(true);
      void loadMine(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not resolve the ticket");
      setError(err instanceof ApiError ? err.message : "Could not resolve the ticket");
    } finally {
      setResolvingTicketId(null);
    }
  }

  const loading = mine === null || (isAdmin && queue === null);

  if (loading) {
    return (
      <div>
        <PageHeader>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Support</h1>
        </PageHeader>
        <div className="grid min-h-40 place-items-center">
          <InlineSpinner />
        </div>
      </div>
    );
  }

  const queueTickets = queue ?? [];

  return (
    <div>
      <PageHeader>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Support</h1>
        <Button variant="secondary" size="sm" onClick={() => setShowNew((open) => !open)}>
          {showNew ? "Cancel" : "New ticket"}
        </Button>
      </PageHeader>

      {error && (
        <p role="alert" className="mx-4 my-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}

      {showNew && (
        <form onSubmit={onSubmit} className="space-y-3 px-4 pb-4">
          <Field label="Subject" hint="3–120 characters. What is this about?">
            <Input
              autoFocus
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="I cannot join a ride"
              required
              minLength={3}
              maxLength={120}
            />
          </Field>
          <Field label="Description" hint="The more detail, the faster we can help.">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Tell us what happened…"
              required
              maxLength={5000}
              rows={5}
            />
          </Field>
          {formError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
              {formError}
            </p>
          )}
          <Button type="submit" full loading={submitting}>
            Submit ticket
          </Button>
        </form>
      )}

      <div className="space-y-2 px-4 pb-8 pt-1">
        {mine.length === 0 ? (
          <EmptyState
            icon={<SupportIcon size={28} />}
            title="No tickets yet"
            description="Something not working? Send us a ticket and an admin will take a look."
            action={
              <Button variant="secondary" size="sm" onClick={() => setShowNew(true)}>
                New ticket
              </Button>
            }
          />
        ) : (
          mine.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)
        )}

        {isAdmin && (
          <div className="pt-6">
            <SectionTitle>Admin queue</SectionTitle>
            <div className="mt-3 space-y-3">
              {queueTickets.length === 0 ? (
                <EmptyState title="Queue is clear" description="No open tickets right now." />
              ) : (
                queueTickets.map((ticket) => (
                  <AdminQueueRow
                    key={ticket.id}
                    ticket={ticket}
                    note={notes[ticket.id] ?? ""}
                    resolving={resolvingTicketId === ticket.id}
                    onNote={(value) => setNotes((current) => ({ ...current, [ticket.id]: value }))}
                    onResolve={() => resolve(ticket.id)}
                  />
                ))
              )}
            </div>

            {history.length > 0 && (
              <div className="mt-6">
                <SectionTitle>Recently resolved</SectionTitle>
                <div className="mt-3 space-y-3">
                  {history.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}