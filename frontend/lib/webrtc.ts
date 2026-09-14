"use client";

import { api } from "./api";
import { getSocket } from "./socket";
import type { Peer } from "./types";

export type VoiceState = {
  isTransmitting: boolean;
  isMuted: boolean;
};

export type RoomPeer = {
  socketId: string;
  userId: string;
  username: string;
  audio: HTMLAudioElement | null;
  state: VoiceState;
  connected: boolean;
};

export type RoomCallbacks = {
  onPeersChange: (peers: Record<string, RoomPeer>) => void;
  onVoiceModeChange: (mode: "ptt" | "open") => void;
  onStatus: (message: string) => void;
  onError: (message: string) => void;
};

type RTCConfig = RTCConfiguration;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * WebRTC mesh voice for a ride.
 *
 * Peers are addressed by socket id and connected in a full mesh. Existing peers
 * initiate offers toward a newcomer to avoid simultaneous-offer glare; signaling
 * is relayed entirely by the backend socket.
 */
export class VoiceRoom {
  private rideId: string;
  private myUserId: string;
  private myUsername: string;
  private callbacks: RoomCallbacks;
  private socket = getSocket();

  private iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  private localStream: MediaStream | null = null;
  private localEnabled = false; // transmit gate (PTT hold or open mic)
  private muted = true;
  private voiceMode: "ptt" | "open";

  private peers = new Map<string, RTCPeerConnection>();
  private roomPeers: Record<string, RoomPeer> = {};
  private disposed = false;
  private signalListeners: Array<{ event: string; handler: (payload: never) => void }> = [];

  constructor(
    rideId: string,
    myUserId: string,
    myUsername: string,
    initialPeers: Peer[],
    callbacks: RoomCallbacks,
    initialVoiceMode: "ptt" | "open" = "ptt",
  ) {
    this.rideId = rideId;
    this.myUserId = myUserId;
    this.myUsername = myUsername;
    this.callbacks = callbacks;
    this.voiceMode = initialVoiceMode;

    initialPeers.forEach((peer) => this.addRosterPeer(peer));
    this.publish();

    this.bindEvents();
  }

  // ── roster helpers ───────────────────────────────────────────────────────

  private addRosterPeer(peer: Peer) {
    this.roomPeers[peer.socketId] = {
      socketId: peer.socketId,
      userId: peer.userId,
      username: peer.username,
      audio: null,
      state: { isTransmitting: false, isMuted: true },
      connected: false,
    };
  }

  /**
   * Registers peers present when we entered the room. They are existing riders
   * and will initiate the offer toward us, so we don't open a connection yet.
   */
  registerInitialPeers(peers: Peer[]) {
    if (this.disposed) return;
    peers.forEach((peer) => {
      if (!this.roomPeers[peer.socketId]) this.addRosterPeer(peer);
    });
    this.publish();
  }

  /** Reflects a creator-driven voice mode change locally. */
  reportVoiceMode(mode: "ptt" | "open") {
    this.voiceMode = mode;
    if (!this.muted) this.setTransmitGate(true);
  }

  // ── setup ────────────────────────────────────────────────────────────────

  async initialize() {
    try {
      const res = await api.get<{ iceServers: RTCIceServer[] }>("/api/rides/ice-servers");
      if (res.iceServers?.length) this.iceServers = res.iceServers;
    } catch {
      // STUN-only fallback is fine for permissive networks.
    }

    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        this.setTransmitGate(this.voiceMode === "open");
      } catch {
        this.callbacks.onError("Microphone access was denied. You will be voice-visible but cannot transmit.");
      }
    } else {
      this.callbacks.onError("Voice is not supported in this browser");
    }
  }

  get localAudioReady() {
    return Boolean(this.localStream);
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  private bindEvents() {
    this.on("ride:peer-joined", (payload: unknown) => {
      const { socketId, userId, username } = payload as Peer;
      // Existing peers initiate toward the newcomer.
      this.addPeer({ socketId, userId, username }, true);
    });

    this.on("ride:peer-left", (payload: unknown) => {
      const { socketId } = payload as { socketId: string; userId: string };
      this.removePeer(socketId);
    });

    this.on("ride:ended", () => {
      this.callbacks.onStatus("This ride has ended");
    });

    this.on("ride:voice-mode", (payload: unknown) => {
      const { voiceMode } = payload as { id: string; voiceMode: "ptt" | "open" };
      this.voiceMode = voiceMode;
      this.callbacks.onVoiceModeChange(voiceMode);
      if (!this.muted) this.setTransmitGate(true);
    });

    this.on("ride:voice-state", (payload: unknown) => {
      const { socketId, isTransmitting, isMuted } = payload as {
        rideId: string;
        socketId: string;
        userId: string;
        isTransmitting: boolean;
        isMuted: boolean;
      };
      this.updatePeerState(socketId, { isTransmitting, isMuted });
    });

    this.on("webrtc:signal", (payload: unknown) => {
      void this.handleSignal(payload as {
        rideId: string;
        fromSocketId: string;
        fromUserId: string;
        description: RTCSessionDescriptionInit;
      });
    });

    this.on("webrtc:ice-candidate", (payload: unknown) => {
      void this.handleCandidate(payload as {
        rideId: string;
        fromSocketId: string;
        fromUserId: string;
        candidate: RTCIceCandidateInit;
      });
    });
  }

  private on(event: string, handler: (payload: never) => void) {
    const wrapped = (payload: never) => handler(payload);
    this.socket.on(event as never, wrapped as never);
    this.signalListeners.push({ event, handler: wrapped });
  }

  private publish() {
    this.callbacks.onPeersChange({ ...this.roomPeers });
  }

  // ── roster ───────────────────────────────────────────────────────────────

  private addPeer(peer: Peer, initiate: boolean) {
    if (this.disposed) return;
    if (!this.roomPeers[peer.socketId]) {
      this.addRosterPeer(peer);
      this.publish();
    }

    if (initiate) void this.ensureConnection(peer.socketId);
  }

  private removePeer(socketId: string) {
    const peer = this.peers.get(socketId);
    peer?.close();
    this.peers.delete(socketId);
    const roomPeer = this.roomPeers[socketId];
    roomPeer?.audio?.pause();
    roomPeer?.audio?.remove();
    delete this.roomPeers[socketId];
    this.publish();
  }

  private updatePeerState(socketId: string, state: VoiceState) {
    const peer = this.roomPeers[socketId];
    if (!peer) return;
    peer.state = state;
    this.publish();
  }

  private getOrCreatePeer(socketId: string): RTCPeerConnection | null {
    const existing = this.peers.get(socketId);
    if (existing) return existing;

    const roomPeer = this.roomPeers[socketId];
    if (!roomPeer) return null;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers } satisfies RTCConfig);
    this.peers.set(socketId, pc);

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        try {
          pc.addTrack(track, this.localStream!);
        } catch {
          // Track already attached to this connection.
        }
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit("webrtc:ice-candidate", {
          rideId: this.rideId,
          targetSocketId: socketId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      const roomPeer = this.roomPeers[socketId];
      if (!roomPeer) return;
      if (!roomPeer.audio) {
        const audio = new Audio();
        audio.autoplay = true;
        roomPeer.audio = audio;
      }
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      roomPeer.audio.srcObject = stream;
      this.publish();
    };

    pc.onconnectionstatechange = () => {
      const roomPeer = this.roomPeers[socketId];
      if (!roomPeer) return;
      const connected = pc.connectionState === "connected";
      if (roomPeer.connected !== connected) {
        roomPeer.connected = connected;
        this.publish();
      }
      if (pc.connectionState === "failed") {
        pc.restartIce?.();
        pc.close();
        this.peers.delete(socketId);
      }
    };

    return pc;
  }

  private async ensureConnection(socketId: string) {
    const pc = this.getOrCreatePeer(socketId);
    if (!pc || pc.signalingState === "have-local-offer") return;

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit("webrtc:signal", {
        rideId: this.rideId,
        targetSocketId: socketId,
        description: { type: offer.type, sdp: offer.sdp },
      });
    } catch (error) {
      this.callbacks.onError(error instanceof Error ? error.message : "Could not start a call");
    }
  }

  private async handleSignal({ fromSocketId, description }: {
    fromSocketId: string;
    description: RTCSessionDescriptionInit;
  }) {
    const pc = this.getOrCreatePeer(fromSocketId)!;
    try {
      if (description.type === "offer") {
        await pc.setRemoteDescription(description);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.socket.emit("webrtc:signal", {
          rideId: this.rideId,
          targetSocketId: fromSocketId,
          description: { type: answer.type, sdp: answer.sdp },
        });
      } else if (description.type === "answer") {
        await pc.setRemoteDescription(description);
      }
    } catch {
      // A racing or stale offer; the peer will send another.
    }
  }

  private async handleCandidate({ fromSocketId, candidate }: {
    fromSocketId: string;
    candidate: RTCIceCandidateInit;
  }) {
    const pc = this.peers.get(fromSocketId);
    if (!pc) return;
    try {
      if (pc.remoteDescription) await pc.addIceCandidate(candidate);
    } catch {
      // Candidate arrived before the remote description; ignore.
    }
  }

  // ── transmit control ─────────────────────────────────────────────────────

  /** Enables/disables the local audio track. `transmitting` reflects the gate. */
  private setTransmitGate(enabled: boolean) {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
    this.localEnabled = enabled;
    this.reportState();
  }

  get isMuted() {
    return this.muted;
  }

  setPttActive(active: boolean) {
    if (this.voiceMode !== "ptt") return;
    this.setTransmitGate(active);
  }

  setOpenMic(next: boolean) {
    if (this.voiceMode !== "open") return;
    this.muted = !next;
    this.setTransmitGate(next);
  }

  private reportState() {
    this.socket.emit("ride:voice-state", {
      rideId: this.rideId,
      isTransmitting: this.localEnabled && !this.muted,
      isMuted: !this.localEnabled || this.muted,
    });
  }

  async playPttBeep() {
    // Tiny local cue so the rider knows the channel opened.
    try {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.connect(gain);
      gain.connect(audio.destination);
      gain.gain.setValueAtTime(0.08, audio.currentTime);
      oscillator.frequency.value = 660;
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.08);
      await sleep(180);
      await audio.close();
    } catch {
      // Beeps are cosmetic.
    }
  }

  // ── teardown ─────────────────────────────────────────────────────────────

  dispose() {
    this.disposed = true;
    this.signalListeners.forEach(({ event, handler }) => {
      this.socket.off(event as never, handler as never);
    });
    this.signalListeners = [];

    this.peers.forEach((pc) => pc.close());
    this.peers.clear();

    Object.values(this.roomPeers).forEach((peer) => {
      peer.audio?.pause();
      peer.audio?.remove();
    });
    this.roomPeers = {};

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }
}