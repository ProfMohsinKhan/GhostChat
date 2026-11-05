import React, { useState } from "react";
import { Icon } from "@/components/icons";

type DestroyModalProps = {
  contactName: string;
  onConfirmDestroy: (permanentlyUnpair: boolean) => void;
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
          <p className="eyebrow danger-text">INSTANT ZERO-PLAINTEXT PURGE</p>
          <h2 id="destroy-dialog-title">Destroy Chat History?</h2>
          <p className="modal-copy">
            Wipe all past messages for you and <strong>{contactName}</strong>.
          </p>
        </div>

        <div className="destroy-implications-list">
          <div className="implication-item">
            <span className="dot danger-dot" />
            <span>
              All message records are wiped from transport storage and decrypted RAM caches immediately.
            </span>
          </div>
          <div className="implication-item">
            <span className="dot danger-dot" />
            <span>
              The cryptographic generation advances, rendering all previous ciphertexts unrecoverable.
            </span>
          </div>
          <div className="implication-item">
            <span className="dot neutral-dot" />
            <span>
              <strong>Choose below:</strong> Clear chat messages to continue talking, or permanently unpair.
            </span>
          </div>
        </div>

        <label className="destroy-checkbox-label">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>I confirm I want to wipe all past chat messages.</span>
        </label>

        <div className="modal-actions-column" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <button
            type="button"
            className="primary-button"
            style={{ width: "100%", justifyContent: "center", padding: "0.75rem" }}
            disabled={!confirmed}
            onClick={() => onConfirmDestroy(false)}
          >
            <Icon name="trash" size={17} />
            <span>Wipe All Messages (Keep Chat Active)</span>
          </button>

          <button
            type="button"
            className="danger-modal-button"
            style={{ width: "100%", justifyContent: "center", padding: "0.65rem", opacity: confirmed ? 0.9 : 0.4 }}
            disabled={!confirmed}
            onClick={() => onConfirmDestroy(true)}
          >
            <Icon name="close" size={16} />
            <span>Permanently Unpair &amp; End Chat</span>
          </button>

          <button type="button" className="text-cancel-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
