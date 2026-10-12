/* eslint-disable react-hooks/set-state-in-effect --
 * This screen loads data on mount. The effect only *starts* an async fetch; the
 * state updates it triggers all land after an `await`, so there is no synchronous
 * setState during render. The rule cannot see across the async boundary.
 */
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBanner } from "@/components/auth";
import {
  Badge,
  Button,
  Card,
  Divider,
  Field,
  Screen,
  Spinner,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { usePalette } from "@/lib/palette";
import type { SupportTicket } from "@/lib/types";

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = usePalette();

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
      await api.post("/api/support/tickets", {
        subject: subject.trim(),
        body: body.trim(),
      });
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
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16 },
        ]}
      >
        {/* ── Large title ─────────────────────────────────────────────── */}
        <T size={32} weight="800" style={styles.pageTitle}>
          Support
        </T>

        {/* ══ CONTACT FORM ═════════════════════════════════════════════ */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <T size={16} weight="700">
              Contact us
            </T>
            <T size={13} tone="muted" style={styles.cardSubtitle}>
              Ride problems, account questions or anything that needs a human.
            </T>
          </View>

          <View style={styles.fieldStack}>
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
              style={styles.bodyField}
            />
          </View>

          <ErrorBanner message={error} />

          <Button
            label="Send message"
            onPress={submit}
            loading={busy}
            disabled={!ready}
          />
        </Card>

        {/* ══ TICKET HISTORY ═══════════════════════════════════════════ */}
        <T size={11} weight="700" style={[styles.sectionLabel, { color: colors.muted }]}>
          YOUR TICKETS
        </T>

        <Card padded={false} style={styles.card}>
          {loading ? (
            <View style={styles.spinnerWrap}>
              <Spinner label="Loading tickets" />
            </View>
          ) : tickets.length === 0 ? (
            <View style={styles.emptyWrap}>
              <T size={13} tone="muted">
                You have not contacted us yet.
              </T>
            </View>
          ) : (
            tickets.map((ticket, index) => (
              <View key={ticket.id}>
                {index > 0 ? <Divider /> : null}
                <TicketRow ticket={ticket} colors={colors} />
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

// ── TicketRow ────────────────────────────────────────────────────────────────

function TicketRow({
  ticket,
  colors,
}: {
  ticket: SupportTicket;
  colors: ReturnType<typeof usePalette>["colors"];
}) {
  return (
    <View style={styles.ticketRow}>
      {/* Subject + status badge */}
      <View style={styles.ticketHeader}>
        <T size={14} weight="600" numberOfLines={2} style={styles.ticketSubject}>
          {ticket.subject}
        </T>
        <Badge
          label={ticket.status === "open" ? "OPEN" : "RESOLVED"}
          tone={ticket.status === "open" ? "accent" : "muted"}
        />
      </View>

      {/* Body preview */}
      <T size={13} tone="muted" numberOfLines={2} style={styles.ticketBody}>
        {ticket.body}
      </T>

      {/* Resolution note */}
      {ticket.resolutionNote ? (
        <View style={[styles.resolutionBox, { backgroundColor: colors.accentSoft }]}>
          <T size={13} style={{ color: colors.success }}>
            Reply: {ticket.resolutionNote}
          </T>
        </View>
      ) : null}

      {/* Timestamp */}
      <T size={11} tone="muted" style={styles.ticketTime}>
        Opened {relativeTime(ticket.createdAt)}
        {ticket.resolvedAt
          ? ` · Resolved ${relativeTime(ticket.resolvedAt)}`
          : null}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 48,
    gap: 4,
  },
  pageTitle: {
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  card: {
    gap: 0,
  },
  cardHeader: {
    gap: 4,
    marginBottom: 16,
  },
  cardSubtitle: {
    marginTop: 2,
  },
  fieldStack: {
    gap: 12,
    marginBottom: 12,
  },
  bodyField: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  sectionLabel: {
    marginBottom: 6,
    marginTop: 24,
    marginLeft: 4,
    letterSpacing: 0.6,
  },
  spinnerWrap: {
    paddingVertical: 8,
  },
  emptyWrap: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  ticketRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  ticketHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  ticketSubject: {
    flex: 1,
  },
  ticketBody: {
    lineHeight: 19,
  },
  resolutionBox: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 2,
  },
  ticketTime: {
    marginTop: 2,
  },
});
