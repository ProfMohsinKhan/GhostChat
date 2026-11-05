import React, { useState } from "react";
import { Icon } from "@/components/icons";

type PrivacySettingsViewProps = {
  email: string;
  defaultTimer: string;
  onSelectTimer: (timer: string) => void;
  onOpenIdentity: () => void;
  onSignOut: () => void;
  notify: (msg: string) => void;
};

export function PrivacySettingsView({
  email,
  defaultTimer,
  onSelectTimer,
  onOpenIdentity,
  onSignOut,
  notify,
}: PrivacySettingsViewProps) {
  const [requireLock, setRequireLock] = useState(true);
  const [deleteForBoth, setDeleteForBoth] = useState(true);
  const timerOptions = ["5 min", "10 min", "20 min", "1 hour"];

  return (
    <div className="settings-panel-content">
      <header className="panel-heading settings-heading">
        <div>
          <p className="eyebrow">PREFERENCES</p>
          <h1>Privacy &amp; Security</h1>
        </div>
        <span className="settings-emblem">
          <Icon name="shieldCheck" size={20} />
        </span>
      </header>

      {/* Profile Bar */}
      <div className="settings-profile">
        <span className="avatar avatar-me avatar-large">
          {email ? email.slice(0, 1).toUpperCase() : "G"}
        </span>
        <div className="settings-profile-info">
          <strong>{email || "Signed-in Account"}</strong>
          <span>End-to-End Encrypted Identity Active</span>
        </div>
      </div>

      {/* Group 1: App Lock */}
      <div className="settings-group">
        <p className="settings-label">APP LOCK</p>

        <div className="setting-row">
          <span className="setting-icon">
            <Icon name="lock" size={17} />
          </span>
          <span className="setting-copy">
            <strong>Require Biometric / PIN</strong>
            <small>Unlock GhostChat with Face ID, Touch ID, or PIN</small>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={requireLock}
            className={`toggle-switch ${requireLock ? "on" : ""}`}
            onClick={() => {
              const next = !requireLock;
              setRequireLock(next);
              notify(
                next
                  ? "App Lock enabled on this device."
                  : "App Lock disabled."
              );
            }}
            aria-label="Toggle App Lock"
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <button
          type="button"
          className="setting-row interactive-row"
          onClick={() =>
            notify(
              "PIN configuration is a client-side device feature in Phase 1."
            )
          }
        >
          <span className="setting-icon">
            <Icon name="key" size={17} />
          </span>
          <span className="setting-copy">
            <strong>Change PIN</strong>
            <small>Set a 6-digit local hardware access code</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      </div>

      {/* Group 2: Disappearing Messages */}
      <div className="settings-group">
        <p className="settings-label">DISAPPEARING MESSAGES</p>

        <div className="timer-setting">
          <div>
            <strong>Default Auto-Delete Timer</strong>
            <small>Applied to newly initiated conversations</small>
          </div>
          <Icon name="clock" size={17} className="clock-accent" />
        </div>

        <div className="timer-options-grid">
          {timerOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`timer-pill-btn ${
                defaultTimer === option ? "selected" : ""
              }`}
              onClick={() => {
                onSelectTimer(option);
                notify(`Default auto-delete set to ${option}.`);
              }}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="setting-row">
          <span className="setting-icon danger-icon">
            <Icon name="trash" size={17} />
          </span>
          <span className="setting-copy">
            <strong>Delete for Both Users</strong>
            <small>Remove messages from your contact&apos;s device too</small>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={deleteForBoth}
            className={`toggle-switch ${deleteForBoth ? "on" : ""}`}
            onClick={() => {
              const next = !deleteForBoth;
              setDeleteForBoth(next);
              notify(
                next
                  ? "Mutual destruction preference enabled."
                  : "Local-only deletion mode."
              );
            }}
            aria-label="Toggle delete for both users preference"
          >
            <span className="toggle-handle" />
          </button>
        </div>
      </div>

      {/* Group 3: Privacy */}
      <div className="settings-group">
        <p className="settings-label">PRIVACY</p>

        <button
          type="button"
          className="setting-row interactive-row"
          onClick={() => notify("No contacts currently in block list.")}
        >
          <span className="setting-icon">
            <Icon name="users" size={17} />
          </span>
          <span className="setting-copy">
            <strong>Block List</strong>
            <small>Manage contacts who cannot send messages to you</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>

        <button
          type="button"
          className="setting-row interactive-row"
          onClick={() =>
            notify("Report a user is an operational placeholder for Phase 1.")
          }
        >
          <span className="setting-icon">
            <Icon name="info" size={17} />
          </span>
          <span className="setting-copy">
            <strong>Report a User</strong>
            <small>Submit encrypted metadata for trust &amp; safety review</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      </div>

      {/* Group 4: Cryptographic Identity */}
      <div className="settings-group">
        <p className="settings-label">CRYPTOGRAPHIC IDENTITY</p>

        <button
          type="button"
          className="setting-row interactive-row"
          onClick={onOpenIdentity}
        >
          <span className="setting-icon secure-icon">
            <Icon name="shieldCheck" size={17} />
          </span>
          <span className="setting-copy">
            <strong>Security Identity</strong>
            <small>View this device&apos;s cryptographic safety fingerprint</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      </div>

      {/* Sign Out */}
      <button
        type="button"
        className="logout-button"
        onClick={onSignOut}
      >
        <Icon name="logout" size={16} />
        <span>Sign Out Session</span>
      </button>
    </div>
  );
}
