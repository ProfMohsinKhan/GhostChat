"use client";

import React, { useState } from "react";
import type { Contact } from "./types";
import { Icon } from "@/components/icons";
import { QRCode } from "../verification/qr-code";
import { verifySafetyInput } from "../verification/verification-service";

type DeviceVerificationModalProps = {
  contact: Contact;
  onToggleVerified: (isVerified: boolean) => void;
  onClose: () => void;
  notify: (msg: string) => void;
};

export function DeviceVerificationModal({
  contact,
  onToggleVerified,
  onClose,
  notify,
}: DeviceVerificationModalProps) {
  const [isVerified, setIsVerified] = useState(contact.verified ?? false);
  const [activeTab, setActiveTab] = useState<"qr" | "compare">("qr");
  const [compareInput, setCompareInput] = useState("");
  const [compareResult, setCompareResult] = useState<"match" | "mismatch" | null>(null);

  const displaySafetyNumber =
    contact.safetyNumber ||
    "38102 91845 09182 48192 01928 39182 49182 01928 39182 48192 01928 39182";
  const displayFingerprint = contact.fingerprint || "E4B2 91C0 48A1 33F9 02D8 11E5 89B2 44C1 77A0 12E4 99F1 00C8 31D4 77E2 55A9 88B1";
  const qrValue = `ghostchat:verify:v1?s=${displaySafetyNumber.replace(/\s+/g, "")}&h=${displayFingerprint.replace(/\s+/g, "")}`;

  function handleToggle() {
    const next = !isVerified;
    setIsVerified(next);
    onToggleVerified(next);
    notify(
      next
        ? `${contact.name}'s identity has been marked as verified.`
        : `${contact.name}'s verification has been cleared.`
    );
  }

  function handleCompareCheck(val: string) {
    setCompareInput(val);
    if (!val.trim()) {
      setCompareResult(null);
      return;
    }
    const isMatch = verifySafetyInput(val, {
      safetyNumber: displaySafetyNumber,
      hexFingerprint: displayFingerprint,
      rawDigest: displayFingerprint.replace(/\s+/g, ""),
      qrPayload: qrValue,
    });
    setCompareResult(isMatch ? "match" : "mismatch");
  }

  function handleAcceptNewKey() {
    setIsVerified(true);
    onToggleVerified(true);
    notify(`${contact.name}'s new security key has been accepted and verified.`);
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        className="modal-card verification-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="verify-modal-title"
      >
        <button
          type="button"
          className="modal-close icon-button"
          onClick={onClose}
          aria-label="Close verification modal"
        >
          <Icon name="close" size={18} />
        </button>

        <div className="verify-header">
          <div className="verify-symbol">
            <Icon name={contact.isKeyChanged ? "shieldAlert" : "shieldCheck"} size={28} />
          </div>
          <p className="eyebrow">TRUST & VERIFICATION</p>
          <h2 id="verify-modal-title">Verify Security Key</h2>
          <p className="modal-copy">
            Compare the security numbers below with <strong>{contact.name}</strong> to
            confirm end-to-end encryption and protect against impersonation.
          </p>
        </div>

        {/* Real Key Changed Warning Alert */}
        {contact.isKeyChanged && (
          <div
            className="security-alert-box"
            role="alert"
            style={{
              border: "1px solid var(--crimson)",
              background: "rgba(255, 69, 58, 0.12)",
              padding: "14px",
              borderRadius: "12px",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <span style={{ color: "var(--crimson)", flexShrink: 0, display: "inline-flex" }}>
                <Icon name="shieldAlert" size={24} />
              </span>
              <div className="alert-copy">
                <strong style={{ color: "var(--crimson)" }}>Security Identity Changed!</strong>
                <p style={{ margin: "4px 0 8px 0", fontSize: "0.86rem", lineHeight: "1.4" }}>
                  {contact.name}&apos;s cryptographic identity key has changed since you last verified.
                  This may happen if they reinstalled the app, or it could indicate an intercept attempt.
                </p>
                {contact.previousFingerprint && (
                  <p style={{ margin: "4px 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Previous: <code>{contact.previousFingerprint.slice(0, 19)}...</code>
                  </p>
                )}
                <button
                  type="button"
                  className="primary-modal-button"
                  onClick={handleAcceptNewKey}
                  style={{
                    padding: "6px 12px",
                    fontSize: "0.82rem",
                    marginTop: "6px",
                    background: "var(--crimson)",
                  }}
                >
                  Accept &amp; Re-Verify New Key
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mode Selector Tabs */}
        <div
          className="verification-tabs"
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "16px",
            borderBottom: "1px solid var(--line)",
            paddingBottom: "8px",
          }}
        >
          <button
            type="button"
            className={`tab-btn ${activeTab === "qr" ? "active" : ""}`}
            onClick={() => setActiveTab("qr")}
            style={{
              background: activeTab === "qr" ? "rgba(49, 215, 189, 0.15)" : "transparent",
              color: activeTab === "qr" ? "var(--teal)" : "var(--text-muted)",
              border: "none",
              padding: "6px 14px",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
            }}
          >
            Safety Numbers &amp; QR
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "compare" ? "active" : ""}`}
            onClick={() => setActiveTab("compare")}
            style={{
              background: activeTab === "compare" ? "rgba(49, 215, 189, 0.15)" : "transparent",
              color: activeTab === "compare" ? "var(--teal)" : "var(--text-muted)",
              border: "none",
              padding: "6px 14px",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
            }}
          >
            Compare / Scan
          </button>
        </div>

        {activeTab === "qr" ? (
          <>
            {/* Real SVG QR Code Display */}
            <div className="qr-preview-card">
              <QRCode value={qrValue} size={150} ariaLabel="Cryptographic Safety Number QR" />
              <span className="qr-caption">Scan with another device to verify</span>
            </div>

            {/* 60-digit Numeric Safety Number */}
            <div className="fingerprint-box" style={{ marginBottom: "12px" }}>
              <div className="fingerprint-label-row">
                <span>COMBINED SAFETY NUMBER (60 DIGITS)</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(displaySafetyNumber);
                    notify("Safety number copied to clipboard.");
                  }}
                  aria-label="Copy safety number"
                >
                  <Icon name="copy" size={13} />
                  <span>Copy</span>
                </button>
              </div>
              <code
                className="fingerprint-code"
                style={{
                  fontSize: "0.82rem",
                  letterSpacing: "0.08em",
                  lineHeight: "1.6",
                  display: "block",
                  wordBreak: "break-all",
                }}
              >
                {displaySafetyNumber}
              </code>
            </div>

            {/* Device Key Fingerprint */}
            <div className="fingerprint-box">
              <div className="fingerprint-label-row">
                <span>PEER KEY FINGERPRINT</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(displayFingerprint);
                    notify("Fingerprint copied to clipboard.");
                  }}
                  aria-label="Copy key fingerprint"
                >
                  <Icon name="copy" size={13} />
                  <span>Copy</span>
                </button>
              </div>
              <code className="fingerprint-code">{displayFingerprint}</code>
            </div>
          </>
        ) : (
          /* Interactive Compare / Verify Screen */
          <div className="compare-section" style={{ padding: "10px 0 20px 0" }}>
            <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginBottom: "12px" }}>
              To verify without scanning, enter or paste the 60 digits or fingerprint shown on{" "}
              <strong>{contact.name}</strong>&apos;s screen:
            </p>
            <textarea
              value={compareInput}
              onChange={(e) => handleCompareCheck(e.target.value)}
              placeholder="Paste safety numbers or scanned QR payload here..."
              rows={3}
              style={{
                width: "100%",
                background: "rgba(0, 0, 0, 0.25)",
                border: "1px solid var(--line)",
                borderRadius: "10px",
                padding: "10px",
                color: "var(--text-bright)",
                fontFamily: "monospace",
                fontSize: "0.85rem",
                resize: "none",
                marginBottom: "12px",
              }}
            />

            {compareResult === "match" && (
              <div
                style={{
                  background: "rgba(49, 215, 189, 0.15)",
                  border: "1px solid var(--teal)",
                  padding: "12px",
                  borderRadius: "10px",
                  color: "var(--teal)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                  fontWeight: 600,
                }}
              >
                <Icon name="checkCheck" size={18} />
                <span>Safety Numbers Match! End-to-end security confirmed.</span>
              </div>
            )}

            {compareResult === "mismatch" && (
              <div
                style={{
                  background: "rgba(255, 69, 58, 0.15)",
                  border: "1px solid var(--crimson)",
                  padding: "12px",
                  borderRadius: "10px",
                  color: "var(--crimson)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                  fontWeight: 600,
                }}
              >
                <Icon name="shieldAlert" size={18} />
                <span>Numbers do NOT match! Possible interception or wrong code.</span>
              </div>
            )}
          </div>
        )}

        {/* Verify Toggle Switch */}
        <div className="verify-toggle-row">
          <div className="verify-toggle-text">
            <strong>Mark {contact.name} as Verified</strong>
            <span>You have confirmed their security number in person</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isVerified}
            className={`toggle-switch ${isVerified ? "on" : ""}`}
            onClick={handleToggle}
            aria-label={`Mark ${contact.name} as verified`}
          >
            <span className="toggle-handle" />
          </button>
        </div>

        <button
          type="button"
          className="primary-modal-button"
          onClick={onClose}
        >
          Done
        </button>
      </section>
    </div>
  );
}
