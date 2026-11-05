import React from "react";
import { Icon } from "@/components/icons";

type WelcomeScreenProps = {
  onJoinInvite: () => void;
  onScanQR: () => void;
  onSignIn: () => void;
  onEnterPreview: () => void;
};

export function WelcomeScreen({
  onJoinInvite,
  onScanQR,
  onSignIn,
  onEnterPreview,
}: WelcomeScreenProps) {
  return (
    <main className="welcome-screen">
      <div className="welcome-glow" />

      <header className="welcome-top">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="ghost" size={20} />
          </span>
          <span>
            ghost<span className="brand-accent">chat</span>
          </span>
          <span className="brand-beta">V1.0</span>
        </div>
        <span className="welcome-private">
          <Icon name="shieldCheck" size={14} />
          <span>INVITE ONLY</span>
        </span>
      </header>

      <div className="welcome-content">
        <div className="welcome-art" aria-hidden="true">
          <span className="welcome-ring ring-one" />
          <span className="welcome-ring ring-two" />
          <div className="welcome-lock">
            <Icon name="lock" size={38} strokeWidth={1.7} />
          </div>
          <span className="art-spark spark-a">✦</span>
          <span className="art-spark spark-b">✧</span>
          <span className="art-spark spark-c">✳</span>
        </div>

        <p className="eyebrow">EPHEMERAL & ENCRYPTED</p>
        <h1>
          Private by <span>Invite</span>
        </h1>
        <p className="welcome-description">
          A secure, ephemeral messaging space for people you trust.
          End-to-end encrypted, zero plaintext on the server, and 20-minute
          auto-purge.
        </p>

        <div className="welcome-actions">
          <button
            type="button"
            className="welcome-primary"
            onClick={onJoinInvite}
          >
            <Icon name="key" size={17} />
            <span>Join with Invite Code</span>
          </button>

          <button
            type="button"
            className="welcome-secondary"
            onClick={onScanQR}
          >
            <Icon name="qr" size={17} />
            <span>Scan Invite QR</span>
          </button>

          <button
            type="button"
            className="welcome-enter-preview"
            onClick={onEnterPreview}
          >
            <Icon name="chat" size={16} />
            <span>Open Chat Workspace Preview</span>
          </button>

          <button
            type="button"
            className="welcome-signin"
            onClick={onSignIn}
          >
            Have an account? <strong>Sign In</strong>
          </button>
        </div>

        <div className="welcome-note">
          <Icon name="lock" size={13} />
          <span>No unencrypted messages are ever stored on the server.</span>
        </div>
      </div>

      <footer className="welcome-footer">
        ZERO PLAINTEXT <span>·</span> 20-MIN AUTO-PURGE <span>·</span> DESTROY
        FOR BOTH
      </footer>
    </main>
  );
}
