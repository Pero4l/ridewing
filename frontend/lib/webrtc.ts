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
type NavigateWithLegacyMedia = Navigator & {
  getUserMedia?: (constraints: MediaStreamConstraints, success: (stream: MediaStream) => void, error: (err: Error) => void) => void;
  webkitGetUserMedia?: (constraints: MediaStreamConstraints, success: (stream: MediaStream) => void, error: (err: Error) => void) => void;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * getUserMedia with a legacy webkit fallback so older iOS Safari / Android
 * WebView builds still work instead of just reporting "voice unsupported".
 */
function requestMicrophone(): Promise<MediaStream> {
  const nav = navigator as NavigateWithLegacyMedia;
  if (nav.mediaDevices?.getUserMedia) {
    return nav.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  }
  const legacy = nav.getUserMedia || nav.webkitGetUserMedia;
  if (legacy) {
    return new Promise<MediaStream>((resolve, reject) => {
      try {
        legacy.call(nav, { audio: true }, resolve, reject);
      } catch (error) {
        reject(error as Error);
      }
    });
  }
  return Promise.reject(new Error("UNSUPPORTED"));
}

/**
 * WebRTC mesh voice for a ride.
 *
 * Peers are addressed by socket id and connected in a full mesh. Existing peers
 * initiate offers toward a newcomer to avoid simultaneous-offer glare; signaling
 * is relayed entirely by the backend socket.
 *
 * The microphone is requested the moment the room is constructed (still inside
 * the tap that opened voice), because iOS Safari refuses getUserMedia outside a
 * user gesture and any awaiting before that call can push us out of the window.
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

  private micPromise: Promise<MediaStream | null>;
  private peers = new Map<string, RTCPeerConnection>();
  private roomPeers: Record<string, RoomPeer> = {};
  private initiatorPeers = new Set<string>();
  private needsRenegotiation = new Set<string>();
  private disposed = false;
  private signalListeners: Array<{ event: string; handler: (payload: never) => void }> = [];
  private unlockRegistered = false;

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

    // Kick the mic off synchronously from the user gesture; do not await it.
    this.micPromise = requestMicrophone().catch((error: unknown) => {
      const message = this.describeMicFailure(error);
      this.callbacks.onError(message);
      return null;
    });

    initialPeers.forEach((peer) => this.addRosterPeer(peer));
    this.publish();

    this.bindEvents();
  }

  private describeMicFailure(error: unknown): string {
    if (error instanceof Error && error.message === "UNSUPPORTED") {
      return typeof window !== "undefined" && window.isSecureContext === false
        ? "Voice needs a secure (HTTPS) connection in this browser"
        : "Voice is not supported in this browser";
    }
    // NotAllowedError / NotFoundError / hardware busy, etc.
    const name = error instanceof DOMException ? error.name : String((error as Error)?.name ?? "");
    if (name === "NotAllowedError") {
      return "Microphone permission was denied. Allow the microphone to join voice.";
    }
    if (name === "NotFoundError") {
      return "No microphone was found on this device.";
    }
    return "Could not access the microphone. Check your device settings and try again.";
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

    const stream = await this.micPromise;
    if (this.disposed) return;
    if (stream) {
      this.localStream = stream;
      // Tracks may have been created before the stream arrived (one-way audio
      // bug) — bolt them onto those early connections now.
      this.attachLocalTracks();
      this.setTransmitGate(this.voiceMode === "open");
      // Any peer we are the initiator for that never connected can be retried
      // now that we have a real stream.
      this.reconcileConnections();
    }
  }

  /** Attaches the acquired local audio to every peer connection that exists. */
  private attachLocalTracks() {
    if (!this.localStream) return;
    const track = this.localStream.getAudioTracks()[0];
    if (!track) return;
    this.peers.forEach((pc) => {
      try {
        if (pc.getSenders().some((sender) => sender.track === track)) return;
        pc.addTrack(track, this.localStream!);
      } catch {
        // Connection already closed.
      }
    });
  }

  /**
   * For peers we were supposed to initiate toward (later joiners), start the
   * connection now that the mic is live — a raced offer may have been lost
   * before we had a stream.
   */
  private reconcileConnections() {
    if (this.disposed) return;
    for (const socketId of this.initiatorPeers) {
      if (this.peers.has(socketId)) continue;
      const roomPeer = this.roomPeers[socketId];
      if (!roomPeer) continue;
      const pc = this.getOrCreatePeer(socketId);
      if (!pc) continue;
      void this.ensureConnection(socketId);
    }
  }

  get localAudioReady() {
    return Boolean(this.localStream);
  }

  /**
   * iOS Safari refuses Audio.play() outside a user gesture. Try to play
   * immediately; if the browser blocks it, register a one-time unlock that
   * resumes every peer's audio on the next tap.
   */
  private tryPlay(audio: HTMLAudioElement) {
    const attempt = audio.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => this.queueUnlock());
      return;
    }
    this.queueUnlock();
  }

  private queueUnlock() {
    if (this.unlockRegistered) return;
    this.unlockRegistered = true;
    const unlock = () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("touchend", unlock);
      for (const roomPeer of Object.values(this.roomPeers)) {
        if (roomPeer.audio) {
          const p = roomPeer.audio.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        }
      }
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("touchend", unlock);
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
    if (initiate) {
      this.initiatorPeers.add(peer.socketId);
      // Delay until the mic is ready so the connection is born with our audio
      // track already attached — a trackless connection becomes one-way audio.
      void this.micPromise.then(() => {
        if (this.disposed || !this.roomPeers[peer.socketId]) return;
        void this.ensureConnection(peer.socketId);
      });
    }
  }

  private removePeer(socketId: string) {
    this.initiatorPeers.delete(socketId);
    this.needsRenegotiation.delete(socketId);
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

    // Adding a track to an already-connected peer (mic ready after the offer, a
    // returning rider, or ICE recovery) must trigger a fresh offer — otherwise
    // the remote never learns about our audio and we get one-way silence.
    pc.onnegotiationneeded = () => {
      void this.negotiate(socketId);
    };

    pc.ontrack = (event) => {
      const peer = this.roomPeers[socketId];
      if (!peer) return;
      if (!peer.audio) {
        const audio = new Audio();
        audio.autoplay = true;
        audio.volume = 1;
        peer.audio = audio;
      }
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      peer.audio.srcObject = stream;
      void this.tryPlay(peer.audio);
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
        // Retry shortly if we were the initiator — the mesh should self-heal.
        if (this.initiatorPeers.has(socketId) && !this.disposed) {
          setTimeout(() => {
            if (this.disposed || !this.roomPeers[socketId]) return;
            void this.ensureConnection(socketId);
          }, 1500);
        }
      }
    };

    return pc;
  }

  private async ensureConnection(socketId: string) {
    const pc = this.getOrCreatePeer(socketId);
    if (!pc || pc.signalingState === "closed") return;
    await this.negotiate(socketId);
  }

  /**
   * Drives an offer toward `socketId`. If a signaling transaction is already in
   * flight the request is queued and re-fired once we settle back to "stable" —
   * a late-attached track (mic ready after the connection, or a re-join) then
   * actually gets negotiated instead of silently becoming one-way audio.
   */
  private async negotiate(socketId: string) {
    const pc = this.peers.get(socketId);
    if (!pc || pc.signalingState === "closed") return;
    if (pc.signalingState !== "stable") {
      this.needsRenegotiation.add(socketId);
      return;
    }
    try {
      const offer = await pc.createOffer();
      if (pc.connectionState === "closed") return;
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

  private async handleSignal({ fromSocketId, fromUserId, description }: {
    fromSocketId: string;
    fromUserId: string;
    description: RTCSessionDescriptionInit;
  }) {
    // An offer may arrive before the roster broadcast reaches us (or we are a
    // newcomer whose initial peers list landed after the sender's offer). The
    // offer itself proves the sender is in the ride, so register them on the
    // spot instead of silently dropping the connection.
    if (!this.roomPeers[fromSocketId]) {
      this.addRosterPeer({ socketId: fromSocketId, userId: fromUserId, username: fromUserId });
      this.publish();
    }

    const pc = this.getOrCreatePeer(fromSocketId);
    if (!pc) return;
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
        // A track queued while we were mid-transaction can be offered now.
        if (this.needsRenegotiation.has(fromSocketId)) {
          this.needsRenegotiation.delete(fromSocketId);
          void this.negotiate(fromSocketId);
        }
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
      else this.candidatesToQueue.push({ fromSocketId, candidate });
      this.drainCandidates();
    } catch {
      // Candidate arrived before the remote description; ignore.
    }
  }

  // ICE candidates sometimes land before the SDP offer/answer. Buffer them and
  // apply once the remote description is in place.
  private candidatesToQueue: Array<{ fromSocketId: string; candidate: RTCIceCandidateInit }> = [];

  private drainCandidates() {
    if (!this.candidatesToQueue.length) return;
    for (const { fromSocketId, candidate } of this.candidatesToQueue.splice(0)) {
      const pc = this.peers.get(fromSocketId);
      if (!pc) continue;
      if (!pc.remoteDescription) {
        this.candidatesToQueue.push({ fromSocketId, candidate });
        continue;
      }
      pc.addIceCandidate(candidate).catch(() => {});
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
    this.initiatorPeers.clear();
    this.needsRenegotiation.clear();

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