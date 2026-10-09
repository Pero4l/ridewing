import Constants from "expo-constants";

import { api } from "./api";
import { getSocket, onSocketEvent } from "./socket";
import type { Peer } from "./types";

// Types only — `import type` is fully erased at compile time, so this pulls in no
// runtime code. The runtime module is loaded lazily by `loadWebrtc()` below.
import type { MediaStream, RTCIceCandidate, RTCPeerConnection } from "react-native-webrtc";

type WebrtcModule = typeof import("react-native-webrtc");

/**
 * `react-native-webrtc` is a *native* module, so importing it eagerly makes the
 * entire app fail to mount anywhere the binary does not contain it — most
 * importantly Expo Go. A static import here meant one unavailable module took
 * down the feed, chat and everything else.
 *
 * Loading it on demand means only Ride Mode is unavailable in that situation, and
 * the rider gets told why instead of a redbox.
 */
const DEV_BUILD_HINT =
  "Ride voice needs a development build. Run `npx expo run:ios` / `run:android` " +
  "(or build one with EAS) — Expo Go cannot include native WebRTC.";

let webrtc: WebrtcModule | null = null;
let webrtcError: Error | null = null;

function loadWebrtc(): WebrtcModule {
  if (webrtc) return webrtc;
  if (webrtcError) throw webrtcError;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    webrtc = require("react-native-webrtc") as WebrtcModule;
    return webrtc;
  } catch {
    webrtcError = new Error(DEV_BUILD_HINT);
    throw webrtcError;
  }
}

/**
 * True when this binary can actually do WebRTC.
 *
 * Expo Go does not ship react-native-webrtc, and in current React Native
 * versions requiring a native module the binary lacks throws an Invariant
 * Violation that is reported as fatal — no try/catch can swallow it, so
 * probing with `require()` took the whole app down. `appOwnership`
 * answers the question without ever touching the module: Expo Go riders
 * get the "needs a development build" note instead of a crash, and a
 * development build (where the module is present) takes the require path.
 */
export function isVoiceAvailable(): boolean {
  if (Constants.appOwnership === "expo") return false;
  try {
    loadWebrtc();
    return true;
  } catch {
    return false;
  }
}

/**
 * WebRTC mesh voice for a ride (native).
 *
 * Deliberately the same shape as the web client: peers are addressed by socket id
 * and connected in a full mesh, the backend relays SDP/ICE without interpreting
 * it, and the *existing* peers initiate toward a newcomer so there is never a
 * simultaneous-offer collision.
 *
 * The native difference is audio: `react-native-webrtc` renders a remote audio
 * track itself, so there is no separate player to manage per peer.
 *
 * NOTE: this module pulls in a native module, so it only runs in a development
 * build or an EAS build — not in Expo Go.
 */

export type VoiceMode = "ptt" | "open";

export type RoomPeer = {
  socketId: string;
  userId: string;
  username: string;
  connected: boolean;
  state: { isTransmitting: boolean; isMuted: boolean };
};

export type RoomCallbacks = {
  onRoster: (peers: RoomPeer[]) => void;
  /**
   * Fires once the microphone is actually live (or has permanently failed), so
   * the UI can stop showing "connecting" — and can tell the rider their mic is
   * dead instead of rendering a talk button that transmits nothing.
   */
  onMicReady: (ready: boolean) => void;
  onVoiceModeChange: (mode: VoiceMode) => void;
  onError: (message: string) => void;
  onLocalTransmitChange: (transmitting: boolean) => void;
  onStatus: (message: string) => void;
};

function describeMicFailure(error: unknown): string {
  const name = (error as { name?: string })?.name ?? "";
  if (name === "NotAllowedError") {
    return "RideWing needs microphone access to talk. Enable it in your device settings.";
  }
  if (name === "NotFoundError") {
    return "No microphone was found on this device.";
  }
  return "Could not access the microphone. Check your device settings and try again.";
}

export class VoiceRoom {
  private rideId: string;
  private myUserId: string;
  private callbacks: RoomCallbacks;
  private voiceMode: VoiceMode;

  private iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  private localStream: MediaStream | null = null;
  private localEnabled = false;
  private muted = true;
  private disposed = false;

  private peers = new Map<string, RTCPeerConnection>();
  private roomPeers: Record<string, RoomPeer> = {};
  private initiatorPeers = new Set<string>();
  private pendingCandidates: {
    fromSocketId: string;
    candidate: RTCIceCandidateInit;
  }[] = [];
  private unsubscribes: (() => void)[] = [];

  constructor(
    rideId: string,
    myUserId: string,
    initialPeers: Peer[],
    callbacks: RoomCallbacks,
    initialVoiceMode: VoiceMode = "ptt",
  ) {
    this.rideId = rideId;
    this.myUserId = myUserId;
    this.callbacks = callbacks;
    this.voiceMode = initialVoiceMode;

    for (const peer of initialPeers) this.addRosterPeer(peer);
    this.publish();
    this.bindEvents();

    // Started from the tap that opened voice, so the permission prompt is
    // attributable to a user gesture on both platforms.
    void this.initialize();
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  async initialize() {
    // Fail as a message the rider can act on, rather than throwing out of the
    // screen and unmounting the whole ride.
    try {
      loadWebrtc();
    } catch (error) {
      this.callbacks.onError(error instanceof Error ? error.message : DEV_BUILD_HINT);
      this.callbacks.onMicReady(false);
      return;
    }

    try {
      const res = await api.get<{ iceServers: RTCIceServer[] }>("/api/rides/ice-servers");
      if (res.iceServers?.length) this.iceServers = res.iceServers;
    } catch {
      // STUN-only fallback is fine on permissive networks.
    }

    // `mediaDevices` from react-native-webrtc, not the global `navigator` one —
    // the global returns a DOM MediaStream, which is not the type the peer
    // connection accepts.
    let stream: MediaStream;
    try {
      stream = await loadWebrtc().mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (error) {
      this.callbacks.onError(describeMicFailure(error));
      this.callbacks.onMicReady(false);
      return;
    }

    if (this.disposed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    this.localStream = stream;
    this.setTransmitGate(this.voiceMode === "open");
    this.callbacks.onMicReady(true);

    // Any peer we owe an offer to can now be dialled — an offer attempted
    // before the mic existed would have carried no audio.
    for (const socketId of this.initiatorPeers) {
      if (this.peers.has(socketId)) continue;
      void this.ensureConnection(socketId);
    }
  }

  get localAudioReady() {
    return Boolean(this.localStream);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    for (const off of this.unsubscribes) off();
    this.unsubscribes = [];

    this.peers.forEach((pc) => {
      try {
        pc.close();
      } catch {
        // Already closed.
      }
    });
    this.peers.clear();

    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.roomPeers = {};
    this.pendingCandidates = [];
  }

  // ── roster ───────────────────────────────────────────────────────────────

  private addRosterPeer(peer: Peer) {
    if (this.roomPeers[peer.socketId]) return;
    this.roomPeers[peer.socketId] = {
      socketId: peer.socketId,
      userId: peer.userId,
      username: peer.username,
      connected: false,
      state: { isTransmitting: false, isMuted: true },
    };
  }

  private publish() {
    this.callbacks.onRoster(Object.values(this.roomPeers));
  }

  private removePeer(socketId: string) {
    const peer = this.roomPeers[socketId];
    if (!peer) return;

    const pc = this.peers.get(socketId);
    if (pc) {
      try {
        pc.close();
      } catch {
        // Already closed.
      }
      this.peers.delete(socketId);
    }
    this.initiatorPeers.delete(socketId);

    delete this.roomPeers[socketId];
    this.publish();
  }

  // ── transmit control ─────────────────────────────────────────────────────

  /** Push-to-talk hold. */
  setPttActive(active: boolean) {
    if (this.voiceMode !== "ptt") return;
    this.setTransmitGate(active);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.setTransmitGate(this.voiceMode === "open" && !this.muted);
  }

  get isMuted() {
    return this.muted;
  }

  /**
   * Reflects a creator-driven voice mode change.
   *
   * Entering PTT must close the gate: opening it whenever the rider is unmuted
   * left their microphone broadcasting after the mode changed, so the UI showed
   * "hold to talk" while they were already transmitting.
   */
  reportVoiceMode(mode: VoiceMode) {
    this.voiceMode = mode;
    if (mode === "open" && !this.muted) this.setTransmitGate(true);
    else this.setTransmitGate(false);
  }

  private setTransmitGate(enabled: boolean) {
    const gate = this.voiceMode === "open" ? enabled && !this.muted : enabled;
    this.localEnabled = enabled;
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = gate;
    });
    this.reportLocalState();
  }

  private reportLocalState() {
    const transmitting = this.voiceMode === "open"
      ? this.localEnabled && !this.muted
      : this.localEnabled;
    this.callbacks.onLocalTransmitChange(transmitting);
    try {
      getSocket().emit("ride:voice-state", {
        rideId: this.rideId,
        isTransmitting: transmitting,
        isMuted: this.muted,
      });
    } catch {
      // Signed out mid-ride — nothing to report to.
    }
  }

  // ── peer connections ─────────────────────────────────────────────────────

  private getOrCreatePeer(socketId: string): RTCPeerConnection | null {
    const existing = this.peers.get(socketId);
    if (existing) return existing;
    const roomPeer = this.roomPeers[socketId];
    if (!roomPeer) return null;

    const RTCPeerConnectionCtor = loadWebrtc().RTCPeerConnection;
    const pc = new RTCPeerConnectionCtor({ iceServers: this.iceServers });

    pc.onicecandidate = (event: { candidate: RTCIceCandidate | null }) => {
      if (!event.candidate) return;
      try {
        getSocket().emit("webrtc:ice-candidate", {
          rideId: this.rideId,
          targetSocketId: socketId,
          candidate: event.candidate,
        });
      } catch {
        // Socket gone; the peer connection will be torn down shortly anyway.
      }
    };

    pc.onconnectionstatechange = () => {
      const connected = pc.connectionState === "connected";
      if (roomPeer.connected !== connected) {
        roomPeer.connected = connected;
        this.publish();
      }
      // `failed` is not recoverable by restarting ICE — a fresh connection is.
      if (pc.connectionState === "failed") {
        try {
          pc.close();
        } catch {
          // Already closed.
        }
        this.peers.delete(socketId);
        if (this.initiatorPeers.has(socketId) && !this.disposed) {
          setTimeout(() => {
            if (this.disposed || !this.roomPeers[socketId]) return;
            void this.ensureConnection(socketId);
          }, 1500);
        }
      }
    };

    this.localStream?.getTracks().forEach((track) => {
      try {
        pc.addTrack(track, this.localStream!);
      } catch {
        // Connection already closed.
      }
    });

    this.peers.set(socketId, pc);
    return pc;
  }

  private async ensureConnection(socketId: string) {
    const pc = this.getOrCreatePeer(socketId);
    if (!pc) return;
    try {
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      getSocket().emit("webrtc:signal", {
        rideId: this.rideId,
        targetSocketId: socketId,
        description: { type: offer.type, sdp: offer.sdp },
      });
    } catch {
      // The peer will re-offer; a stale failure here is not fatal.
    }
  }

  private drainCandidates() {
    if (!this.pendingCandidates.length) return;
    // Kept in a second array rather than spliced, so a candidate whose peer is
    // not ready survives instead of being consumed and lost.
    const pending = this.pendingCandidates;
    this.pendingCandidates = [];

    for (const { fromSocketId, candidate } of pending) {
      const pc = this.peers.get(fromSocketId);
      if (!pc?.remoteDescription) {
        this.pendingCandidates.push({ fromSocketId, candidate });
        continue;
      }
      void pc
        .addIceCandidate(new (loadWebrtc().RTCIceCandidate)(candidate))
        .catch(() => {});
    }
  }

  private async handleSignal(payload: {
    fromSocketId: string;
    fromUserId: string;
    description: RTCSessionDescriptionInit;
  }) {
    const { fromSocketId, fromUserId, description } = payload;

    // An offer can beat the roster broadcast. It proves the sender is in the
    // ride, so register them rather than dropping the connection.
    if (!this.roomPeers[fromSocketId]) {
      this.addRosterPeer({
        socketId: fromSocketId,
        userId: fromUserId,
        username: fromUserId,
      });
      this.publish();
    }

    const pc = this.getOrCreatePeer(fromSocketId);
    if (!pc) return;

    try {
      await pc.setRemoteDescription(
        new (loadWebrtc().RTCSessionDescription)({
          type: description.type ?? null,
          sdp: description.sdp ?? "",
        }),
      );
      if (description.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        getSocket().emit("webrtc:signal", {
          rideId: this.rideId,
          targetSocketId: fromSocketId,
          description: { type: answer.type, sdp: answer.sdp },
        });
      }
      // Candidates buffered while there was no remote description can only be
      // applied now.
      this.drainCandidates();
    } catch {
      // A racing or stale offer; the peer will send another.
    }
  }

  private async handleCandidate(payload: {
    fromSocketId: string;
    candidate: RTCIceCandidateInit;
  }) {
    const pc = this.peers.get(payload.fromSocketId);
    // Queue rather than drop: a candidate discarded here is a route never
    // tried, and ICE stalls without ever reaching connected.
    if (!pc) {
      this.pendingCandidates.push(payload);
      return;
    }
    if (!pc.remoteDescription) {
      this.pendingCandidates.push(payload);
      return;
    }
    try {
      await pc.addIceCandidate(new (loadWebrtc().RTCIceCandidate)(payload.candidate));
    } catch {
      // Candidate no longer valid.
    }
  }

  // ── socket events ────────────────────────────────────────────────────────

  private bindEvents() {
    this.unsubscribes.push(
      onSocketEvent<Peer>("ride:peer-joined", ({ socketId, userId, username }) => {
        // We are already here, so we initiate toward the newcomer.
        if (this.roomPeers[socketId]) return;
        this.addRosterPeer({ socketId, userId, username });
        this.publish();
        this.initiatorPeers.add(socketId);
        if (this.localStream) void this.ensureConnection(socketId);
      }),

      onSocketEvent<{ socketId: string }>("ride:peer-left", ({ socketId }) => {
        this.removePeer(socketId);
      }),

      onSocketEvent("ride:ended", () => {
        this.callbacks.onStatus("This ride has ended");
      }),

      onSocketEvent<{ voiceMode: VoiceMode }>("ride:voice-mode", ({ voiceMode }) => {
        this.callbacks.onVoiceModeChange(voiceMode);
        this.reportVoiceMode(voiceMode);
      }),

      onSocketEvent<{
        socketId: string;
        isTransmitting: boolean;
        isMuted: boolean;
      }>("ride:voice-state", ({ socketId, isTransmitting, isMuted }) => {
        const peer = this.roomPeers[socketId];
        if (!peer) return;
        peer.state = { isTransmitting, isMuted };
        this.publish();
      }),

      onSocketEvent("webrtc:signal", (payload) => {
        void this.handleSignal(
          payload as {
            fromSocketId: string;
            fromUserId: string;
            description: RTCSessionDescriptionInit;
          },
        );
      }),

      onSocketEvent("webrtc:ice-candidate", (payload) => {
        void this.handleCandidate(
          payload as { fromSocketId: string; candidate: RTCIceCandidateInit },
        );
      }),
    );
  }
}