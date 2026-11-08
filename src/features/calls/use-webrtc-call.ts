"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { CallSignalData, CallState, MicBlockedReason } from "./types";
import {
  publishCallOffer,
  publishCallAnswer,
  sendIceCandidate,
  endCallSignal,
  declineCallSignal,
  notifyCallRinging,
  subscribeToCallSignal,
} from "./call-signaling-service";
import { callAudio } from "./call-ringtone";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun3.l.google.com:19302",
        "stun:stun4.l.google.com:19302",
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

/**
 * Diagnoses root causes of microphone access failures across Chrome, Windows privacy, and hardware.
 */
export async function diagnoseMicrophoneError(err: unknown): Promise<{
  type: MicBlockedReason;
  message: string;
}> {
  let browserState: PermissionState | "unknown" = "unknown";
  try {
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      const p = await navigator.permissions.query({ name: "microphone" as PermissionName });
      browserState = p.state;
    }
  } catch {}

  let hasAudioDevice = true;
  try {
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === "audioinput");
      if (devices.length > 0 && audioInputs.length === 0) {
        hasAudioDevice = false;
      }
    }
  } catch {}

  if (!hasAudioDevice) {
    return {
      type: "no_device",
      message: "No microphone detected on your computer. Please plug in a headset or mic and refresh.",
    };
  }

  if (err instanceof Error) {
    if (err.name === "NotFoundError" || err.message.toLowerCase().includes("not found")) {
      return {
        type: "no_device",
        message: "No microphone detected. Please plug in a microphone or headset and try again.",
      };
    }
    if (err.name === "NotReadableError" || err.name === "TrackStartError") {
      return {
        type: "in_use",
        message: "Microphone is in use by another app (Zoom, Teams, Discord). Please close it and retry.",
      };
    }
  }

  if (browserState === "granted") {
    return {
      type: "windows_privacy",
      message:
        "Microphone is Allowed in Chrome, but Windows is blocking Chrome or the tab needs a reload! Please press F5 to reload. If it persists, enable 'Let desktop apps access your microphone' in Windows Settings.",
    };
  }

  return {
    type: "browser_denied",
    message:
      "Microphone permission is blocked. Click the tune/lock icon in your browser URL bar, set Microphone to 'Allow', then reload the page.",
  };
}

interface UseWebRTCCallProps {
  conversationId: string | null;
  activePairingIds?: string[];
  currentUserUid: string;
  peerName?: string;
  enabled?: boolean;
  onIncomingCallBackground?: (callerName: string) => void;
  onAutoSwitchConversation?: (conversationId: string) => void;
  onError?: (errorMessage: string) => void;
}

export function useWebRTCCall({
  conversationId,
  activePairingIds = [],
  currentUserUid,
  peerName = "Peer",
  enabled = true,
  onIncomingCallBackground,
  onAutoSwitchConversation,
  onError,
}: UseWebRTCCallProps) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [callRole, setCallRole] = useState<"caller" | "receiver" | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [activeSignal, setActiveSignal] = useState<CallSignalData | null>(null);
  const [micBlocked, setMicBlocked] = useState<boolean>(false);
  const [micBlockedReason, setMicBlockedReason] = useState<MicBlockedReason>(null);
  const [isEchoTest, setIsEchoTest] = useState<boolean>(false);
  const [micLevel, setMicLevel] = useState<number>(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const durationTimerRef = useRef<number | null>(null);
  const callRoleRef = useRef<"caller" | "receiver" | null>(null);
  const candidatesQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const callStateRef = useRef<CallState>("idle");
  const addedCandidatesRef = useRef<Set<string>>(new Set());
  const echoCtxRef = useRef<AudioContext | null>(null);
  const echoAnimRef = useRef<number | null>(null);
  const callTimeoutRef = useRef<number | null>(null);

  // Keep callStateRef synchronized with callState
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Initialize hidden remote audio element
  useEffect(() => {
    if (typeof window === "undefined") return;
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);
    remoteAudioRef.current = audioEl;

    return () => {
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl.remove();
    };
  }, []);

  const cleanupMediaAndPeer = useCallback(() => {
    callAudio.stop();

    if (callTimeoutRef.current !== null) {
      window.clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }

    if (echoAnimRef.current !== null) {
      cancelAnimationFrame(echoAnimRef.current);
      echoAnimRef.current = null;
    }

    if (echoCtxRef.current && echoCtxRef.current.state !== "closed") {
      echoCtxRef.current.close().catch(() => {});
      echoCtxRef.current = null;
    }

    setIsEchoTest(false);
    setMicLevel(0);

    if (durationTimerRef.current !== null) {
      window.clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    setDurationSec(0);

    // Stop local mic tracks
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }

    // Stop remote audio
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    // Close peer connection
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    candidatesQueueRef.current = [];
    addedCandidatesRef.current.clear();
    callRoleRef.current = null;
    setCallRole(null);
    setIsMuted(false);
  }, []);

  // Multi-pairing incoming call background listener
  useEffect(() => {
    if (!enabled || !activePairingIds || activePairingIds.length === 0 || !currentUserUid) return;

    const unsubs: (() => void)[] = [];
    for (const pId of activePairingIds) {
      if (pId === conversationId) continue;
      const unsub = subscribeToCallSignal({
        conversationId: pId,
        onSignal: (signal) => {
          if (
            signal &&
            signal.state === "calling" &&
            signal.callerUid !== currentUserUid &&
            callStateRef.current === "idle"
          ) {
            onAutoSwitchConversation?.(pId);
          }
        },
      });
      unsubs.push(unsub);
    }

    return () => {
      for (const u of unsubs) u();
    };
  }, [enabled, activePairingIds, conversationId, currentUserUid, onAutoSwitchConversation]);

  // Subscribe to call signaling updates for this conversation
  useEffect(() => {
    if (!enabled || !conversationId || !currentUserUid) return;

    const unsubscribe = subscribeToCallSignal({
      conversationId,
      onSignal: async (signal) => {
        setActiveSignal(signal);

        // Case 1: No call node exists (Call ended or idle)
        if (!signal) {
          if (callStateRef.current !== "idle") {
            cleanupMediaAndPeer();
            setCallState("idle");
          }
          return;
        }

        // Case 2: Incoming call for receiver
        if (signal.state === "calling" && signal.callerUid !== currentUserUid) {
          if (callStateRef.current === "idle") {
            callRoleRef.current = "receiver";
            setCallRole("receiver");
            setCallState("ringing");
            callAudio.startIncomingRing();
            onIncomingCallBackground?.(peerName);
            // Notify caller that receiver's device is ringing!
            notifyCallRinging({ conversationId }).catch(() => {});
          }
        }

        // Case 2b: Receiver is actively ringing -> Caller updates to "ringing"
        if (
          signal.state === "ringing" &&
          callRoleRef.current === "caller" &&
          callStateRef.current === "calling"
        ) {
          setCallState("ringing");
        }

        // Case 3: Outgoing call answered (Caller receives Answer)
        if (
          signal.state === "connected" &&
          signal.answer &&
          callRoleRef.current === "caller" &&
          pcRef.current &&
          pcRef.current.signalingState === "have-local-offer"
        ) {
          callAudio.stop();
          if (callTimeoutRef.current !== null) {
            window.clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
          }
          try {
            await pcRef.current.setRemoteDescription(
              new RTCSessionDescription(signal.answer)
            );
          } catch (err) {
            console.warn("[WebRTC] Error setting remote answer:", err);
          }
          setCallState("connected");
        }

        // Process receiver candidates for caller
        if (
          callRoleRef.current === "caller" &&
          pcRef.current &&
          pcRef.current.remoteDescription &&
          signal.receiverCandidates
        ) {
          for (const c of Object.values(signal.receiverCandidates)) {
            const key = `${c.candidate}_${c.sdpMid}_${c.sdpMLineIndex}`;
            if (!addedCandidatesRef.current.has(key)) {
              addedCandidatesRef.current.add(key);
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(c));
              } catch {
                // Duplicate or stale candidate
              }
            }
          }
        }

        // Process caller candidates if receiver
        if (
          callRoleRef.current === "receiver" &&
          pcRef.current &&
          pcRef.current.remoteDescription &&
          signal.callerCandidates
        ) {
          for (const c of Object.values(signal.callerCandidates)) {
            const key = `${c.candidate}_${c.sdpMid}_${c.sdpMLineIndex}`;
            if (!addedCandidatesRef.current.has(key)) {
              addedCandidatesRef.current.add(key);
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(c));
              } catch {
                // Duplicate or stale candidate
              }
            }
          }
        }

        // Case 4: Call declined or ended by peer
        if (signal.state === "declined" || signal.state === "ended") {
          cleanupMediaAndPeer();
          setCallState(signal.state);
          setTimeout(() => {
            setCallState("idle");
          }, 1500);
        }
      },
    });

    return () => {
      unsubscribe();
      cleanupMediaAndPeer();
    };
  }, [
    enabled,
    conversationId,
    currentUserUid,
    peerName,
    onIncomingCallBackground,
    cleanupMediaAndPeer,
  ]);

  // Duration timer ticker when call is active
  useEffect(() => {
    if (callState === "connected") {
      const startTime = Date.now();
      durationTimerRef.current = window.setInterval(() => {
        setDurationSec(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      if (durationTimerRef.current !== null) {
        window.clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    }
    return () => {
      if (durationTimerRef.current !== null) {
        window.clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    };
  }, [callState]);

  /**
   * Starts an outgoing voice call.
   */
  const startCall = useCallback(async () => {
    if (!conversationId || !currentUserUid) return;

    cleanupMediaAndPeer();
    callRoleRef.current = "caller";
    setCallRole("caller");
    setCallState("calling");
    callAudio.startOutgoingRing();

    // Step 1: Request Microphone Stream with Graceful Fallback
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (firstErr) {
      console.warn("[WebRTC] Advanced audio constraints failed, trying basic audio: true", firstErr);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (micErr) {
        console.error("[WebRTC] Microphone access failed completely:", micErr);
        cleanupMediaAndPeer();
        setCallState("idle");
        const diag = await diagnoseMicrophoneError(micErr);
        setMicBlocked(true);
        setMicBlockedReason(diag.type);
        const rawErr = micErr instanceof Error ? ` (${micErr.name}: ${micErr.message})` : "";
        if (onError) onError(diag.message + rawErr);
        return;
      }
    }

    localStreamRef.current = stream;
    setMicBlocked(false);
    setMicBlockedReason(null);

    // Step 2: Establish WebRTC Peer Connection and Publish Offer to Firebase
    try {
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      // Add local audio tracks to peer connection
      for (const track of stream.getAudioTracks()) {
        pc.addTrack(track, stream);
      }

      // Handle remote audio stream
      pc.ontrack = (event) => {
        if (remoteAudioRef.current && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      // Handle ICE Candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && conversationId) {
          sendIceCandidate({
            conversationId,
            role: "caller",
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            },
          }).catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          callAudio.stop();
          setCallState("connected");
        } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          cleanupMediaAndPeer();
          setCallState("idle");
        }
      };

      // Create Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Publish Offer to Firebase Signaling
      await publishCallOffer({
        conversationId,
        callerUid: currentUserUid,
        offer: {
          type: "offer",
          sdp: offer.sdp || "",
        },
      });

      // 35-second unanswered call timeout
      callTimeoutRef.current = window.setTimeout(async () => {
        if (callStateRef.current === "calling" || callStateRef.current === "ringing") {
          callAudio.playDisconnect();
          if (conversationId) {
            await endCallSignal({ conversationId }).catch(() => {});
          }
          cleanupMediaAndPeer();
          setCallState("timeout");
          if (onError) onError(`No answer from ${peerName}. Call timed out.`);
          setTimeout(() => {
            setCallState("idle");
          }, 2500);
        }
      }, 35000);
    } catch (signalingErr) {
      console.error("[WebRTC] Failed to publish call signaling offer:", signalingErr);
      cleanupMediaAndPeer();
      setCallState("idle");
      const isPermissionDenied =
        signalingErr instanceof Error &&
        signalingErr.message.toLowerCase().includes("permission_denied");
      const errMsg = isPermissionDenied
        ? "Firebase Database permission denied for calls node. Update calls rule in Firebase console."
        : "Failed to establish call connection: " +
          (signalingErr instanceof Error ? signalingErr.message : "Network error");
      if (onError) onError(errMsg);
    }
  }, [conversationId, currentUserUid, cleanupMediaAndPeer, onError, peerName]);

  /**
   * Accepts an incoming voice call.
   */
  const acceptCall = useCallback(async () => {
    if (!conversationId || !activeSignal || !activeSignal.offer) return;

    callAudio.stop();
    callRoleRef.current = "receiver";
    setCallRole("receiver");

    // Step 1: Request Microphone Stream with Fallback
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (firstErr) {
      console.warn("[WebRTC] Advanced audio constraints failed, trying basic audio: true", firstErr);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (micErr) {
        console.error("[WebRTC] Microphone access failed completely:", micErr);
        cleanupMediaAndPeer();
        setCallState("idle");
        const diag = await diagnoseMicrophoneError(micErr);
        setMicBlocked(true);
        setMicBlockedReason(diag.type);
        const rawErr = micErr instanceof Error ? ` (${micErr.name}: ${micErr.message})` : "";
        if (onError) onError(diag.message + rawErr);
        return;
      }
    }

    localStreamRef.current = stream;
    setMicBlocked(false);
    setMicBlockedReason(null);

    // Step 2: Establish WebRTC Peer Connection and Publish Answer to Firebase
    try {
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      // Add local audio tracks
      for (const track of stream.getAudioTracks()) {
        pc.addTrack(track, stream);
      }

      // Handle remote audio stream
      pc.ontrack = (event) => {
        if (remoteAudioRef.current && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      // Handle ICE Candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && conversationId) {
          sendIceCandidate({
            conversationId,
            role: "receiver",
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            },
          }).catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          callAudio.stop();
          setCallState("connected");
        } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          cleanupMediaAndPeer();
          setCallState("idle");
        }
      };

      // Set Remote Offer
      await pc.setRemoteDescription(
        new RTCSessionDescription(activeSignal.offer)
      );

      // Create and set local Answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Publish Answer to Firebase Signaling
      await publishCallAnswer({
        conversationId,
        answer: {
          type: "answer",
          sdp: answer.sdp || "",
        },
      });

      // Add any pre-existing caller candidates
      if (activeSignal.callerCandidates) {
        for (const c of Object.values(activeSignal.callerCandidates)) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          } catch {
            // Ignored
          }
        }
      }

      setCallState("connected");
    } catch (signalingErr) {
      console.error("[WebRTC] Failed to accept call signaling answer:", signalingErr);
      cleanupMediaAndPeer();
      setCallState("idle");
      const isPermissionDenied =
        signalingErr instanceof Error &&
        signalingErr.message.toLowerCase().includes("permission_denied");
      const errMsg = isPermissionDenied
        ? "Firebase Database permission denied for calls node. Update calls rule in Firebase console."
        : "Failed to establish call connection: " +
          (signalingErr instanceof Error ? signalingErr.message : "Network error");
      if (onError) onError(errMsg);
    }
  }, [conversationId, activeSignal, cleanupMediaAndPeer, onError]);

  /**
   * Declines an incoming call.
   */
  const declineCall = useCallback(async () => {
    callAudio.stop();
    if (conversationId) {
      await declineCallSignal({ conversationId });
    }
    cleanupMediaAndPeer();
    setCallState("idle");
  }, [conversationId, cleanupMediaAndPeer]);

  /**
   * Starts a local audio loopback echo test.
   * Connects microphone -> 120ms delay node -> audio output + level analyzer.
   * Allows users to test microphone hardware, permissions, and hear their own voice with realistic latency.
   */
  const startEchoTest = useCallback(async () => {
    cleanupMediaAndPeer();
    setCallRole("caller");
    callRoleRef.current = "caller";
    setIsEchoTest(true);
    setCallState("connected");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.error("[Echo Test] Mic failed:", err);
        cleanupMediaAndPeer();
        setCallState("idle");
        const diag = await diagnoseMicrophoneError(err);
        setMicBlocked(true);
        setMicBlockedReason(diag.type);
        return;
      }
    }

    localStreamRef.current = stream;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      echoCtxRef.current = audioCtx;

      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const delay = audioCtx.createDelay(1.0);
      delay.delayTime.value = 0.12; // 120ms realistic delay
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.85;

      source.connect(analyser);
      source.connect(delay);
      delay.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const checkLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        echoAnimRef.current = requestAnimationFrame(checkLevel);
      };
      echoAnimRef.current = requestAnimationFrame(checkLevel);
    } catch (err) {
      console.error("[Echo Test] Web Audio routing failed:", err);
    }
  }, [cleanupMediaAndPeer]);

  /**
   * Ends an active or outgoing call.
   */
  const endCall = useCallback(async () => {
    callAudio.stop();
    if (isEchoTest) {
      callAudio.playDisconnect();
      cleanupMediaAndPeer();
      setCallState("ended");
      setTimeout(() => setCallState("idle"), 1200);
      return;
    }
    if (conversationId) {
      await endCallSignal({ conversationId });
    }
    cleanupMediaAndPeer();
    setCallState("idle");
  }, [isEchoTest, conversationId, cleanupMediaAndPeer]);

  /**
   * Toggles microphone mute state.
   */
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const tracks = localStreamRef.current.getAudioTracks();
    if (tracks.length > 0) {
      const nextMute = !isMuted;
      for (const t of tracks) {
        t.enabled = !nextMute;
      }
      setIsMuted(nextMute);
    }
  }, [isMuted]);

  const retryMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const t of stream.getAudioTracks()) t.stop();
      setMicBlocked(false);
      setMicBlockedReason(null);
      await startCall();
      return true;
    } catch {
      if (typeof window !== "undefined") {
        window.location.reload();
      }
      return false;
    }
  }, [startCall]);

  const dismissMicBlocked = useCallback(() => {
    setMicBlocked(false);
    setMicBlockedReason(null);
  }, []);

  return {
    callState,
    callRole,
    isMuted,
    durationSec,
    activeSignal,
    micBlocked,
    micBlockedReason,
    isEchoTest,
    micLevel,
    startCall,
    startEchoTest,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    retryMicrophone,
    dismissMicBlocked,
  };
}
