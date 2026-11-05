import React, { useState } from "react";
import type { Contact, SampleMessage } from "./types";
import { Icon } from "@/components/icons";

type ChatViewProps = {
  contact: Contact;
  activeTimer?: string;
  onBack: () => void;
  onOpenInfo: () => void;
  onOpenEphemeralModal: () => void;
  onOpenDestroyModal: () => void;
  onSendMessage: (text: string) => void;
  onTyping?: (isTyping: boolean) => void;
  isLive?: boolean;
  isKeyReady?: boolean;
  isDestroyed?: boolean;
  onReopenSession?: () => void;
  onRenameContact?: (newName: string) => void;
  onDeleteConversation?: () => void;
};

export function ChatView({
  contact,
  activeTimer = "20 min",
  onBack,
  onOpenInfo,
  onOpenEphemeralModal,
  onOpenDestroyModal,
  onSendMessage,
  onTyping,
  isLive,
  isKeyReady = true,
  isDestroyed = false,
  onReopenSession,
  onRenameContact,
  onDeleteConversation,
}: ChatViewProps) {
  const [inputText, setInputText] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(contact.name);

  // Sync editedName when contact changes
  React.useEffect(() => {
    setEditedName(contact.name);
    setIsEditingName(false);
  }, [contact.id, contact.name]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (isDestroyed || !inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText("");
    onTyping?.(false);
  }

  return (
    <section
      className="conversation"
      aria-label={`Conversation with ${contact.name}`}
    >
      {/* Conversation Header */}
      <header className="conversation-header">
        <button
          type="button"
          className="mobile-back icon-button"
          onClick={onBack}
          aria-label="Back to conversation list"
        >
          <Icon name="arrow" size={20} />
        </button>

        <div className="header-person">
          <div
            className="avatar-wrap"
            onClick={onOpenInfo}
            role="button"
            tabIndex={0}
            style={{ cursor: "pointer" }}
            aria-label={`View ${contact.name}'s details`}
          >
            <span className={`avatar avatar-${contact.color}`}>
              {contact.avatarIcon === "users" ? (
                <Icon name="users" size={20} />
              ) : (
                contact.initials
              )}
            </span>
            {contact.online && <span className="online-dot" />}
          </div>

          <span className="header-person-copy">
            <span className="header-name-row" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              {isEditingName ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editedName.trim()) {
                      onRenameContact?.(editedName.trim());
                      setIsEditingName(false);
                    }
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                >
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    maxLength={30}
                    autoFocus
                    style={{
                      background: "rgba(0, 0, 0, 0.4)",
                      border: "1px solid var(--teal)",
                      borderRadius: "4px",
                      color: "#fff",
                      padding: "2px 6px",
                      fontSize: "0.95rem",
                      fontWeight: 600,
                      width: "140px",
                    }}
                  />
                  <button
                    type="submit"
                    style={{ background: "none", border: "none", color: "var(--teal)", cursor: "pointer", padding: "2px" }}
                    title="Save name"
                    aria-label="Save name"
                  >
                    <Icon name="check" size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditedName(contact.name);
                      setIsEditingName(false);
                    }}
                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px" }}
                    title="Cancel"
                    aria-label="Cancel rename"
                  >
                    <Icon name="close" size={13} />
                  </button>
                </form>
              ) : (
                <>
                  <strong onClick={onOpenInfo} style={{ cursor: "pointer" }}>{contact.name}</strong>
                  <Icon name="lock" size={13} className="header-lock-icon" />
                  {contact.isKeyChanged ? (
                    <span
                      className="verified-shield warning-shield"
                      title="Security Identity Changed - Review Key"
                      style={{ color: "var(--crimson)" }}
                    >
                      <Icon name="shieldAlert" size={14} />
                    </span>
                  ) : contact.verified ? (
                    <span className="verified-shield" title="Identity Verified">
                      <Icon name="shieldCheck" size={13} />
                    </span>
                  ) : null}
                  {onRenameContact && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditedName(contact.name);
                        setIsEditingName(true);
                      }}
                      title="Rename contact"
                      aria-label="Rename contact"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: "2px 4px",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      <Icon name="pencil" size={13} />
                    </button>
                  )}
                </>
              )}
            </span>
            <span className="header-status-row">
              {contact.isTyping ? (
                <span className="header-typing-indicator">
                  <i className="status-online" /> typing…
                </span>
              ) : contact.online ? (
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
          </span>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="icon-button header-call-btn"
            onClick={onOpenInfo}
            aria-label="Audio call (preview)"
            title="Audio call (preview)"
          >
            <Icon name="phone" size={18} />
          </button>
          <button
            type="button"
            className="icon-button header-call-btn"
            onClick={onOpenInfo}
            aria-label="Video call (preview)"
            title="Video call (preview)"
          >
            <Icon name="video" size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onOpenInfo}
            aria-label="More conversation options"
            title="Conversation Details"
          >
            <Icon name="dots" size={18} />
          </button>
        </div>
      </header>

      {/* Security Key Changed Alert Banner */}
      {contact.isKeyChanged && (
        <div
          className="security-key-alert-banner"
          role="alert"
          style={{
            background: "rgba(255, 69, 58, 0.14)",
            borderBottom: "1px solid var(--crimson)",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            color: "var(--crimson)",
            fontSize: "0.85rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="shieldAlert" size={18} />
            <span>
              <strong>Security Key Changed:</strong> {contact.name}&apos;s identity key
              has changed since you verified.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenInfo}
            style={{
              background: "var(--crimson)",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              padding: "4px 10px",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Review Key
          </button>
        </div>
      )}

      {/* Ephemeral Notice Banner */}
      <div className="ephemeral-banner-wrapper">
        <button
          type="button"
          className="ephemeral-banner"
          onClick={onOpenEphemeralModal}
          title="Click to adjust ephemeral auto-delete timer"
        >
          <span className="banner-icon">
            <Icon name="clock" size={16} />
          </span>
          <span className="banner-text">
            <strong>Messages disappear after {activeTimer}</strong>
            <small>Tap to change duration or manage auto-purge</small>
          </span>
          <span className="banner-chevron">
            <Icon name="chevron" size={14} />
          </span>
        </button>
      </div>

      {/* Message Area */}
      <div className="message-area" role="log" aria-live="polite">
        <div className="date-divider">
          <span />
          <span>TODAY · EPHEMERAL SESSION</span>
          <span />
        </div>

        <div className="system-note">
          <Icon name="lock" size={13} />
          <span>
            Messages are end-to-end encrypted. No plaintext is stored on the
            server.
          </span>
        </div>

        {contact.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {contact.isTyping && (
          <div className="message-row theirs typing-row">
            <div className="bubble-wrap">
              <div
                className="message-bubble typing-bubble"
                aria-label={`${contact.name} is typing`}
              >
                <span className="typing-dots">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Quick Action Pills */}
      <div className="ephemeral-action-bar">
        <button
          type="button"
          className="action-pill destroy-pill"
          onClick={onOpenDestroyModal}
        >
          <Icon name="trash" size={14} />
          <span>Destroy for Both</span>
        </button>

        <button
          type="button"
          className="action-pill timer-pill"
          onClick={onOpenEphemeralModal}
        >
          <Icon name="clock" size={14} />
          <span>Auto-Delete: {activeTimer}</span>
          <Icon name="chevronDown" size={13} />
        </button>
      </div>

      {/* Composer */}
      <div className="composer-wrap">
        {isDestroyed && onReopenSession && (
          <div
            style={{
              padding: "0.55rem 1rem",
              background: "rgba(20, 184, 166, 0.12)",
              border: "1px solid rgba(20, 184, 166, 0.3)",
              borderRadius: "8px",
              marginBottom: "0.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
            }}
          >
            <span style={{ fontSize: "0.85rem", color: "#2dd4bf" }}>
              Messages were wiped. Tap Reopen to continue chatting with this peer.
            </span>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button
                type="button"
                className="primary-button"
                style={{
                  padding: "0.35rem 0.85rem",
                  fontSize: "0.8rem",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
                onClick={onReopenSession}
              >
                Reopen Chat
              </button>
              {onDeleteConversation && (
                <button
                  type="button"
                  style={{
                    background: "rgba(239, 68, 68, 0.2)",
                    color: "#f87171",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    borderRadius: "6px",
                    padding: "0.35rem 0.65rem",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  onClick={onDeleteConversation}
                  title="Remove this destroyed conversation from sidebar"
                >
                  Remove Chat
                </button>
              )}
            </div>
          </div>
        )}

        <form className="composer" onSubmit={handleSend}>
          <button
            type="button"
            className="composer-add"
            onClick={onOpenEphemeralModal}
            aria-label="Attach ephemeral file"
            title="Attach file (preview)"
          >
            <Icon name="plus" size={18} />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => {
              const val = e.target.value;
              setInputText(val);
              onTyping?.(val.trim().length > 0);
            }}
            placeholder={
              isDestroyed
                ? "This conversation was permanently destroyed."
                : "Message..."
            }
            disabled={isDestroyed}
            aria-label="Type an encrypted message"
          />

          <span
            className={`composer-indicator ${isDestroyed ? "lock-destroyed" : "lock-active"}`}
            title={
              isDestroyed
                ? "Conversation Session Destroyed"
                : "End-to-End Encrypted Transport"
            }
          >
            <Icon name={isDestroyed ? "trash" : "lock"} size={15} />
          </span>

          <button
            type="button"
            className="composer-icon-btn"
            onClick={onOpenInfo}
            disabled={isDestroyed}
            aria-label="Send ephemeral photo"
            title="Camera (preview)"
          >
            <Icon name="camera" size={17} />
          </button>

          <button
            type="button"
            className="composer-icon-btn"
            onClick={onOpenInfo}
            disabled={isDestroyed}
            aria-label="Send ephemeral voice note"
            title="Voice note (preview)"
          >
            <Icon name="mic" size={17} />
          </button>

          <button
            type="submit"
            className="send-button"
            disabled={isDestroyed || !inputText.trim()}
            aria-label="Send message"
          >
            <Icon name="send" size={16} />
          </button>
        </form>

        <div className="composer-caption">
          <span className="caption-left">
            <span className="caption-dot" />
            <span>
              {isDestroyed
                ? "Session Destroyed · Generation advanced and ciphertexts purged"
                : isKeyReady
                ? `End-to-End Encrypted · ${activeTimer} auto-purge`
                : "Awaiting Peer Key · Sync in progress"}
            </span>
          </span>
          <span className="caption-right">
            <span>
              {isLive
                ? "Phase 13 · Production Ready"
                : "Phase 1 UI Preview · Memory only"}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}

function MessageBubble({ message }: { message: SampleMessage }) {
  if (message.sender === "system") {
    return (
      <div className="system-note system-alert-note">
        <Icon name="info" size={13} />
        <span>{message.text}</span>
      </div>
    );
  }

  const isMine = message.sender === "me";
  const isError = Boolean(message.decryptionError);

  return (
    <div className={`message-row ${isMine ? "mine" : "theirs"}`}>
      <div className="bubble-wrap">
        {message.attachment ? (
          <div className="attachment-card">
            <div className="attachment-icon">
              <Icon name="fileText" size={20} />
            </div>
            <div className="attachment-info">
              <strong className="attachment-name">
                {message.attachment.name}
              </strong>
              <span className="attachment-size">
                {message.attachment.size}
              </span>
            </div>
          </div>
        ) : (
          <div
            className={`message-bubble ${isError ? "bubble-error" : ""}`}
            style={
              isError
                ? {
                    border: "1px dashed var(--crimson)",
                    color: "var(--crimson)",
                    backgroundColor: "rgba(255, 69, 58, 0.08)",
                  }
                : undefined
            }
          >
            {isError && (
              <span className="tamper-warning-icon" title="Tampering detected">
                <Icon name="shieldAlert" size={13} />{" "}
              </span>
            )}
            {message.text}
          </div>
        )}

        <div className="message-meta">
          <span className="message-time">{message.time}</span>
          {isMine && (
            <span
              className="read-mark"
              title={message.delivered ? "Delivered" : "Sent"}
            >
              <Icon
                name={message.delivered ? "checkCheck" : "check"}
                size={14}
              />
            </span>
          )}
          {message.expiresIn && (
            <span className="bubble-expiry" title="Time remaining">
              <Icon name="clock" size={11} /> {message.expiresIn}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
