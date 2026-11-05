import React from "react";
import type { Contact } from "./types";
import { Icon } from "@/components/icons";

type ChatItemProps = {
  contact: Contact;
  isActive: boolean;
  onSelect: () => void;
  onDelete?: () => void;
};

export function ChatItem({ contact, isActive, onSelect, onDelete }: ChatItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`chat-item ${isActive ? "active" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-current={isActive ? "true" : undefined}
    >
      <span className="avatar-wrap">
        <span className={`avatar avatar-${contact.color}`}>
          {contact.avatarIcon === "users" ? (
            <Icon name="users" size={20} />
          ) : (
            contact.initials
          )}
        </span>
        {contact.online && <span className="online-dot" aria-label="Online" />}
      </span>

      <span className="chat-item-main">
        <span className="chat-name-row">
          <span className="chat-name">{contact.name}</span>
          <Icon name="lock" size={13} className="chat-lock-icon" />
          {contact.isKeyChanged ? (
            <span
              className="verified-shield warning-shield"
              title="Security Identity Changed - Review Key"
              style={{ color: "var(--crimson)" }}
            >
              <Icon name="shieldAlert" size={13} />
            </span>
          ) : contact.verified ? (
            <span className="verified-shield" title="Identity Verified">
              <Icon name="shieldCheck" size={13} />
            </span>
          ) : null}
        </span>
        <span
          className={`chat-preview ${contact.isTyping ? "typing" : ""} ${
            contact.expiryBadge === "expired" ? "expired-text" : ""
          }`}
        >
          {contact.isTyping ? (
            <span className="typing-indicator-wrap">
              <span className="typing-dots">
                <span />
                <span />
                <span />
              </span>
              Typing...
            </span>
          ) : (
            contact.preview
          )}
        </span>
      </span>

      <span className="chat-item-meta">
        <span className="chat-time-row">
          <span className="chat-time">{contact.time}</span>
          {onDelete && (
            <button
              type="button"
              className="chat-item-dismiss"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Remove from list"
              aria-label="Remove conversation"
            >
              <Icon name="trash" size={12} />
            </button>
          )}
        </span>
        <span className="chat-status-badges">
          {contact.unreadCount ? (
            <span className="unread-badge">{contact.unreadCount}</span>
          ) : null}

          {contact.expiryBadge === "20m" && (
            <span className="expiry-badge-coral" title="20 minutes auto-delete">
              <Icon name="flame" size={11} /> 20m
            </span>
          )}

          {contact.expiryBadge === "10m" && (
            <span className="expiry-badge-coral" title="10 minutes auto-delete">
              <Icon name="flame" size={11} /> 10m
            </span>
          )}

          {contact.expiryBadge === "checkCheck" && (
            <span className="check-double-badge" title="Delivered">
              <Icon name="checkCheck" size={14} />
            </span>
          )}

          {contact.expiryBadge === "expired" && (
            <span className="expiry-badge-expired">Expired</span>
          )}
        </span>
      </span>
    </div>
  );
}
