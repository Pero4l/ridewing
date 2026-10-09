/* eslint-disable react-hooks/set-state-in-effect --
 * This screen loads data on mount. The effect only *starts* an async fetch; the
 * state updates it triggers all land after an `await`, so there is no synchronous
 * setState during render. The rule cannot see across the async boundary.
 */
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import { ErrorBanner } from "@/components/auth";
import { Badge, Button, Card, Divider, Field, Row, Screen, Spinner, T } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type { SupportTicket } from "@/lib/types";

export default function SupportScreen() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ tickets: SupportTicket[] }>("/api/support/tickets");
      setTickets(res.tickets);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your tickets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await api.post("/api/support/tickets", { subject: subject.trim(), body: body.trim() });
      setSubject("");
      setBody("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send your message.");
    } finally {
      setBusy(false);
    }
  }

  const ready = subject.trim().length >= 3 && body.trim().length > 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Card className="gap-3.5">
          <View className="gap-1">
            <T size={16} weight="700">
              Contact us
            </T>
            <T size={13} tone="muted">
              Ride problems, account questions or anything that needs a human.
            </T>
          </View>

          <Field
            label="Subject"
            value={subject}
            onChangeText={setSubject}
            placeholder="Cannot join a ride"
            maxLength={120}
          />
          <Field
            label="What's happening?"
            value={body}
            onChangeText={setBody}
            placeholder="Tell us what you tried and what happened."
            multiline
            numberOfLines={5}
            style={{ minHeight: 110, textAlignVertical: "top" }}
          />

          <ErrorBanner message={error} />

          <Button label="Send message" onPress={submit} loading={busy} disabled={!ready} />
        </Card>

        <Card className="gap-3">
          <T size={16} weight="700">
            Your tickets
          </T>
          <Divider />

          {loading ? (
            <Spinner label="Loading tickets" />
          ) : tickets.length ? (
            tickets.map((ticket) => (
              <View key={ticket.id} className="gap-1.5">
                <Row className="justify-between">
                  <T size={14} weight="600" className="shrink">
                    {ticket.subject}
                  </T>
                  <Badge
                    label={ticket.status === "open" ? "OPEN" : "RESOLVED"}
                    tone={ticket.status === "open" ? "accent" : "muted"}
                  />
                </Row>
                <T size={13} tone="muted">
                  {ticket.body}
                </T>
                {ticket.resolutionNote ? (
                  <T size={13} className="text-success">
                    Reply: {ticket.resolutionNote}
                  </T>
                ) : null}
                <T size={11} tone="muted">
                  Opened {relativeTime(ticket.createdAt)}
                </T>
              </View>
            ))
          ) : (
            <T size={13} tone="muted">
              You have not contacted us yet.
            </T>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}