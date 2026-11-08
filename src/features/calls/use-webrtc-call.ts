"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { CallSignalData, CallState } from "./types";
import {
  publishCallOffer,
  publishCallAnswer,
  sendIceCandidate,
  endCallSignal,
  declineCallSignal,
  subscribeToCallSignal,
} from "./call-signaling-service";
import { callAudio } from "./call-ringtone";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ],
};

interface UseWebRTCCallProps {
  conversationId: string | null;
  currentUserUid: string;
  peerName?: string;
  enabled?: boolean;
  onIncomingCallBackground?: (callerName: string) => void;
  onError?: (errorMessage: string) => void;
}

export function useWebRTCCall({
  conversationId,
  currentUserUid,
  peerName = "Peer",
  enabled = true,
  onIncomingCallBackground,
  onError,
}: UseWebRTCCallProps) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [activeSignal, setActiveSignal] = useState<CallSignalData | null>(null);
  const [micBlocked, setMicBlocked] = useState<boolean>(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const durationTimerRef = useRef<number | null>(null);
  const callRoleRef = useRef<"caller" | "receiver" | null>(null);
  const candidatesQueueRef = useRef<RTCIceCandidateInit[]>([]);

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
      pcRef.current.close();
      pcRef.current = null;
    }

    candidatesQueueRef.current = [];
    callRoleRef.current = null;
    setIsMuted(false);
  }, []);

  // Subscribe to call signaling updates for this conversation
  useEffect(() => {
    if (!enabled || !conversationId || !currentUserUid) return;

    const unsubscribe = subscribeToCallSignal({
      conversationId,
      onSignal: async (signal) => {
        setActiveSignal(signal);

        // Case 1: No call node exists (Call ended or idle)
        if (!signal) {
          if (callState !== "idle") {
            cleanupMediaAndPeer();
            setCallState("idle");
          }
          return;
        }

        // Case 2: Incoming call for receiver
        if (signal.state === "calling" && signal.callerUid !== currentUserUid) {
          if (callState === "idle") {
            callRoleRef.current = "receiver";
            setCallState("ringing");
            callAudio.startIncomingRing();
            onIncomingCallBackground?.(peerName);
          }
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
          try {
            await pcRef.current.setRemoteDescription(
              new RTCSessionDescription(signal.answer)
            );
            // Process queued receiver candidates
            if (signal.receiverCandidates) {
              for (const c of Object.values(signal.receiverCandidates)) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(c));
              }
            }
          } catch (err) {
            console.warn("[WebRTC] Error setting remote answer:", err);
          }
          setCallState("connected");
        }

        // Process caller candidates if receiver
        if (
          callRoleRef.current === "receiver" &&
          pcRef.current &&
          pcRef.current.remoteDescription &&
          signal.callerCandidates
        ) {
          for (const c of Object.values(signal.callerCandidates)) {
            try {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(c));
            } catch {
              // Duplicate or stale candidate
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
    callState,
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

    try {
      cleanupMediaAndPeer();
      callRoleRef.current = "caller";
      setCallState("calling");
      callAudio.startOutgoingRing();

      // Request microphone stream with fallback
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      localStreamRef.current = stream;
      setMicBlocked(false);

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
    } catch (err) {
      console.error("[WebRTC] Failed to start call:", err);
      cleanupMediaAndPeer();
      setCallState("idle");
      const isDenied =
        err instanceof Error &&
        (err.name === "NotAllowedError" || err.message.toLowerCase().includes("denied"));
      if (isDenied) {
        setMicBlocked(true);
      }
      const errorMsg = isDenied
        ? "Microphone permission is blocked. Click the tune/lock icon in your browser URL bar and set Microphone to 'Allow'."
        : "Could not access microphone: " +
          (err instanceof Error ? err.message : "Permission denied");
      if (onError) {
        onError(errorMsg);
      }
    }
  }, [conversationId, currentUserUid, cleanupMediaAndPeer, onError]);

  /**
   * Accepts an incoming voice call.
   */
  const acceptCall = useCallback(async () => {
    if (!conversationId || !activeSignal || !activeSignal.offer) return;

    try {
      callAudio.stop();
      callRoleRef.current = "receiver";

      // Request microphone stream with fallback
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      localStreamRef.current = stream;
      setMicBlocked(false);

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
    } catch (err) {
      console.error("[WebRTC] Failed to accept call:", err);
      cleanupMediaAndPeer();
      setCallState("idle");
      const isDenied =
        err instanceof Error &&
        (err.name === "NotAllowedError" || err.message.toLowerCase().includes("denied"));
      if (isDenied) {
        setMicBlocked(true);
      }
      const errorMsg = isDenied
        ? "Microphone permission is blocked. Click the tune/lock icon in your browser URL bar and set Microphone to 'Allow'."
        : "Could not access microphone: " +
          (err instanceof Error ? err.message : "Permission denied");
      if (onError) {
        onError(errorMsg);
      }
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
   * Ends an active or outgoing call.
   */
  const endCall = useCallback(async () => {
    callAudio.stop();
    if (conversationId) {
      await endCallSignal({ conversationId });
    }
    cleanupMediaAndPeer();
    setCallState("idle");
  }, [conversationId, cleanupMediaAndPeer]);

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
  }, []);

  return {
    callState,
    isMuted,
    durationSec,
    activeSignal,
    micBlocked,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    retryMicrophone,
    dismissMicBlocked,
  };
}
