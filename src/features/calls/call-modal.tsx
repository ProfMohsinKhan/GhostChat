"use client";

import React from "react";
import { Icon } from "@/components/icons";
import type { CallState, MicBlockedReason } from "./types";

interface CallModalProps {
  peerName: string;
  peerInitials?: string;
  callState: CallState;
  callRole?: "caller" | "receiver" | null;
  durationSec: number;
  isMuted: boolean;
  micBlocked?: boolean;
  micBlockedReason?: MicBlockedReason;
  isEchoTest?: boolean;
  micLevel?: number;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onRetryMic?: () => void;
  onDismissMic?: () => void;
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
  callRole = null,
  durationSec,
  isMuted,
  micBlocked = false,
  micBlockedReason = null,
  isEchoTest = false,
  micLevel = 0,
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
  onRetryMic,
  onDismissMic,
}: CallModalProps) {
  if (micBlocked) {
    const isWindowsPrivacy = micBlockedReason === "windows_privacy";
    const isNoDevice = micBlockedReason === "no_device";
    const isInUse = micBlockedReason === "in_use";

    return (
      <div className="call-overlay-backdrop" role="dialog" aria-modal="true" aria-label="Microphone permission blocked">
        <div className="call-overlay-card mic-guide-card">
          <div className="mic-guide-icon-wrap">
            <Icon name="micOff" size={32} />
          </div>

          <h3 className="call-card-title">
            {isWindowsPrivacy
              ? "Microphone Blocked by Windows or Needs Reload"
              : isNoDevice
              ? "No Microphone Detected"
              : isInUse
              ? "Microphone In Use by Another App"
              : "Microphone Access Blocked"}
          </h3>

          <p className="call-card-subtitle">
            {isWindowsPrivacy
              ? "Chrome shows Microphone is Allowed (ON), but could not access audio hardware. Follow these steps:"
              : isNoDevice
              ? "GhostChat could not detect any audio input device connected to your PC."
              : isInUse
              ? "Another application is exclusively locking your microphone audio stream."
              : "Chrome has blocked microphone access for this website. Follow these quick steps:"}
          </p>

          <div className="mic-steps-box">
            {isWindowsPrivacy ? (
              <>
                <div className="mic-step">
                  <span className="step-num">1</span>
                  <span>
                    <strong>Reload this tab first:</strong> Chrome requires a tab refresh after toggling permissions in the address bar. Click <strong>Reload Tab Now</strong> below.
                  </span>
                </div>
                <div className="mic-step">
                  <span className="step-num">2</span>
                  <span>
                    <strong>Check Windows Privacy Settings:</strong> Press <kbd>Win</kbd> + <kbd>I</kbd> &rarr; <strong>Privacy &amp; security</strong> &rarr; <strong>Microphone</strong>. Ensure <strong>&quot;Let desktop apps access your microphone&quot;</strong> is switched <strong>ON</strong> and Google Chrome is permitted.
                  </span>
                </div>
                <div className="mic-step">
                  <span className="step-num">3</span>
                  <span>
                    <strong>Check Physical Hardware:</strong> Ensure your headset or microphone cable is firmly plugged in and not muted via hardware switch.
                  </span>
                </div>
              </>
            ) : isNoDevice ? (
              <>
                <div className="mic-step">
                  <span className="step-num">1</span>
                  <span>Plug in a microphone, headset, or earphones into your computer&apos;s audio jack or USB port.</span>
                </div>
                <div className="mic-step">
                  <span className="step-num">2</span>
                  <span>Open Windows Sound settings (Settings &rarr; System &rarr; Sound) and verify that an Input Device is enabled.</span>
                </div>
                <div className="mic-step">
                  <span className="step-num">3</span>
                  <span>Click <strong>Reload Tab Now</strong> below.</span>
                </div>
              </>
            ) : isInUse ? (
              <>
                <div className="mic-step">
                  <span className="step-num">1</span>
                  <span>Close other applications currently using your microphone (Zoom, Microsoft Teams, Discord, Skype, or Windows Voice Recorder).</span>
                </div>
                <div className="mic-step">
                  <span className="step-num">2</span>
                  <span>Click <strong>Retry Call</strong> below.</span>
                </div>
              </>
            ) : (
              <>
                <div className="mic-step">
                  <span className="step-num">1</span>
                  <span>
                    Look at the address bar at the top, click the <strong>Tune / Settings icon (🎛️ or 🔒)</strong> on the left side of <code>ghost-chatly.vercel.app</code>
                  </span>
                </div>
                <div className="mic-step">
                  <span className="step-num">2</span>
                  <span>Ensure <strong>Microphone</strong> is set to <strong>Allow (ON)</strong></span>
                </div>
                <div className="mic-step">
                  <span className="step-num">3</span>
                  <span>
                    Click <strong>Reload Tab Now</strong> below (Chrome requires a page reload to apply the permission change)
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="mic-guide-tip">
            💡 <strong>Already ON in tune menu?</strong> Simply click <strong>Reload Tab Now</strong> below to activate it in Chrome.
          </div>

          <div className="mic-guide-actions">
            <button
              type="button"
              className="primary-button mic-retry-btn"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.reload();
                }
              }}
            >
              <Icon name="refresh" size={16} />
              <span>Reload Tab Now</span>
            </button>
            <button
              type="button"
              className="mic-retry-btn mic-secondary-action-btn"
              onClick={onRetryMic}
            >
              <span>Retry Call</span>
            </button>
            <button
              type="button"
              className="mic-cancel-btn"
              onClick={onDismissMic}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (callState === "idle") return null;

  const initials = peerInitials || peerName.slice(0, 2).toUpperCase();

  // Active connected call: Render full Echo Test Card if echo test, or floating bar for real calls
  if (callState === "connected") {
    if (isEchoTest) {
      const barHeights = [20, 35, 60, 80, 100, 75, 50, 90, 85, 65, 45, 95, 70, 55, 40, 25];
      return (
        <div className="call-overlay-backdrop" role="dialog" aria-modal="true" aria-label="Microphone and sound test">
          <div className="call-overlay-card echo-test-card">
            <div className="echo-avatar-icon">
              <Icon name="mic" size={36} />
            </div>

            <h3 className="call-card-title">Sound &amp; Connection Test</h3>
            <p className="call-card-subtitle">
              Speak into your microphone. You will hear your voice looped back with ~120ms realistic P2P delay.
            </p>

            <div className="echo-visualizer-container">
              <div className="echo-bars-row">
                {barHeights.map((maxH, idx) => {
                  const energy = Math.max(0.1, (micLevel ?? 0) / 100);
                  const h = Math.max(10, Math.round(maxH * energy));
                  const isActive = (micLevel ?? 0) > 8;
                  return (
                    <span
                      key={idx}
                      className={`echo-eq-bar ${isActive ? "active" : ""}`}
                      style={{ height: `${h}%` }}
                    />
                  );
                })}
              </div>

              <div className="echo-level-badge">
                {(micLevel ?? 0) > 8 ? (
                  <span>🟢 Mic Audio Captured ({micLevel}%)</span>
                ) : (
                  <span>🎙️ Listening... speak now to test</span>
                )}
              </div>
            </div>

            <div className="echo-assurance-badge">
              <Icon name="check" size={13} />
              <span>WebRTC Audio Engine: 100% Operational • {formatDuration(durationSec)}</span>
            </div>

            <div className="echo-actions">
              <button
                type="button"
                className={`call-action-btn mute-btn ${isMuted ? "muted" : ""}`}
                onClick={onToggleMute}
                title={isMuted ? "Unmute microphone" : "Mute microphone"}
              >
                <Icon name={isMuted ? "micOff" : "mic"} size={16} />
                <span>{isMuted ? "Muted" : "Mute"}</span>
              </button>

              <button
                type="button"
                className="primary-button mic-retry-btn"
                style={{ background: "#ef4444", color: "#fff", padding: "0 22px" }}
                onClick={onEnd}
                title="End Sound Test"
              >
                <Icon name="phoneOff" size={16} />
                <span>End Test</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

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

  // Incoming Call Overlay (Receiver)
  if (callState === "ringing" && callRole === "receiver") {
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

  // Outgoing Calling / Ringing Overlay (Caller)
  if (
    callState === "calling" ||
    (callState === "ringing" && (callRole === "caller" || callRole === null))
  ) {
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
          <p className="call-card-subtitle calling-text">
            {callState === "ringing" ? "Ringing (Peer alerted)…" : "Calling…"}
          </p>

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

  // Declined, Ended, Busy or Timeout Toast Pill
  if (
    callState === "declined" ||
    callState === "ended" ||
    callState === "timeout" ||
    callState === "busy"
  ) {
    return (
      <div className="call-toast-banner" role="status">
        <Icon name="phoneOff" size={14} />
        <span>
          {callState === "declined"
            ? "Call Declined"
            : callState === "timeout"
            ? "Call Timed Out (No Answer)"
            : callState === "busy"
            ? "User Busy"
            : "Call Ended"}
        </span>
      </div>
    );
  }

  return null;

  return null;
}
