"use client";

import React from "react";
import { Icon } from "@/components/icons";
import type { CallState } from "./types";

interface CallModalProps {
  peerName: string;
  peerInitials?: string;
  callState: CallState;
  durationSec: number;
  isMuted: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function CallModal({
  peerName,
  peerInitials,
  callState,
  durationSec,
  isMuted,
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
}: CallModalProps) {
  if (callState === "idle") return null;

  const initials = peerInitials || peerName.slice(0, 2).toUpperCase();

  // Active connected call: Render sleek, non-blocking floating call bar so users can still read/send messages!
  if (callState === "connected") {
    return (
      <div className="active-call-floating-bar" role="region" aria-label="Active voice call">
        <div className="call-bar-status-pulse">
          <span className="live-pulse-dot" />
          <span className="call-duration-text">{formatDuration(durationSec)}</span>
        </div>

        <div className="call-bar-peer-info">
          <Icon name="phone" size={14} className="call-active-icon" />
          <span className="call-peer-name">{peerName}</span>
          <span className="call-encryption-pill" title="DTLS-SRTP Hardware-Level End-to-End Encrypted">
            <Icon name="lock" size={10} />
            <span>P2P E2EE</span>
          </span>
        </div>

        <div className="call-bar-actions">
          <button
            type="button"
            className={`call-action-btn mute-btn ${isMuted ? "muted" : ""}`}
            onClick={onToggleMute}
            title={isMuted ? "Unmute microphone" : "Mute microphone"}
            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
          >
            <Icon name={isMuted ? "micOff" : "mic"} size={16} />
            <span>{isMuted ? "Muted" : "Mute"}</span>
          </button>

          <button
            type="button"
            className="call-action-btn end-btn"
            onClick={onEnd}
            title="End call"
            aria-label="End call"
          >
            <Icon name="phoneOff" size={16} />
            <span>End</span>
          </button>
        </div>
      </div>
    );
  }

  // Incoming Call Overlay
  if (callState === "ringing") {
    return (
      <div className="call-overlay-backdrop" role="dialog" aria-modal="true" aria-label="Incoming voice call">
        <div className="call-overlay-card incoming-card">
          <div className="call-avatar-wrapper">
            <div className="call-ripple-ring" />
            <div className="call-ripple-ring ring-2" />
            <div className="call-avatar-circle">
              <span className="call-avatar-initial">{initials}</span>
            </div>
          </div>

          <h3 className="call-card-title">{peerName}</h3>
          <p className="call-card-subtitle">GhostChat Encrypted Voice Call</p>

          <div className="call-card-security-badge">
            <Icon name="lock" size={12} />
            <span>Direct Peer-to-Peer • Zero Server Trace</span>
          </div>

          <div className="incoming-call-actions">
            <button
              type="button"
              className="incoming-btn decline-call-btn"
              onClick={onDecline}
              title="Decline Call"
              aria-label="Decline Call"
            >
              <div className="btn-circle-icon">
                <Icon name="phoneOff" size={20} />
              </div>
              <span>Decline</span>
            </button>

            <button
              type="button"
              className="incoming-btn accept-call-btn"
              onClick={onAccept}
              title="Accept Call"
              aria-label="Accept Call"
            >
              <div className="btn-circle-icon pulse">
                <Icon name="phone" size={20} />
              </div>
              <span>Accept</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Outgoing Calling Overlay
  if (callState === "calling") {
    return (
      <div className="call-overlay-backdrop" role="dialog" aria-modal="true" aria-label="Outgoing voice call">
        <div className="call-overlay-card outgoing-card">
          <div className="call-avatar-wrapper">
            <div className="call-ripple-ring" />
            <div className="call-ripple-ring ring-2" />
            <div className="call-avatar-circle">
              <span className="call-avatar-initial">{initials}</span>
            </div>
          </div>

          <h3 className="call-card-title">{peerName}</h3>
          <p className="call-card-subtitle calling-text">Calling…</p>

          <div className="call-card-security-badge">
            <Icon name="lock" size={12} />
            <span>End-to-End Encrypted (Google STUN)</span>
          </div>

          <div className="outgoing-call-actions">
            <button
              type="button"
              className="outgoing-end-btn"
              onClick={onEnd}
              title="Cancel Call"
              aria-label="Cancel Call"
            >
              <div className="btn-circle-icon">
                <Icon name="phoneOff" size={22} />
              </div>
              <span>Cancel</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Declined or Ended Toast Pill
  if (callState === "declined" || callState === "ended") {
    return (
      <div className="call-toast-banner" role="status">
        <Icon name="phoneOff" size={14} />
        <span>{callState === "declined" ? "Call Declined" : "Call Ended"}</span>
      </div>
    );
  }

  return null;
}
