"use client";

import { FormEvent, useState } from "react";
import {
  acceptPairing,
  createPairing,
  INVITE_LIFETIME_MS,
} from "./pairing-service";
import { Icon } from "@/components/icons";

type PairingModalProps = {
  uid: string;
  agreementPublicKey?: string;
  onClose: () => void;
  onPaired: (code: string, customName?: string) => void;
  notify: (message: string) => void;
};

export function PairingModal({
  uid,
  agreementPublicKey,
  onClose,
  onPaired,
  notify,
}: PairingModalProps) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [code, setCode] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [contactAlias, setContactAlias] = useState("");
  const [joinAlias, setJoinAlias] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    setPending(true);
    setError("");
    try {
      const nextCode = await createPairing(uid, agreementPublicKey);
      setCreatedCode(nextCode);
      onPaired(nextCode, contactAlias.trim());
      notify("Private invite code generated. Valid for 24 hours.");
    } catch (createErr) {
      console.error("Failed to create pairing:", createErr);
      setError(
        createErr instanceof Error
          ? createErr.message
          : "The invite could not be created. Check your connection and try again."
      );
    } finally {
      setPending(false);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await acceptPairing(uid, code, agreementPublicKey);
      notify("You are paired! Conversation established in Firebase RTDB.");
      const cleanCode = code.trim().replace(/\s+/g, "");
      onPaired(cleanCode, joinAlias.trim());
      onClose();
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : "This invite is expired, already used, or unavailable."
      );
    } finally {
      setPending(false);
    }
  }

  async function copyCode(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("Invite code copied to clipboard. Share it privately.");
    } catch {
      setError("Clipboard access is unavailable. Select and copy the code manually.");
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
        className="modal-card pairing-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pairing-title"
      >
        <button
          type="button"
          className="modal-close icon-button"
          onClick={onClose}
          aria-label="Close pairing dialog"
        >
          <Icon name="close" size={18} />
        </button>

        <div className="verify-symbol">
          <Icon name="key" size={26} />
        </div>

        <p className="eyebrow">PRIVATE CIRCLE PAIRING</p>
        <h2 id="pairing-title">Pair with a Contact</h2>
        <p className="modal-copy">
          Establish an exclusive 1-on-1 conversation using a single-use 128-bit
          cryptographic pairing code.
        </p>

        <div className="pairing-tabs" role="tablist" aria-label="Pairing options">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "create"}
            className={mode === "create" ? "selected" : ""}
            onClick={() => {
              setMode("create");
              setError("");
            }}
          >
            Create Invite
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "join"}
            className={mode === "join" ? "selected" : ""}
            onClick={() => {
              setMode("join");
              setError("");
            }}
          >
            Join with Code
          </button>
        </div>

        {mode === "create" ? (
          createdCode ? (
            <div className="pairing-created-flow">
              <div className="qr-preview-card">
                <div className="qr-matrix" aria-label="Invite QR Code">
                  <div className="qr-corner top-left" />
                  <div className="qr-corner top-right" />
                  <div className="qr-corner bottom-left" />
                  <div className="qr-center-shield">
                    <Icon name="key" size={18} />
                  </div>
                  <div className="qr-grid-pattern" />
                </div>
                <span className="qr-caption">Share privately with one person</span>
              </div>

              <div className="invite-code-box">
                <div className="invite-code-row">
                  <code>{createdCode}</code>
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => void copyCode(createdCode)}
                    aria-label="Copy invite code"
                  >
                    <Icon name="copy" size={13} />
                    <span>Copy</span>
                  </button>
                </div>
                <div className="code-caption">
                  <span className="online-dot" />
                  <span>Single-use · Expires in 24 hours</span>
                </div>
              </div>

              <p className="pairing-note">
                Anyone who accepts this code will be paired with you. It works only
                once and expires automatically after 24 hours.
              </p>

              <button
                type="button"
                className="primary-modal-button"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          ) : (
            <div className="pairing-initial-create">
              <label className="auth-field" style={{ marginBottom: "0.85rem" }}>
                <span>Contact Name / Nickname (Optional)</span>
                <input
                  type="text"
                  maxLength={30}
                  value={contactAlias}
                  onChange={(e) => setContactAlias(e.target.value)}
                  placeholder="e.g. Maya, Rahul, Bestie, Work"
                  disabled={pending}
                />
              </label>
              <div className="pairing-note">
                Setting a contact nickname saves it privately on your device. Zero plaintext names or PII are ever stored on the server.
              </div>
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="primary-modal-button"
                disabled={pending}
                onClick={() => void handleCreate()}
              >
                {pending ? (
                  <>
                    <span className="auth-spinner" /> Creating Invite…
                  </>
                ) : (
                  <>
                    <Icon name="plus" size={16} /> Create One-Time Invite
                  </>
                )}
              </button>
            </div>
          )
        ) : (
          <form className="pairing-join-form" onSubmit={handleJoin}>
            <label className="auth-field" style={{ marginBottom: "0.85rem" }}>
              <span>Contact Name / Nickname (Optional)</span>
              <input
                type="text"
                maxLength={30}
                value={joinAlias}
                onChange={(e) => setJoinAlias(e.target.value)}
                placeholder="e.g. Alex, Krazy, Maya"
                disabled={pending}
              />
            </label>
            <label className="auth-field">
              <span>Paste 22-character invite code</span>
              <input
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="text"
                maxLength={24}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="e.g. Y9nKxGd2QW5r7aBcDeF012"
                required
                disabled={pending}
              />
            </label>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <p className="pairing-note">
              Accepting is an atomic one-time operation. Once accepted, the
              conversation is permanently linked between both accounts.
            </p>
            <button
              className="primary-modal-button"
              type="submit"
              disabled={pending || code.trim().length < 20}
            >
              {pending ? (
                <>
                  <span className="auth-spinner" /> Joining Circle…
                </>
              ) : (
                <>
                  <Icon name="check" size={16} /> Accept &amp; Pair
                </>
              )}
            </button>
          </form>
        )}

        <p className="pairing-expiry">
          Invite Lifetime: {Math.round(INVITE_LIFETIME_MS / 3_600_000)} hours · Scoped
          Firebase RTDB rules enforce single-use authorization.
        </p>
      </section>
    </div>
  );
}
