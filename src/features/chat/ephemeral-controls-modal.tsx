import React, { useState } from "react";
import { Icon } from "@/components/icons";

type EphemeralControlsModalProps = {
  activeTimer: string;
  onSelectTimer: (timer: string) => void;
  onDestroy: () => void;
  onClose: () => void;
};

export function EphemeralControlsModal({
  activeTimer,
  onSelectTimer,
  onDestroy,
  onClose,
}: EphemeralControlsModalProps) {
  const [destroyToggle, setDestroyToggle] = useState(false);
  const timers = ["5 min", "10 min", "20 min", "1 hour"];

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        className="modal-card auto-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ephemeral-title"
      >
        <button
          type="button"
          className="modal-close icon-button"
          onClick={onClose}
          aria-label="Close auto-delete controls"
        >
          <Icon name="close" size={18} />
        </button>

        <div className="ephemeral-hero">
          <div className="clock-symbol-wrap">
            <div className="clock-aura" />
            <div className="clock-symbol">
              <Icon name="clock" size={38} strokeWidth={1.6} />
            </div>
          </div>

          <p className="eyebrow">EPHEMERAL CONTROLS</p>
          <h2 id="ephemeral-title">Auto-Delete / Destroy</h2>
          <p className="modal-copy">
            Choose how long messages last before they automatically disappear.
          </p>
        </div>

        {/* Timer Pills */}
        <div className="ephemeral-timer-group">
          <label className="section-label" id="timer-group-label">
            MESSAGE LIFETIME
          </label>
          <div
            className="timer-selector-grid"
            role="radiogroup"
            aria-labelledby="timer-group-label"
          >
            {timers.map((timer) => {
              const isSelected = activeTimer === timer;
              return (
                <button
                  key={timer}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`timer-pill-btn ${isSelected ? "selected" : ""}`}
                  onClick={() => onSelectTimer(timer)}
                >
                  {timer}
                </button>
              );
            })}
          </div>
        </div>

        {/* Destroy Chat Switch */}
        <div className="ephemeral-toggle-box">
          <div className="toggle-info">
            <strong>Destroy Chat Now</strong>
            <span>Permanently delete this chat for both users.</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={destroyToggle}
            className={`toggle-switch ${destroyToggle ? "on" : ""}`}
            onClick={() => setDestroyToggle((v) => !v)}
            aria-label="Toggle destroy chat confirmation"
          >
            <span className="toggle-handle" />
          </button>
        </div>

        {/* Action Button */}
        <div className="modal-actions-column">
          <button
            type="button"
            className="primary-danger-btn"
            onClick={onDestroy}
          >
            <Icon name="trash" size={17} />
            <span>Destroy for Both</span>
          </button>

          <button type="button" className="text-cancel-btn" onClick={onClose}>
            Keep Conversation
          </button>
        </div>
      </section>
    </div>
  );
}
