"use client";

import React from "react";
import { Icon } from "@/components/icons";

type ShortcutsModalProps = {
  onClose: () => void;
};

const SHORTCUTS = [
  {
    keys: ["Ctrl", "K"],
    macKeys: ["⌘", "K"],
    description: "Search conversations and contacts",
  },
  {
    keys: ["Ctrl", "N"],
    macKeys: ["⌘", "N"],
    description: "New pairing / Create or join with invite code",
  },
  {
    keys: ["Esc"],
    macKeys: ["Esc"],
    description: "Close modal, drawer, or cancel active search",
  },
  {
    keys: ["Ctrl", "/"],
    macKeys: ["⌘", "/"],
    description: "Show this keyboard shortcuts cheat sheet",
  },
  {
    keys: ["Enter"],
    macKeys: ["Return"],
    description: "Send encrypted message in composer",
  },
];

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        className="modal-card shortcuts-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        style={{ maxWidth: "480px" }}
      >
        <button
          type="button"
          className="modal-close icon-button"
          onClick={onClose}
          aria-label="Close shortcuts modal"
        >
          <Icon name="close" size={18} />
        </button>

        <div className="verify-header" style={{ marginBottom: "16px" }}>
          <div className="verify-symbol">
            <Icon name="device" size={28} />
          </div>
          <p className="eyebrow">DESKTOP ERGONOMICS</p>
          <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
          <p className="modal-copy">
            Quickly navigate GhostChat using desktop keyboard shortcuts.
          </p>
        </div>

        <div
          className="shortcuts-list"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          {SHORTCUTS.map((item, idx) => {
            const activeKeys = isMac ? item.macKeys : item.keys;
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid var(--line)",
                }}
              >
                <span
                  style={{
                    fontSize: "0.86rem",
                    color: "var(--text-bright)",
                  }}
                >
                  {item.description}
                </span>
                <span style={{ display: "flex", gap: "4px" }}>
                  {activeKeys.map((k, kIdx) => (
                    <kbd
                      key={kIdx}
                      style={{
                        padding: "3px 8px",
                        fontSize: "0.78rem",
                        fontFamily: "monospace",
                        fontWeight: 600,
                        background: "rgba(255, 255, 255, 0.08)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: "6px",
                        color: "var(--teal)",
                        boxShadow: "0 2px 0 rgba(0, 0, 0, 0.3)",
                      }}
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="primary-modal-button"
          onClick={onClose}
        >
          Got it
        </button>
      </section>
    </div>
  );
}
