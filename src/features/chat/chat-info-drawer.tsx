import React from "react";
import type { Contact } from "./types";
import { Icon } from "@/components/icons";

type ChatInfoDrawerProps = {
  contact: Contact;
  activeTimer: string;
  onClose: () => void;
  onOpenVerify: () => void;
  onOpenEphemeral: () => void;
  onDestroy: () => void;
  notify: (msg: string) => void;
  onRenameContact?: (newName: string) => void;
};

export function ChatInfoDrawer({
  contact,
  activeTimer,
  onClose,
  onOpenVerify,
  onOpenEphemeral,
  onDestroy,
  notify,
  onRenameContact,
}: ChatInfoDrawerProps) {
  const [nicknameInput, setNicknameInput] = React.useState(contact.name);

  React.useEffect(() => {
    setNicknameInput(contact.name);
  }, [contact.name]);
  return (
    <div
      className="info-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <aside
        className="info-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Conversation Details"
      >
        <header className="drawer-header">
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Back"
          >
            <Icon name="arrow" size={18} />
          </button>
          <span>Chat Info</span>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        {/* Profile Card */}
        <div className="drawer-person">
          <div className="avatar-wrap">
            <span className={`avatar avatar-${contact.color} avatar-large`}>
              {contact.avatarIcon === "users" ? (
                <Icon name="users" size={32} />
              ) : (
                contact.initials
              )}
            </span>
            {contact.online && <span className="online-dot online-dot-lg" />}
          </div>

          <div className="drawer-person-text">
            <div className="drawer-person-name">
              <h3>{contact.name}</h3>
              <Icon name="lock" size={15} className="chat-lock-icon" />
            </div>
            <span className="drawer-person-status">
              {contact.online ? (
                <>
                  <i className="status-online" /> Online
                </>
              ) : (
                <>
                  <i className="status-offline" />{" "}
                  {contact.lastSeen ?? "Offline"}
                </>
              )}
            </span>
          </div>

          {onRenameContact && (
            <div style={{ marginTop: "0.75rem", width: "100%", maxWidth: "260px" }}>
              <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder="Set custom nickname..."
                  maxLength={30}
                  style={{
                    flex: 1,
                    background: "rgba(0, 0, 0, 0.35)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    padding: "0.35rem 0.6rem",
                    color: "#fff",
                    fontSize: "0.85rem",
                  }}
                />
                <button
                  type="button"
                  className="primary-button"
                  style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem", cursor: "pointer" }}
                  onClick={() => {
                    if (nicknameInput.trim()) {
                      onRenameContact(nicknameInput.trim());
                      notify(`Contact renamed to "${nicknameInput.trim()}"`);
                    }
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Quick Action Circles */}
          <div className="drawer-quick-actions">
            <button
              type="button"
              className="quick-action-circle"
              onClick={() => notify("Calling is a preview feature in Phase 1.")}
              title="Voice call"
            >
              <span className="circle-icon">
                <Icon name="phone" size={17} />
              </span>
              <span className="circle-label">Call</span>
            </button>

            <button
              type="button"
              className="quick-action-circle"
              onClick={() => notify("Video is a preview feature in Phase 1.")}
              title="Video call"
            >
              <span className="circle-icon">
                <Icon name="video" size={17} />
              </span>
              <span className="circle-label">Video</span>
            </button>

            <button
              type="button"
              className={`quick-action-circle active-verify ${contact.isKeyChanged ? "key-changed-alert" : ""}`}
              onClick={onOpenVerify}
              title={contact.isKeyChanged ? "Security Key Changed!" : "Verify Security Key"}
            >
              <span className={`circle-icon ${contact.isKeyChanged ? "crimson-glow" : "teal-glow"}`} style={contact.isKeyChanged ? { color: "var(--crimson)" } : undefined}>
                <Icon name={contact.isKeyChanged ? "shieldAlert" : "shieldCheck"} size={17} />
              </span>
              <span className="circle-label" style={contact.isKeyChanged ? { color: "var(--crimson)", fontWeight: 600 } : undefined}>
                {contact.isKeyChanged ? "Key Changed!" : contact.verified ? "Verified" : "Verify Key"}
              </span>
            </button>
          </div>
        </div>

        {/* Action Menu List */}
        <div className="drawer-menu-list">
          <button
            type="button"
            className="drawer-menu-item"
            onClick={onOpenVerify}
          >
            <span className="drawer-item-icon" style={contact.isKeyChanged ? { color: "var(--crimson)" } : undefined}>
              <Icon name={contact.isKeyChanged ? "shieldAlert" : "key"} size={17} />
            </span>
            <span className="drawer-item-text">
              <strong style={contact.isKeyChanged ? { color: "var(--crimson)" } : undefined}>
                {contact.isKeyChanged ? "Security Key Changed" : "Verify Security Key"}
              </strong>
              <small>
                {contact.isKeyChanged
                  ? "Identity key changed since last verification. Tap to review."
                  : contact.verified
                  ? "Identity verified with security numbers."
                  : "Compare cryptographic identity fingerprint"}
              </small>
            </span>
            <Icon name="chevron" size={16} />
          </button>

          <button
            type="button"
            className="drawer-menu-item"
            onClick={() =>
              notify(
                `${contact.name} has ${contact.linkedDevicesCount} active cryptographic device key pairs.`
              )
            }
          >
            <span className="drawer-item-icon">
              <Icon name="users" size={17} />
            </span>
            <span className="drawer-item-text">
              <strong>Linked Devices ({contact.linkedDevicesCount})</strong>
              <small>End-to-end device keys</small>
            </span>
            <Icon name="chevron" size={16} />
          </button>

          <button
            type="button"
            className="drawer-menu-item"
            onClick={onOpenEphemeral}
          >
            <span className="drawer-item-icon">
              <Icon name="clock" size={17} />
            </span>
            <span className="drawer-item-text">
              <strong>Auto-Delete</strong>
              <small>Currently set to {activeTimer}</small>
            </span>
            <span className="timer-badge-indicator">{activeTimer}</span>
            <Icon name="chevron" size={16} />
          </button>

          <button
            type="button"
            className="drawer-menu-item danger-menu-item"
            onClick={onDestroy}
          >
            <span className="drawer-item-icon danger-icon">
              <Icon name="trash" size={17} />
            </span>
            <span className="drawer-item-text">
              <strong>Destroy for Both</strong>
              <small>Revoke generation and delete encrypted history</small>
            </span>
            <Icon name="chevron" size={16} />
          </button>

          <button
            type="button"
            className="drawer-menu-item danger-menu-item"
            onClick={() =>
              notify(
                `${contact.name} has been added to your local block list.`
              )
            }
          >
            <span className="drawer-item-icon danger-icon">
              <Icon name="close" size={17} />
            </span>
            <span className="drawer-item-text">
              <strong>Block User</strong>
              <small>Reject future messages from this identity</small>
            </span>
            <Icon name="chevron" size={16} />
          </button>

          <button
            type="button"
            className="drawer-menu-item subtle-menu-item"
            onClick={() =>
              notify("Report feature is a preview placeholder for Phase 1.")
            }
          >
            <span className="drawer-item-icon">
              <Icon name="info" size={17} />
            </span>
            <span className="drawer-item-text">
              <strong>Report Contact</strong>
              <small>Submit encrypted metadata for review</small>
            </span>
            <Icon name="chevron" size={16} />
          </button>
        </div>

        {/* Safety Footer Note */}
        <div className="drawer-safety-box">
          <Icon name="shieldCheck" size={20} />
          <div>
            <strong>Zero-Knowledge Transport</strong>
            <p>
              Only you and {contact.name} have the keys to decrypt these
              messages. The server stores opaque ciphertexts.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
