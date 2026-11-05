import React, { useState, useRef, useEffect, useCallback } from "react";
import type { Contact, QuotedMessage, SampleMessage } from "./types";
import { Icon } from "@/components/icons";
import { useScreenshotProtection } from "@/features/security/screenshot-protection";
import { compressImageForEphemeralTransport } from "./image-compressor";

type ChatViewProps = {
  contact: Contact;
  activeTimer?: string;
  onBack: () => void;
  onOpenInfo: () => void;
  onOpenEphemeralModal: () => void;
  onOpenDestroyModal: () => void;
  onSendMessage: (
    text: string,
    replyTo?: QuotedMessage,
    imageData?: string,
    viewOnce?: boolean
  ) => void;
  onTyping?: (isTyping: boolean) => void;
  isLive?: boolean;
  isKeyReady?: boolean;
  isDestroyed?: boolean;
  onReopenSession?: () => void;
  onRenameContact?: (newName: string) => void;
  onDeleteConversation?: () => void;
  antiScreenshotEnabled?: boolean;
  onScreenshotAttempt?: (msg: string) => void;
  onBurnMessage?: (messageId: string) => void;
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
  isDestroyed = false,
  onReopenSession,
  onRenameContact,
  onDeleteConversation,
  antiScreenshotEnabled = true,
  onScreenshotAttempt,
  onBurnMessage,
}: ChatViewProps) {
  const [inputText, setInputText] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(contact.name);
  const [lastAttemptTime, setLastAttemptTime] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [stealthMode, setStealthMode] = useState<boolean>(true);
  const [replyingTo, setReplyingTo] = useState<QuotedMessage | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isViewOnce, setIsViewOnce] = useState<boolean>(true);
  const [imageCaption, setImageCaption] = useState<string>("");
  const [openedViewOnceIds, setOpenedViewOnceIds] = useState<Set<string>>(() => new Set());
  const [activeViewOnce, setActiveViewOnce] = useState<{
    id: string;
    url: string;
    caption?: string;
  } | null>(null);
  const [viewOnceTimeLeft, setViewOnceTimeLeft] = useState<number>(3);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isScreenObscured, setIsScreenObscured } = useScreenshotProtection({
    enabled: antiScreenshotEnabled,
    onAttempt: (msg) => {
      const timeStr = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setLastAttemptTime(timeStr);
      onScreenshotAttempt?.(msg);
    },
    blurInactive: true,
  });

  // Jump to bottom on contact switch or initial mount
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [contact.id]);

  // Smooth auto-scroll when new messages arrive or when sending
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [contact.messages.length]);

  // Smooth scroll when typing status changes
  useEffect(() => {
    if (contact.isTyping) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [contact.isTyping]);

  function handleScroll() {
    if (!messageAreaRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messageAreaRef.current;
    const isScrolledUp = scrollHeight - scrollTop - clientHeight > 140;
    setShowScrollBottom(isScrolledUp);
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function handleInitiateReply(msg: SampleMessage) {
    if (isDestroyed) return;
    setReplyingTo({
      id: msg.id,
      sender: msg.sender === "me" ? "me" : "them",
      senderName: msg.sender === "me" ? "You" : contact.name,
      text: msg.text || (msg.attachment ? msg.attachment.name : ""),
    });
    inputRef.current?.focus();
  }

  function handleCancelReply() {
    setReplyingTo(null);
  }

  function handleJumpToMessage(msgId: string) {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("highlight-flash");
      setTimeout(() => {
        el.classList.remove("highlight-flash");
      }, 1500);
    }
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedDataUrl = await compressImageForEphemeralTransport(file);
      setPendingImage(compressedDataUrl);
      setIsViewOnce(true);
      setImageCaption("");
    } catch (err) {
      alert("Could not process image: " + (err instanceof Error ? err.message : "Invalid image"));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleSendPendingImage() {
    if (!pendingImage) return;
    onSendMessage(
      imageCaption.trim(),
      replyingTo ?? undefined,
      pendingImage,
      isViewOnce
    );
    setPendingImage(null);
    setImageCaption("");
    setReplyingTo(null);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 40);
  }

  const handleCloseViewOnce = useCallback(() => {
    if (activeViewOnce) {
      onBurnMessage?.(activeViewOnce.id);
      setOpenedViewOnceIds((prev) => new Set(prev).add(activeViewOnce.id));
      const foundMsg = contact.messages.find((m) => m.id === activeViewOnce.id);
      if (foundMsg) {
        foundMsg.isOpened = true;
        foundMsg.imageData = undefined;
      }
      setActiveViewOnce(null);
    }
  }, [activeViewOnce, contact.messages, onBurnMessage]);

  function handleOpenViewOnce(message: SampleMessage) {
    if (!message.imageData || message.isOpened || openedViewOnceIds.has(message.id)) return;

    // Prevent repeated views: mark as opened immediately
    setOpenedViewOnceIds((prev) => new Set(prev).add(message.id));

    // Wipe memory reference from the message object so it cannot be viewed again
    message.isOpened = true;
    const imgUrl = message.imageData;
    message.imageData = undefined;

    // Trigger physical purge from Firebase RTDB immediately
    onBurnMessage?.(message.id);

    setViewOnceTimeLeft(3);
    setActiveViewOnce({
      id: message.id,
      url: imgUrl,
      caption: message.text,
    });
  }

  // Strict 3-Second Auto-Burn Countdown Timer for View Once Lightbox
  useEffect(() => {
    if (!activeViewOnce) return;
    setViewOnceTimeLeft(3);
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, 3 - Math.floor(elapsedSec));
      setViewOnceTimeLeft(remaining);
      if (elapsedSec >= 3) {
        clearInterval(interval);
        handleCloseViewOnce();
      }
    }, 80);

    // Instant Anti-Capture / Blur Trigger:
    // If window blurs, app switches, or screen hides, close and burn immediately!
    function handleSecurityBurn() {
      handleCloseViewOnce();
    }
    window.addEventListener("blur", handleSecurityBurn);
    document.addEventListener("visibilitychange", handleSecurityBurn);

    return () => {
      clearInterval(interval);
      window.removeEventListener("blur", handleSecurityBurn);
      document.removeEventListener("visibilitychange", handleSecurityBurn);
    };
  }, [activeViewOnce, handleCloseViewOnce]);

  // Sync editedName when contact changes
  useEffect(() => {
    setEditedName(contact.name);
    setIsEditingName(false);
    setReplyingTo(null);
    setPendingImage(null);
    setActiveViewOnce(null);
  }, [contact.id, contact.name]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (isDestroyed || !inputText.trim()) return;
    onSendMessage(inputText.trim(), replyingTo ?? undefined);
    setInputText("");
    setReplyingTo(null);
    onTyping?.(false);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 40);
  }

  return (
    <section
      className={`conversation ${isScreenObscured && antiScreenshotEnabled ? "screen-obscured" : ""}`}
      aria-label={`Conversation with ${contact.name}`}
      onContextMenu={(e) => {
        if (antiScreenshotEnabled) {
          e.preventDefault();
        }
      }}
    >
      {/* Subtle Anti-Camera Watermark */}
      <div className="chat-watermark-overlay" aria-hidden="true" />

      {/* Ephemeral Privacy Obscurity Shield (blocks Snipping Tool & capture) */}
      {isScreenObscured && antiScreenshotEnabled && (
        <div
          className="screenshot-privacy-shield"
          onClick={() => setIsScreenObscured(false)}
          role="alert"
          aria-live="assertive"
        >
          <div
            className="screenshot-privacy-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shield-icon-wrap">
              <Icon name="shieldAlert" size={30} />
            </div>
            <h3>Privacy Shield Active</h3>
            <p>
              Screenshots and screen recording are prohibited in GhostChat to
              protect ephemeral conversation confidentiality.
            </p>
            <div className="privacy-badge">
              <Icon name="lock" size={13} />
              <span>Anti-Screenshot Protection Active</span>
            </div>
            <button
              type="button"
              className="screenshot-reveal-btn"
              onClick={() => setIsScreenObscured(false)}
            >
              Reveal Messages
            </button>
          </div>
        </div>
      )}
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
            className={`header-stealth-pill ${stealthMode ? "active" : ""}`}
            onClick={() => setStealthMode((prev) => !prev)}
            title={
              stealthMode
                ? "Snapchat Stealth Mode ON: Messages frosted until held/hovered"
                : "Enable Snapchat Stealth Mode (Frosted blur)"
            }
            aria-label="Toggle Snapchat Stealth Mode"
          >
            <Icon name="shieldCheck" size={13} />
            <span>{stealthMode ? "Stealth ON" : "Stealth"}</span>
          </button>
          <button
            type="button"
            className="header-timer-chip"
            onClick={onOpenEphemeralModal}
            title="Auto-delete timer (click to change)"
            aria-label={`Auto-delete after ${activeTimer}`}
          >
            <Icon name="clock" size={13} />
            <span>{activeTimer}</span>
          </button>
          <button
            type="button"
            className="icon-button header-danger-btn"
            onClick={onOpenDestroyModal}
            aria-label="Destroy conversation for both"
            title="Destroy for Both"
          >
            <Icon name="trash" size={17} />
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

      {/* Screenshot Intercept Alert Pill */}
      {lastAttemptTime && antiScreenshotEnabled && (
        <div className="screenshot-attempt-pill" role="status">
          <Icon name="camera" size={13} />
          <span>Screenshot attempt intercepted &amp; blocked at {lastAttemptTime}</span>
        </div>
      )}

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

      {/* Message Area */}
      <div
        ref={messageAreaRef}
        onScroll={handleScroll}
        className="message-area"
        role="log"
        aria-live="polite"
      >
        <div className="security-chip-pill">
          <Icon name="lock" size={12} />
          <span>Messages are end-to-end encrypted · Auto-delete in {activeTimer}</span>
        </div>

        {contact.messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            stealthMode={stealthMode}
            isOpened={openedViewOnceIds.has(message.id) || Boolean(message.isOpened)}
            onReply={handleInitiateReply}
            onJumpToMessage={handleJumpToMessage}
            onOpenViewOnce={handleOpenViewOnce}
          />
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

        {/* Anchor element for smooth auto-scroll to bottom */}
        <div ref={messagesEndRef} style={{ height: "1px", width: "100%", pointerEvents: "none" }} />
      </div>

      {/* Floating Scroll to Bottom button (WhatsApp / Insta style) */}
      {showScrollBottom && (
        <button
          type="button"
          className="scroll-to-bottom-btn"
          onClick={scrollToBottom}
          aria-label="Scroll to latest messages"
          title="Scroll to bottom"
        >
          <Icon name="chevronDown" size={16} />
        </button>
      )}

      {/* Minimalist Composer */}
      <div className="composer-wrap">
        {isDestroyed && onReopenSession && (
          <div className="reopen-banner">
            <span>Messages were wiped. Tap Reopen to continue chatting with this peer.</span>
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

        {/* WhatsApp-Style Quoted Reply Preview Bar in Composer */}
        {replyingTo && (
          <div className="composer-reply-bar" role="region" aria-label="Replying to message">
            <div className="reply-bar-accent" />
            <div className="reply-bar-body">
              <div className="reply-bar-header">
                <Icon name="reply" size={12} className="reply-bar-icon" />
                <span className="reply-bar-sender">
                  Replying to {replyingTo.senderName}
                </span>
              </div>
              <div className="reply-bar-snippet">{replyingTo.text}</div>
            </div>
            <button
              type="button"
              className="reply-bar-cancel"
              onClick={handleCancelReply}
              title="Cancel reply (Esc)"
              aria-label="Cancel reply"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        )}

        <form className="composer minimalist-composer" onSubmit={handleSend}>
          <button
            type="button"
            className="composer-add"
            onClick={onOpenEphemeralModal}
            aria-label="Attach ephemeral file"
            title="Attach file"
          >
            <Icon name="plus" size={18} />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleImageSelect}
          />
          <button
            type="button"
            className="composer-camera-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Send View Once photo"
            aria-label="Send ephemeral photo"
          >
            <Icon name="camera" size={18} />
          </button>

          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => {
              const val = e.target.value;
              setInputText(val);
              onTyping?.(val.trim().length > 0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && replyingTo) {
                e.preventDefault();
                handleCancelReply();
              }
            }}
            placeholder={
              isDestroyed
                ? "This conversation was permanently destroyed."
                : replyingTo
                ? `Reply to ${replyingTo.senderName}...`
                : "Type a message..."
            }
            disabled={isDestroyed}
            aria-label="Type an encrypted message"
          />

          <button
            type="submit"
            className={`send-button ${inputText.trim() ? "ready" : ""}`}
            disabled={isDestroyed || !inputText.trim()}
            aria-label="Send message"
          >
            <Icon name="send" size={16} />
          </button>
        </form>
      </div>

      {/* Pre-Send View Once Photo Dialog */}
      {pendingImage && (
        <div className="view-once-preview-backdrop" role="dialog" aria-modal="true">
          <div className="view-once-preview-card">
            <div className="preview-top-row">
              <h3>Send Ephemeral Image</h3>
              <button
                type="button"
                className="preview-close-button"
                onClick={() => setPendingImage(null)}
                title="Cancel"
                aria-label="Cancel image send"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="preview-thumbnail-container">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pendingImage}
                alt="Selected preview"
                className="preview-thumbnail-img"
              />
            </div>

            <div className="preview-view-once-action">
              <button
                type="button"
                className={`view-once-toggle-chip ${isViewOnce ? "active" : ""}`}
                onClick={() => setIsViewOnce((prev) => !prev)}
                title="Toggle View Once (Burns upon closing)"
              >
                <span className="view-once-circle-badge">1</span>
                <span>{isViewOnce ? "View Once Active (3s)" : "Regular Image"}</span>
              </button>
              <span className="view-once-note">
                {isViewOnce
                  ? "Burns automatically from memory after 3 seconds. Cannot be viewed again."
                  : "Saved in session until timer expires."}
              </span>
            </div>

            <div className="preview-caption-row">
              <input
                type="text"
                value={imageCaption}
                onChange={(e) => setImageCaption(e.target.value)}
                placeholder="Add a caption..."
                maxLength={80}
                className="preview-caption-input"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSendPendingImage();
                  }
                }}
              />
              <button
                type="button"
                className="preview-send-btn primary-button"
                onClick={handleSendPendingImage}
                title="Send encrypted photo"
              >
                <Icon name="send" size={16} />
                <span>Send</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen View Once Ephemeral Lightbox (Strict 3-Second Auto-Burn) */}
      {activeViewOnce && (
        <div
          className="view-once-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={handleCloseViewOnce}
          onTouchStart={(e) => {
            if (e.touches.length > 1) {
              // Multi-touch capture attempt -> burn immediately!
              handleCloseViewOnce();
            }
          }}
        >
          {/* Top 3-Second Countdown Progress Bar */}
          <div className="lightbox-burn-progress-bar">
            <div className="progress-fill-3s" />
          </div>

          <div className="lightbox-top-bar" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-badge">
              <span className="badge-circle">1</span>
              <span>View Once Photo</span>
            </div>

            {/* Glowing 3-Second Countdown Meter */}
            <div
              className="view-once-countdown-meter"
              title={`Auto-burns in ${viewOnceTimeLeft}s`}
              aria-label={`Time remaining: ${viewOnceTimeLeft} seconds`}
            >
              <svg className="countdown-svg" viewBox="0 0 36 36">
                <circle className="countdown-bg-ring" cx="18" cy="18" r="15.915" />
                <circle
                  className="countdown-progress-ring"
                  cx="18"
                  cy="18"
                  r="15.915"
                  strokeDasharray="100, 100"
                  style={{
                    strokeDashoffset: `${((3 - viewOnceTimeLeft) / 3) * 100}`,
                  }}
                />
              </svg>
              <span className="countdown-number">{viewOnceTimeLeft}s</span>
            </div>

            <button
              type="button"
              className="lightbox-burn-btn"
              onClick={handleCloseViewOnce}
              title="Close & Burn photo immediately"
              aria-label="Close and burn photo"
            >
              <Icon name="close" size={20} />
            </button>
          </div>

          <div
            className="lightbox-image-container"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lightbox-watermark-strip">
              <span>🔒 GHOSTCHAT CONFIDENTIAL · BURNS IN {viewOnceTimeLeft}s · NO REPLAY</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeViewOnce.url}
              alt="View Once Ephemeral"
              className="lightbox-img"
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
            />
            {activeViewOnce.caption && (
              <div className="lightbox-caption">{activeViewOnce.caption}</div>
            )}
          </div>

          <div className="lightbox-footer" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="burn-now-btn"
              onClick={handleCloseViewOnce}
            >
              <Icon name="flame" size={16} />
              <span>Close &amp; Burn Now ({viewOnceTimeLeft}s)</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function MessageBubble({
  message,
  stealthMode = false,
  isOpened = false,
  onReply,
  onJumpToMessage,
  onOpenViewOnce,
}: {
  message: SampleMessage;
  stealthMode?: boolean;
  isOpened?: boolean;
  onReply?: (msg: SampleMessage) => void;
  onJumpToMessage?: (msgId: string) => void;
  onOpenViewOnce?: (msg: SampleMessage) => void;
}) {
  const [isRevealed, setIsRevealed] = useState(false);

  // Auto-cancel reveal on any blur, touchcancel, touchend, or visibility change
  useEffect(() => {
    if (!isRevealed) return;
    function cancelReveal() {
      setIsRevealed(false);
    }
    window.addEventListener("blur", cancelReveal);
    window.addEventListener("touchcancel", cancelReveal);
    window.addEventListener("touchend", cancelReveal);
    window.addEventListener("resize", cancelReveal);
    document.addEventListener("visibilitychange", cancelReveal);
    return () => {
      window.removeEventListener("blur", cancelReveal);
      window.removeEventListener("touchcancel", cancelReveal);
      window.removeEventListener("touchend", cancelReveal);
      window.removeEventListener("resize", cancelReveal);
      document.removeEventListener("visibilitychange", cancelReveal);
    };
  }, [isRevealed]);

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length > 1) {
      // Multi-touch gesture (e.g. 3-finger screenshot or side-grip) -> Cancel instantly!
      setIsRevealed(false);
      return;
    }
    if (isStealth) {
      setIsRevealed(true);
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length > 1) {
      setIsRevealed(false);
    }
  }

  function handleTouchEnd() {
    setIsRevealed(false);
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === "touch") return; // Handled exclusively by touch events
    if (isStealth) setIsRevealed(true);
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (e.pointerType === "touch") return;
    setIsRevealed(false);
  }

  function handlePointerLeave(e: React.PointerEvent) {
    if (e.pointerType === "touch") return;
    setIsRevealed(false);
  }

  if (message.sender === "system") {
    return (
      <div className="system-note system-alert-note" id={`msg-${message.id}`}>
        <Icon name="info" size={13} />
        <span>{message.text}</span>
      </div>
    );
  }

  const isMine = message.sender === "me";
  const isError = Boolean(message.decryptionError);
  const isStealth = stealthMode;
  const isViewOnceOpened = isOpened || Boolean(message.isOpened);

  return (
    <div
      className={`message-row ${isMine ? "mine" : "theirs"}`}
      id={`msg-${message.id}`}
      onDoubleClick={() => onReply?.(message)}
    >
      <div className="bubble-wrap">
        {message.viewOnce ? (
          <div
            className={`view-once-card ${isViewOnceOpened ? "opened" : "unopened"} ${
              isStealth ? "stealth-bubble" : ""
            } ${isRevealed ? "revealed" : ""}`}
            onClick={() => {
              if (!isViewOnceOpened) {
                onOpenViewOnce?.(message);
              }
            }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            role={isViewOnceOpened ? "region" : "button"}
            tabIndex={isViewOnceOpened ? -1 : 0}
            title={
              isViewOnceOpened
                ? "Photo already viewed and burned"
                : isMine
                ? "View Once photo sent (Burns after viewing)"
                : "Tap to view (Burns strictly after 3 seconds)"
            }
          >
            <div className="view-once-ring-icon">
              {isViewOnceOpened ? (
                <Icon name="flame" size={14} className="ring-burned-icon" />
              ) : (
                <span className="ring-number">1</span>
              )}
            </div>
            <div className="view-once-text-content">
              <strong className="view-once-title">
                {isViewOnceOpened ? "Opened" : "Photo"}
              </strong>
              <span className="view-once-subtitle">
                {isViewOnceOpened
                  ? "Burned from memory"
                  : isMine
                  ? "View Once photo sent"
                  : "View Once · 3s timer"}
              </span>
            </div>
            {message.text && (
              <div className="view-once-caption-pill">{message.text}</div>
            )}
          </div>
        ) : message.attachment ? (
          <div
            className={`attachment-card ${isStealth ? "stealth-bubble" : ""} ${isRevealed ? "revealed" : ""}`}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            {message.replyTo && (
              <div
                className={`quoted-reply-box ${
                  message.replyTo.sender === "me" ? "quoted-mine" : "quoted-theirs"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onJumpToMessage?.(message.replyTo!.id);
                }}
                title="Click to jump to quoted message"
                role="button"
                tabIndex={0}
              >
                <div className="quoted-sender">
                  <Icon name="reply" size={10} className="quoted-icon" />
                  <span>
                    {message.replyTo.senderName ??
                      (message.replyTo.sender === "me" ? "You" : "Contact")}
                  </span>
                </div>
                <div className="quoted-snippet">{message.replyTo.text}</div>
              </div>
            )}
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
            className={`message-bubble ${isError ? "bubble-error" : ""} ${isStealth ? "stealth-bubble" : ""} ${isRevealed ? "revealed" : ""}`}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
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
            {/* WhatsApp-Style Quoted Message Preview inside Bubble */}
            {message.replyTo && (
              <div
                className={`quoted-reply-box ${
                  message.replyTo.sender === "me" ? "quoted-mine" : "quoted-theirs"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onJumpToMessage?.(message.replyTo!.id);
                }}
                title="Click to jump to quoted message"
                role="button"
                tabIndex={0}
              >
                <div className="quoted-sender">
                  <Icon name="reply" size={10} className="quoted-icon" />
                  <span>
                    {message.replyTo.senderName ??
                      (message.replyTo.sender === "me" ? "You" : "Contact")}
                  </span>
                </div>
                <div className="quoted-snippet">{message.replyTo.text}</div>
              </div>
            )}

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

      {/* Floating WhatsApp-Style Quick Reply Trigger */}
      {onReply && (
        <button
          type="button"
          className="bubble-reply-trigger"
          onClick={(e) => {
            e.stopPropagation();
            onReply(message);
          }}
          title="Reply to message (or double click)"
          aria-label="Reply to message"
        >
          <Icon name="reply" size={13} />
        </button>
      )}
    </div>
  );
}
