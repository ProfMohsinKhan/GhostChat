import React, { useState } from "react";
import { Icon } from "@/components/icons";

type DestroyModalProps = {
  contactName: string;
  onConfirmDestroy: () => void;
  onClose: () => void;
};

export function DestroyModal({
  contactName,
  onConfirmDestroy,
  onClose,
}: DestroyModalProps) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        className="modal-card destroy-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="destroy-dialog-title"
      >
        <button
          type="button"
          className="modal-close icon-button"
          onClick={onClose}
          aria-label="Close destroy confirmation"
        >
          <Icon name="close" size={18} />
        </button>

        <div className="destroy-hero">
          <div className="destroy-symbol">
            <Icon name="trash" size={26} />
          </div>
          <p className="eyebrow danger-text">IRREVERSIBLE ACTION</p>
          <h2 id="destroy-dialog-title">Destroy Chat for Both?</h2>
          <p className="modal-copy">
            This will permanently revoke the conversation session for you and{" "}
            <strong>{contactName}</strong>.
          </p>
        </div>

        <div className="destroy-implications-list">
          <div className="implication-item">
            <span className="dot danger-dot" />
            <span>
              All encrypted message records will be wiped from transport
              storage immediately.
            </span>
          </div>
          <div className="implication-item">
            <span className="dot danger-dot" />
            <span>
              The conversation generation will advance; offline devices will
              discard all cached messages upon reconnection.
            </span>
          </div>
          <div className="implication-item">
            <span className="dot neutral-dot" />
            <span>
              <strong>Reality Check:</strong> Cannot guarantee deletion of
              external screenshots or photos taken with another device.
            </span>
          </div>
        </div>

        <label className="destroy-checkbox-label">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>I understand this action cannot be undone.</span>
        </label>

        <div className="modal-actions-column">
          <button
            type="button"
            className="danger-modal-button"
            disabled={!confirmed}
            onClick={onConfirmDestroy}
          >
            <Icon name="trash" size={17} />
            <span>Permanently Destroy Conversation</span>
          </button>

          <button type="button" className="text-cancel-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
