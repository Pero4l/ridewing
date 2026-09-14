"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { emitWithAck, onSocketEvent as _onSocketEvent } from "@/lib/socket";
import { useSession } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { VoiceRoom, type RoomPeer } from "@/lib/webrtc";
import { Avatar } from "@/components/avatar";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { InlineSpinner } from "@/components/spinner";
import { BackIcon, CheckIcon, MicIcon, MicOffIcon } from "@/components/icons";
import { VerifiedBadge } from "@/components/verified-badge";
import { bikeLabel, pluralize } from "@/lib/format";
import type { Peer, Ride } from "@/lib/types";

type JoinRideAck = {
  ok: boolean;
  error?: { message: string };
  peers?: Peer[];
  selfSocketId?: string;
};

export default function RideDetailPage({ params }: { params: Promise<{ rideId: string }> }) {
  const { rideId } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();

  const [ride, setRide] = useState<Ride | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceMode, setVoiceMode] = useState<"ptt" | "open">("ptt");
  const [roomPeers, setRoomPeers] = useState<Record<string, RoomPeer>>({});
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const roomRef = useRef<VoiceRoom | null>(null);
  const activeRef = useRef(false);

  const myId = user?.id;

  const loadRide = useCallback(async () => {
    try {
      const res = await api.get<{ ride: Ride }>(`/api/rides/${rideId}`);
      setRide(res.ride);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : "Could not load ride");
    }
  }, [rideId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ ride: Ride }>(`/api/rides/${rideId}`);
        if (cancelled) return;
        setRide(res.ride);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof ApiError ? error.message : "Could not load ride");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  // Realtime roster/presence updates from socket.
  useEffect(() => {
    const offLeft = _onSocketEvent<{ userId: string }>("ride:participant-left", ({ userId }) => {
      setRide((current) =>
        current ? { ...current, participants: (current.participants ?? []).filter((p) => p.userId !== userId) } : current,
      );
    });
    const offEnded = _onSocketEvent<{ id: string; status: string }>("ride:ended", (payload) => {
      setRide((current) => (current ? { ...current, status: "ended", endedAt: new Date().toISOString() } : current));
      if (payload.id !== rideId) return;
      exitVoice(false);
      setVoiceMessage("Ride ended by the creator");
    });
    return () => {
      offLeft();
      offEnded();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId]);

  const isParticipant = Boolean(ride && myId && ride.participants?.some((participant) => participant.userId === myId));
  const isCreator = ride?.creatorId === myId;

  function exitVoice(leaveRoom = true) {
    activeRef.current = false;
    if (leaveRoom) {
      emitWithAck<{ rideId: string }>("ride:leave", { rideId: rideId }).catch(() => {});
    }
    roomRef.current?.dispose();
    roomRef.current = null;
    setVoiceActive(false);
    setRoomPeers({});
  }

  async function enterVoice() {
    if (activeRef.current) return;
    activeRef.current = true;
    setVoiceMessage(null);

    const room = new VoiceRoom(
      rideId,
      myId ?? "",
      user?.username ?? "",
      [],
      {
        onPeersChange: (peers) => {
          if (!activeRef.current) return;
          setRoomPeers(peers);
        },
        onVoiceModeChange: (mode) => setVoiceMode(mode),
        onStatus: (message) => setVoiceMessage(message),
        onError: (message) => toast.error(message),
      },
      ride?.voiceMode ?? "ptt",
    );
    roomRef.current = room;

    const joined = await emitWithAck<{ rideId: string }, JoinRideAck>("ride:join", { rideId: rideId }).catch(
      (): JoinRideAck => ({ ok: false, error: { message: "Could not connect to voice server" } }),
    );

    if (!activeRef.current) {
      room.dispose();
      roomRef.current = null;
      return;
    }

    if (!joined.ok) {
      activeRef.current = false;
      room.dispose();
      roomRef.current = null;
      setVoiceMessage(null);
      toast.error(joined.error?.message ?? "Could not join voice");
      return;
    }

    setVoiceActive(true);
    setVoiceMode(ride?.voiceMode ?? "ptt");
    room.registerInitialPeers(joined.peers ?? []);
    await room.initialize();
  }

  async function joinRideAndEnterVoice() {
    setBusy(true);
    try {
      await api.post(`/api/rides/${rideId}/join`);
      await loadRide();
      setVoiceMode(ride?.voiceMode ?? "ptt");
      await enterVoice();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not join ride");
    } finally {
      setBusy(false);
    }
  }

  async function leaveRide() {
    setBusy(true);
    try {
      exitVoice();
      await api.post(`/api/rides/${rideId}/leave`);
      toast.success("You left the ride");
      await loadRide();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not leave ride");
    } finally {
      setBusy(false);
    }
  }

  async function endRide() {
    if (!confirm("End this ride for everyone?")) return;
    setBusy(true);
    try {
      await api.post<{ id: string; status: string }>(`/api/rides/${rideId}/end`);
      toast.success("Ride ended");
      exitVoice(false);
      await loadRide();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not end ride");
    } finally {
      setBusy(false);
    }
  }

  async function changeVoiceMode(mode: "ptt" | "open") {
    setBusy(true);
    try {
      await api.put(`/api/rides/${rideId}/voice-mode`, { voiceMode: mode });
      setVoiceMode(mode);
      // The room updates from the ride:voice-mode broadcast; nudge local gate too.
      if (roomRef.current) roomRef.current.reportVoiceMode(mode);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not change voice mode");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!ride) return;
    try {
      await navigator.clipboard.writeText(ride.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy code");
    }
  }

  useEffect(() => {
    return () => {
      activeRef.current = false;
      emitWithAck<{ rideId: string }>("ride:leave", { rideId: rideId }).catch(() => {});
      roomRef.current?.dispose();
    };
  }, [rideId]);

  if (loadError) {
    return (
      <>
        <PageHeader>
          <button type="button" onClick={() => router.push("/app/rides")} className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Back">
            <BackIcon size={18} />
          </button>
        </PageHeader>
        <EmptyState title="Ride not found" description={loadError} />
      </>
    );
  }

  if (!ride) {
    return (
      <div className="grid h-dvh place-items-center">
        <InlineSpinner />
      </div>
    );
  }

  const ended = ride.status === "ended";
  const roster = ride.participants ?? [];

  return (
    <div>
      <PageHeader>
        <button type="button" onClick={() => router.back()} className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Back">
          <BackIcon size={18} />
        </button>
        <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">Ride</span>
        {ended && (
          <span className="ml-auto">
            <Badge tone="red">Ended</Badge>
          </span>
        )}
      </PageHeader>

      <div className="px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{ride.name}</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              by {ride.creator?.displayName ?? "a rider"} · {pluralize(roster.length, "rider")} · {ride.voiceMode} mic
            </p>
          </div>
          <Card padded={false} className="overflow-hidden">
            <button onClick={copyCode} className="flex flex-col items-center gap-0.5 px-4 py-2.5 active:bg-zinc-50 dark:active:bg-zinc-800">
              <span className="flex items-center gap-1 text-base font-bold tracking-widest text-zinc-900 dark:text-zinc-100">
                {ride.inviteCode}
                {copied ? <CheckIcon size={14} className="text-emerald-500" /> : null}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-zinc-400">Invite code · tap to copy</span>
            </button>
          </Card>
        </div>

        {voiceMessage && (
          <p className="mt-3 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {voiceMessage}
          </p>
        )}

        {ended ? (
          <div className="mt-4">
            <Button full disabled>
              This ride has ended
            </Button>
          </div>
        ) : voiceActive && roomRef.current ? (
          <VoiceControls room={roomRef.current} mode={voiceMode} />
        ) : (
          <div className="mt-5 flex gap-2">
            {isParticipant ? (
              <>
                <Button className="flex-1" onClick={enterVoice} loading={busy}>
                  <MicIcon size={16} />
                  Enter voice
                </Button>
                <Button className="flex-1" variant="secondary" onClick={leaveRide} loading={busy}>
                  Leave ride
                </Button>
              </>
            ) : (
              <Button full className="flex-1" onClick={joinRideAndEnterVoice} loading={busy}>
                <MicIcon size={16} />
                Join ride &amp; voice
              </Button>
            )}
          </div>
        )}

        {isCreator && !ended && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Voice mode:</span>
            <Button size="sm" variant={voiceMode === "ptt" ? "primary" : "secondary"} disabled={busy || voiceActive} onClick={() => changeVoiceMode("ptt")}>
              PTT
            </Button>
            <Button size="sm" variant={voiceMode === "open" ? "primary" : "secondary"} disabled={busy || voiceActive} onClick={() => changeVoiceMode("open")}>
              Open mic
            </Button>
            <Button size="sm" variant="danger" className="ml-auto" onClick={endRide} disabled={busy}>
              End ride
            </Button>
          </div>
        )}
      </div>

      <div className="mt-5 px-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">On the ride</h2>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {roster.map((participant) => {
            const peer = Object.values(roomPeers).find((value) => value.userId === participant.userId);
            return (
              <div key={participant.userId} className="flex items-center gap-3 py-2.5">
                <div className="relative">
                  <Avatar name={participant.user?.displayName ?? "@"} username={participant.user?.username ?? ""} image={participant.user?.profileImage} size={40} />
                  {peer && activeRef.current && voiceActive && (
                    <span className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-white ${peer.state.isTransmitting ? "bg-emerald-500" : peer.connected ? "bg-zinc-400" : "bg-zinc-300"} dark:border-zinc-900`} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate font-medium text-zinc-900 dark:text-zinc-100">
                    <span className="truncate">{participant.user?.displayName}</span>
                    <VerifiedBadge user={participant.user} size={13} />
                    {participant.userId === myId && <span className="text-xs text-zinc-400">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-zinc-400">
                    {peer && voiceActive
                      ? peer.state.isTransmitting
                        ? "Speaking…"
                        : peer.connected
                          ? "Connected"
                          : "Connecting…"
                      : bikeLabel(participant.user?.bikeInfo) || `@${participant.user?.username ?? ""}`}
                  </p>
                </div>
                {participant.userId === ride.creatorId && <Badge tone="green">Host</Badge>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VoiceControls({ room, mode }: { room: VoiceRoom; mode: "ptt" | "open" }) {
  const [open, setOpen] = useState(mode === "open");
  const [holding, setHolding] = useState(false);
  const pttStart = useRef(0);

  function beginHold() {
    if (mode !== "ptt") return;
    setHolding(true);
    pttStart.current = Date.now();
    room.setPttActive(true);
    void room.playPttBeep();
  }

  function endHold() {
    if (mode !== "ptt" || !holding) return;
    setHolding(false);
    if (Date.now() - pttStart.current < 300) {
      void room.playPttBeep();
    }
    room.setPttActive(false);
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    room.setOpenMic(next);
  }

  return (
    <div className="mt-5 flex flex-col items-center gap-3">
      {mode === "ptt" ? (
        <button
          type="button"
          onPointerDown={beginHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
          onContextMenu={(event) => event.preventDefault()}
          className={`grid h-24 w-24 select-none touch-none place-items-center rounded-full transition-all active:scale-95 ${
            holding
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
              : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          }`}
          aria-label="Push to talk"
        >
          <MicIcon size={36} />
        </button>
      ) : (
        <button
          type="button"
          onClick={toggleOpen}
          className={`grid h-24 w-24 place-items-center rounded-full transition-colors active:scale-95 ${
            open
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
              : "bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
          }`}
          aria-label={open ? "Mute microphone" : "Unmute microphone"}
        >
          {open ? <MicIcon size={36} /> : <MicOffIcon size={36} />}
        </button>
      )}
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {mode === "ptt"
          ? holding
            ? "You are live — talk!"
            : "Hold to talk"
          : open
            ? "Open mic — tap to mute"
            : "Muted — tap to unmute"}
      </p>
    </div>
  );
}