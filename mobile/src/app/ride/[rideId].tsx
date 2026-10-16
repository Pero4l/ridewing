/* eslint-disable react-hooks/set-state-in-effect --
 * These screens load data on mount. The effect only *starts* an async fetch;
 * the state updates it triggers all land after an `await`, so there is no
 * synchronous setState during render. The rule cannot see across the async
 * boundary and flags the fetch helper instead.
 */
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  Divider,
  ErrorState,
  IconButton,
  Row,
  Screen,
  SectionTitle,
  Spinner,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { usePalette } from "@/lib/palette";
import { useSession } from "@/lib/session";
// Type-only, so it costs nothing at runtime. `VoiceRoom` itself is imported
// dynamically when the rider actually joins voice — see enterVoice().
import type { VoiceRoom as VoiceRoomType, RoomPeer, VoiceMode } from "@/lib/voice";
import { emitWithAck, onSocketEvent, waitForSocket } from "@/lib/socket";
import type { Peer, Ride } from "@/lib/types";

export default function RideScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { colors } = usePalette();
  const { user } = useSession();

  const [ride, setRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  // Voice
  const roomRef = useRef<VoiceRoomType | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [transmitting, setTransmitting] = useState(false);
  const [muted, setMuted] = useState(true);
  const [peers, setPeers] = useState<RoomPeer[]>([]);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("ptt");
  const [voiceNote, setVoiceNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ ride: Ride }>(`/api/rides/${rideId}`);
      setRide(res.ride);
      setVoiceMode(res.ride.voiceMode);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this ride.");
    } finally {
      setLoading(false);
    }
  }, [rideId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Leaving the screen must tear the mesh down, or the microphone stays hot.
  useEffect(
    () => () => {
      roomRef.current?.dispose();
      roomRef.current = null;
    },
    [],
  );

  // The creator ending the ride or changing voice mode is pushed to us.
  useEffect(() => {
    const offEnded = onSocketEvent("ride:ended", () => {
      setVoiceNote("This ride has ended.");
      roomRef.current?.dispose();
      roomRef.current = null;
      setVoiceOn(false);
      void load();
    });
    const offMode = onSocketEvent<{ voiceMode: VoiceMode }>("ride:voice-mode", (payload) => {
      setVoiceMode(payload.voiceMode);
      roomRef.current?.reportVoiceMode(payload.voiceMode);
    });
    return () => {
      offEnded();
      offMode();
    };
  }, [load]);

  async function joinRide() {
    setJoining(true);
    setError(null);
    try {
      await api.post(`/api/rides/${rideId}/join`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not join this ride.");
    } finally {
      setJoining(false);
    }
  }

  async function enterVoice() {
    if (!user) return;
    setVoiceNote(null);
    try {
      // Imported here, not at module scope: this pulls in the WebRTC native
      // module, which is unavailable in Expo Go. Importing it statically made
      // the whole app fail to mount.
      const { VoiceRoom, isVoiceAvailable } = await import("@/lib/voice");
      if (!isVoiceAvailable()) {
        setVoiceNote(
          "Ride voice needs a development build — run `npx expo run:ios` / `run:android`. " +
            "Expo Go cannot include native WebRTC.",
        );
        return;
      }

      await waitForSocket();
      const res = await emitWithAck<{ peers: Peer[]; selfSocketId: string }>("ride:join", {
        rideId,
      });

      const room = new VoiceRoom(
        rideId,
        user.id,
        res.peers ?? [],
        {
          onRoster: setPeers,
          onMicReady: setMicReady,
          onVoiceModeChange: setVoiceMode,
          onLocalTransmitChange: setTransmitting,
          onError: setVoiceNote,
          onStatus: setVoiceNote,
        },
        voiceMode,
      );
      roomRef.current = room;
      setVoiceOn(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      setVoiceNote(err instanceof Error ? err.message : "Could not join the ride voice.");
    }
  }

  function exitVoice() {
    roomRef.current?.dispose();
    roomRef.current = null;
    setVoiceOn(false);
    setPeers([]);
    setTransmitting(false);
    setMicReady(false);
    void emitWithAck("ride:leave", { rideId }).catch(() => {});
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    room.toggleMute();
    setMuted(room.isMuted);
  }

  async function changeMode(next: VoiceMode) {
    if (!ride || ride.creatorId !== user?.id) return;
    try {
      await api.put(`/api/rides/${rideId}/voice-mode`, { voiceMode: next });
      setVoiceMode(next);
      roomRef.current?.reportVoiceMode(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the voice mode.");
    }
  }

  async function toggleSignal(kind: "help" | "stop", active: boolean) {
    try {
      await api.put(`/api/rides/${rideId}/signal`, { kind, active });
      void Haptics.notificationAsync(
        active ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update your signal.");
    }
  }

  async function leaveRide() {
    try {
      // Drop the voice mesh first, so the microphone is released immediately
      // rather than after the request round-trips.
      if (voiceOn) exitVoice();
      await api.post(`/api/rides/${rideId}/leave`);
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not leave this ride.");
    }
  }

  function confirmLeave() {
    Alert.alert("Leave this ride?", "You can rejoin while the ride is still active.", [
      { text: "Stay", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => void leaveRide() },
    ]);
  }

  async function endRide() {
    try {
      await api.post(`/api/rides/${rideId}/end`);
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not end this ride.");
    }
  }

  if (loading) {
    return (
      <Screen>
        <Spinner label="Loading ride" />
      </Screen>
    );
  }

  if (error && !ride) {
    return (
      <Screen>
        <ErrorState message={error} onRetry={() => void load()} />
      </Screen>
    );
  }

  if (!ride) return <Screen>{null}</Screen>;

  const participants = ride.participants ?? [];
  const joined = participants.filter((p) => p.status === "joined");
  const myParticipant = participants.find((p) => p.userId === user?.id);
  const isCreator = ride.creatorId === user?.id;
  const iHaveJoined = myParticipant?.status === "joined";
  const ended = ride.status === "ended";

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      >
        {/* Ride header: name, who started it, and the live state. */}
        <Row className="justify-between gap-3">
          <View className="flex-1">
            <T size={24} weight="800" className="tracking-tight">
              {ride.name}
            </T>
            <T size={12} muted>
              started by @{ride.creator?.username} · {relativeTime(ride.createdAt)}
            </T>
          </View>
          {ended ? (
            <Badge label="ENDED" tone="muted" />
          ) : (
            <Row
              gap={6}
              className="shrink-0 rounded-full px-2.5 py-1"
              style={{ backgroundColor: colors.accentSoft }}
            >
              <View
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: colors.accent }}
              />
              <T size={11} weight="700" tone="accent" className="uppercase">
                Live
              </T>
            </Row>
          )}
        </Row>

        {error ? <Banner tone="danger" message={error} /> : null}
        {voiceNote ? <Banner tone="muted" message={voiceNote} /> : null}

        {!iHaveJoined && !ended ? (
          <Button label="Join this ride" onPress={joinRide} loading={joining} fullWidth />
        ) : null}

        {/* Voice controls */}
        {iHaveJoined && !ended ? (
          <Card className="gap-3.5">
            <Row className="justify-between">
              <T size={15} weight="700">
                Ride voice
              </T>
              <Badge
                label={voiceMode === "open" ? "OPEN MIC" : "PUSH TO TALK"}
                tone={voiceMode === "open" ? "danger" : "accent"}
              />
            </Row>

            {voiceOn ? (
              <>
                <Row className="justify-between">
                  <Row gap={8} className="shrink">
                    <Ionicons
                      name={micReady ? "mic" : "mic-off"}
                      size={16}
                      color={micReady ? colors.accent : colors.faint}
                    />
                    <T size={13} muted>
                      {micReady ? `${peers.length} connected` : "Waiting for microphone…"}
                    </T>
                  </Row>
                  <Row gap={10} className="shrink">
                    <IconButton
                      icon={muted ? "volume-mute" : "volume-medium"}
                      label={muted ? "Unmute" : "Mute"}
                      tone={muted ? "danger" : "muted"}
                      onPress={toggleMute}
                    />
                    <IconButton
                      icon="exit-outline"
                      label="Leave voice"
                      onPress={exitVoice}
                    />
                  </Row>
                </Row>

                {voiceMode === "ptt" ? (
                  <Pressable
                    onPressIn={() => {
                      roomRef.current?.setPttActive(true);
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    onPressOut={() => roomRef.current?.setPttActive(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Hold to talk"
                    accessibilityHint="Press and hold while speaking"
                    className="items-center gap-1 rounded-2xl py-7"
                    style={{
                      backgroundColor: transmitting ? colors.danger : colors.accentSoft,
                    }}
                  >
                    <Ionicons
                      name="mic"
                      size={28}
                      color={transmitting ? colors.onAccent : colors.accent}
                    />
                    <T
                      size={13}
                      weight="700"
                      color={transmitting ? colors.onAccent : colors.accent}
                    >
                      {transmitting ? "Transmitting" : "Hold to talk"}
                    </T>
                  </Pressable>
                ) : (
                  <T size={13} muted>
                    Your microphone is open. Use the mute button above to stop transmitting.
                  </T>
                )}

                {peers.length ? (
                  <View
                    className="gap-1 rounded-2xl p-1.5"
                    style={{ backgroundColor: colors.raised }}
                  >
                    {peers.map((peer) => (
                      <Row
                        key={peer.socketId}
                        gap={10}
                        className="justify-between rounded-lg px-2 py-2"
                      >
                        <Row gap={10} className="shrink">
                          <Avatar
                            user={{ username: peer.username, profileImage: null }}
                            size={26}
                          />
                          <T size={13} numberOfLines={1}>
                            {peer.username}
                          </T>
                        </Row>
                        <Row gap={4} className="shrink">
                          {peer.state.isTransmitting ? (
                            <View
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: colors.success }}
                            />
                          ) : null}
                          <T
                            size={12}
                            weight="600"
                            tone={peer.state.isTransmitting ? "success" : "muted"}
                          >
                            {peer.state.isTransmitting ? "talking" : "quiet"}
                          </T>
                        </Row>
                      </Row>
                    ))}
                  </View>
                ) : (
                  <T size={13} muted>
                    No one else is on the ride voice yet.
                  </T>
                )}
              </>
            ) : (
              <View className="gap-1.5">
                <Button label="Join ride voice" icon="mic" onPress={enterVoice} fullWidth />
                <T size={11} tone="muted" className="text-center">
                  Voice uses WebRTC and needs a development build (`npx expo run:ios` /
                  `run:android`), not Expo Go.
                </T>
              </View>
            )}

            {isCreator ? (
              <>
                <Divider />
                <Row className="justify-between">
                  <T size={13} weight="600" muted>
                    Voice mode
                  </T>
                  <Row gap={8} className="shrink">
                    <Chip
                      label="Push to talk"
                      selected={voiceMode === "ptt"}
                      onPress={() => changeMode("ptt")}
                    />
                    <Chip
                      label="Open mic"
                      selected={voiceMode === "open"}
                      onPress={() => changeMode("open")}
                    />
                  </Row>
                </Row>
              </>
            ) : null}
          </Card>
        ) : null}

        {/* Safety signals */}
        {iHaveJoined && !ended ? (
          <Card className="gap-2.5">
            <T size={15} weight="700">
              Roadside signals
            </T>
            <T size={12} muted>
              Everyone on the ride sees these immediately. Only use them if you need help.
            </T>
            <Row gap={10}>
              <Button
                label={myParticipant?.helpRequestedAt ? "Help requested" : "I need help"}
                variant={myParticipant?.helpRequestedAt ? "danger" : "secondary"}
                icon="warning"
                className="flex-1"
                onPress={() => toggleSignal("help", !myParticipant?.helpRequestedAt)}
              />
              <Button
                label={myParticipant?.stoppedAt ? "Stopped" : "I've stopped"}
                variant={myParticipant?.stoppedAt ? "primary" : "secondary"}
                icon="pause"
                className="flex-1"
                onPress={() => toggleSignal("stop", !myParticipant?.stoppedAt)}
              />
            </Row>
          </Card>
        ) : null}

        {/* Roster */}
        <View className="gap-1.5">
          <SectionTitle>{`Riders (${joined.length}/${ride.maxParticipants})`}</SectionTitle>
          <Card padded={false} className="overflow-hidden">
            {joined.length ? (
              joined.map((participant, index) => (
                <View key={participant.userId}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    gap={10}
                    className="justify-between px-4 py-3"
                  >
                    <Pressable
                      onPress={() =>
                        router.push(`/profile/${participant.user?.username ?? ""}`)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${participant.user?.displayName ?? "rider"}'s profile`}
                      className="flex-1"
                    >
                      <Row gap={10}>
                        <Avatar user={participant.user} size={32} />
                        <View>
                          <T size={14} weight="600">
                            {participant.user?.displayName ?? "Rider"}
                          </T>
                          <T size={11} muted>
                            @{participant.user?.username}
                          </T>
                        </View>
                      </Row>
                    </Pressable>
                    <Row gap={6}>
                      {participant.helpRequestedAt ? (
                        <Badge label="needs help" tone="danger" />
                      ) : null}
                      {participant.stoppedAt ? <Badge label="stopped" tone="accent" /> : null}
                    </Row>
                  </Row>
                </View>
              ))
            ) : (
              <T size={13} muted className="px-4 py-3">
                Nobody has joined yet.
              </T>
            )}
          </Card>
        </View>

        {/* Invite */}
        {iHaveJoined && !ended ? (
          <Card className="gap-2">
            <T size={13} weight="600" muted>
              Invite code
            </T>
            <View
              className="items-center rounded-2xl py-3"
              style={{ backgroundColor: colors.raised }}
            >
              <T size={28} weight="800" style={{ letterSpacing: 6 }}>
                {ride.inviteCode}
              </T>
            </View>
            <T size={12} muted>
              Anyone with this code can join the ride.
            </T>
          </Card>
        ) : null}

        {isCreator && !ended ? (
          <Button
            label="End ride for everyone"
            variant="danger"
            icon="stop"
            fullWidth
            onPress={() =>
              Alert.alert("End this ride?", "Voice closes for every rider on it.", [
                { text: "Cancel", style: "cancel" },
                { text: "End ride", style: "destructive", onPress: () => void endRide() },
              ])
            }
          />
        ) : iHaveJoined && !ended ? (
          // Without this a rider could join but never leave, so every ride kept
          // its participants (and their ride slots) until it ended.
          <Button
            label="Leave ride"
            variant="secondary"
            icon="exit-outline"
            fullWidth
            onPress={confirmLeave}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
