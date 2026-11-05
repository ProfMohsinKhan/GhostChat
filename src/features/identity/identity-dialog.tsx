"use client";

import { useState } from "react";
import type { DeviceIdentity } from "@/features/identity/identity-service";
import { Icon } from "@/components/icons";

type IdentityDialogProps = {
  state: "loading" | "ready" | "missing" | "error";
  identity?: DeviceIdentity;
  error?: string;
  onClose: () => void;
  onRemove: () => Promise<void>;
  onRecreate: () => Promise<void>;
  notify: (message: string) => void;
};

export function IdentityDialog({
  state,
  identity,
  error,
  onClose,
  onRemove,
  onRecreate,
  notify,
}: IdentityDialogProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [working, setWorking] = useState(false);

  async function copyFingerprint() {
    if (!identity) return;
    try {
      await navigator.clipboard.writeText(identity.fingerprint);
      notify(
        "Cryptographic fingerprint copied. Compare it with your contact through a trusted channel."
      );
    } catch {
      notify("Clipboard is unavailable. You can select and copy the fingerprint manually.");
    }
  }

  async function act(action: () => Promise<void>) {
    setWorking(true);
    try {
      await action();
      setConfirmRemove(false);
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : "The device identity action failed."
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        className="modal-card identity-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="identity-title"
      >
        <button
          type="button"
          className="modal-close icon-button"
          onClick={onClose}
          aria-label="Close identity dialog"
        >
          <Icon name="close" size={18} />
        </button>

        <div className="verify-symbol">
          <Icon name="shieldCheck" size={28} />
        </div>

        <p className="eyebrow">HARDWARE KEY FOUNDATION</p>
        <h2 id="identity-title">Device Security Identity</h2>
        <p className="modal-copy">
          This device holds a unique cryptographic key pair generated locally
          via the browser Web Crypto API.
        </p>

        {state === "loading" && (
          <div className="identity-loading-box">
            <span className="auth-spinner" />
            <span>Loading local cryptographic keys from IndexedDB…</span>
          </div>
        )}

        {state === "error" && (
          <div className="security-alert-box" role="alert">
            <Icon name="shieldAlert" size={20} className="alert-icon" />
            <div className="alert-copy">
              <strong>Cryptographic Storage Unavailable</strong>
              <p>{error ?? "Local key store could not be opened in this browser."}</p>
            </div>
          </div>
        )}

        {state === "ready" && identity && (
          <>
            {/* QR Preview Matrix */}
            <div className="qr-preview-card">
              <div
                className="qr-matrix"
                aria-label="Cryptographic Identity QR code"
              >
                <div className="qr-corner top-left" />
                <div className="qr-corner top-right" />
                <div className="qr-corner bottom-left" />
                <div className="qr-center-shield">
                  <Icon name="shieldCheck" size={20} />
                </div>
                <div className="qr-grid-pattern" />
              </div>
              <span className="qr-caption">
                P-256 ECDSA &amp; ECDH Key Foundation
              </span>
            </div>

            {/* Fingerprint Box */}
            <div className="fingerprint-box">
              <div className="fingerprint-label-row">
                <span>LOCAL SAFETY FINGERPRINT</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => void copyFingerprint()}
                  aria-label="Copy fingerprint"
                >
                  <Icon name="copy" size={13} />
                  <span>Copy</span>
                </button>
              </div>
              <code className="fingerprint-code">{identity.fingerprint}</code>
            </div>

            <div className="identity-key-specs">
              <div className="spec-item">
                <span className="spec-label">Private Key Protection:</span>
                <span className="spec-val">
                  Non-Extractable (`extractable: false`)
                </span>
              </div>
              <div className="spec-item">
                <span className="spec-label">Created:</span>
                <span className="spec-val">
                  {new Date(identity.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            <p className="identity-limitation">
              Private keys remain in IndexedDB and are never uploaded to
              Firebase. When establishing an E2EE session, public keys are verified
              against this fingerprint.
            </p>

            {!confirmRemove ? (
              <button
                type="button"
                className="identity-remove-button"
                onClick={() => setConfirmRemove(true)}
              >
                <Icon name="trash" size={14} />
                <span>Remove Identity from this Device</span>
              </button>
            ) : (
              <div className="identity-confirm">
                <strong>Irreversibly delete local identity keys?</strong>
                <span>
                  All stored session keys and private key pairs for this device
                  will be wiped from IndexedDB. A replacement will have a new
                  fingerprint.
                </span>
                <div className="confirm-buttons-row">
                  <button
                    type="button"
                    className="secondary-modal-button"
                    onClick={() => setConfirmRemove(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="identity-remove-button"
                    disabled={working}
                    onClick={() => void act(onRemove)}
                  >
                    {working ? "Removing…" : "Confirm Removal"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {state === "missing" && (
          <div className="identity-missing-box">
            <p className="identity-status">
              No cryptographic identity found for this account on this device.
            </p>
            <button
              type="button"
              className="primary-modal-button"
              disabled={working}
              onClick={() => void act(onRecreate)}
            >
              {working ? (
                <>
                  <span className="auth-spinner" /> Generating Keys…
                </>
              ) : (
                <>
                  <Icon name="key" size={16} /> Generate New Key Pair
                </>
              )}
            </button>
          </div>
        )}

        <button
          type="button"
          className="text-cancel-btn"
          onClick={onClose}
        >
          Close
        </button>
      </section>
    </div>
  );
}
