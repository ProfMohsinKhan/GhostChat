"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import type { AuthStatus } from "./auth-context";
import { Icon } from "@/components/icons";

type AuthScreenProps = {
  status: AuthStatus;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp?: (email: string, password: string) => Promise<void>;
  onBackToOnboarding?: () => void;
  onOpenDemo?: () => void;
};

export function AuthScreen({
  status,
  isConfigured,
  signIn,
  signUp,
  onBackToOnboarding,
  onOpenDemo,
}: AuthScreenProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (mode === "signup") {
      if (password.length < 6) {
        setError("Password must be at least 6 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match. Please re-enter.");
        return;
      }
      if (!signUp) {
        setError("Account creation is not supported on this deployment.");
        return;
      }

      setPending(true);
      try {
        await signUp(email, password);
      } catch (signUpError) {
        setError(
          signUpError instanceof Error
            ? signUpError.message
            : "Account registration could not be completed."
        );
      } finally {
        setPending(false);
      }
    } else {
      setPending(true);
      try {
        await signIn(email, password);
      } catch (signInError) {
        setError(
          signInError instanceof Error
            ? signInError.message
            : "Sign-in could not be completed."
        );
      } finally {
        setPending(false);
      }
    }
  }

  const isUnconfigured = !isConfigured || status === "unconfigured";
  const isUnavailable = status === "error";

  return (
    <main className="auth-screen">
      <div className="auth-glow" />
      <header className="auth-topbar">
        <Link className="brand auth-brand" href="/" aria-label="GhostChat home">
          <span className="brand-mark">
            <Icon name="ghost" size={20} />
          </span>
          <span>
            ghost<span className="brand-accent">chat</span>
          </span>
          <span className="brand-beta">AUTH</span>
        </Link>

        <div className="topbar-right">
          {onBackToOnboarding && (
            <button
              type="button"
              className="view-switcher-pill"
              onClick={onBackToOnboarding}
              aria-label="Back to welcome screen"
            >
              <Icon name="arrow" size={13} />
              <span>Welcome Screen</span>
            </button>
          )}

          {onOpenDemo && (
            <button
              type="button"
              className="preview-badge-pill"
              onClick={onOpenDemo}
              aria-label="Open Demo Mode"
            >
              <Icon name="spark" size={12} />
              <span>Explore Demo</span>
            </button>
          )}

          <span className="auth-badge">
            <span /> PRIVATE BY INVITE
          </span>
        </div>
      </header>

      <div className="auth-layout">
        <section className="auth-story">
          <div className="auth-illustration" aria-hidden="true">
            <span className="auth-orbit orbit-a" />
            <span className="auth-orbit orbit-b" />
            <div className="auth-lock">
              <Icon name="lock" size={38} strokeWidth={1.7} />
            </div>
            <span className="auth-star star-a">✳</span>
            <span className="auth-star star-b">✧</span>
          </div>

          <p className="eyebrow">A LITTLE MORE PRIVATE</p>
          <h1>
            Good conversations
            <br />
            can be <span>temporary.</span>
          </h1>
          <p className="auth-story-copy">
            A quiet space for people you trust.
            <br />
            Sign in or create your private account to connect.
          </p>

          <div className="auth-disclaimer">
            <span>
              <Icon name="shieldCheck" size={18} />
            </span>
            <p>
              <strong>Zero-Knowledge Authentication · Session Boundary</strong>
              <br />
              Email &amp; password authentication with tab-scoped session persistence.
              No plaintext is ever stored in database records.
            </p>
          </div>
        </section>

        <section className="auth-card" aria-labelledby="auth-title">
          {/* Mode Switcher Tabs */}
          <div className="auth-mode-tabs" role="tablist" aria-label="Authentication Mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
              className={`auth-mode-tab ${mode === "signin" ? "active" : ""}`}
              onClick={() => {
                setMode("signin");
                setError("");
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className={`auth-mode-tab ${mode === "signup" ? "active" : ""}`}
              onClick={() => {
                setMode("signup");
                setError("");
              }}
            >
              Create Account
            </button>
          </div>

          <div className="auth-card-heading">
            <p className="eyebrow">
              {mode === "signin" ? "WELCOME BACK" : "NEW TO GHOSTCHAT"}
            </p>
            <h2 id="auth-title">
              {mode === "signin" ? "Sign in" : "Create Account"}
            </h2>
            <p>
              {mode === "signin"
                ? "Use your account credentials to enter GhostChat."
                : "Create your private account to start ephemeral messaging."}
            </p>
          </div>

          {isUnconfigured && (
            <div className="auth-notice setup-notice" role="status">
              <strong>Firebase is not configured yet.</strong>
              <span>
                Copy <code>.env.example</code> to <code>.env.local</code> and fill in your
                Firebase web app keys.
              </span>
            </div>
          )}

          {isUnavailable && (
            <div className="auth-notice error-notice" role="alert">
              <strong>Authentication is unavailable.</strong>
              <span>Check your network connection and reload the app.</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Email address</span>
              <input
                autoComplete="username"
                type="email"
                inputMode="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                disabled={!isConfigured || pending}
              />
            </label>

            <label className="auth-field">
              <span>Password</span>
              <input
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                type="password"
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "signin" ? "Your password" : "At least 6 characters"}
                required
                disabled={!isConfigured || pending}
              />
            </label>

            {mode === "signup" && (
              <label className="auth-field">
                <span>Confirm password</span>
                <input
                  autoComplete="new-password"
                  type="password"
                  maxLength={128}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter password"
                  required
                  disabled={!isConfigured || pending}
                />
              </label>
            )}

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button
              className="auth-submit"
              type="submit"
              disabled={!isConfigured || pending || isUnavailable}
            >
              {pending ? (
                <>
                  <span className="auth-spinner" />
                  {mode === "signin" ? "Signing in…" : "Creating account…"}
                </>
              ) : (
                <>
                  {mode === "signin" ? "Sign in" : "Create Account"} <span aria-hidden="true">→</span>
                </>
              )}
            </button>
          </form>

          <div className="auth-toggle-row">
            {mode === "signin" ? (
              <span>
                Don&apos;t have an account yet?{" "}
                <button
                  type="button"
                  className="auth-toggle-btn"
                  onClick={() => {
                    setMode("signup");
                    setError("");
                  }}
                >
                  Create one
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{" "}
                <button
                  type="button"
                  className="auth-toggle-btn"
                  onClick={() => {
                    setMode("signin");
                    setError("");
                  }}
                >
                  Sign in here
                </button>
              </span>
            )}
          </div>

          <div className="auth-divider">
            <span /> <span>INVITE-ONLY CONVERSATIONS</span> <span />
          </div>

          <p className="auth-enrollment">
            Accounts connect using 128-bit single-use pairing codes. No public profile
            or communication graph is ever published.
          </p>

          <p className="auth-footnote">
            <Icon name="lock" size={13} /> Your session ends when you close this browser tab.
          </p>

          {onOpenDemo && (
            <div className="demo-link-row">
              <button
                type="button"
                className="text-demo-btn"
                onClick={onOpenDemo}
              >
                No account yet? Explore GhostChat in Demo Mode →
              </button>
            </div>
          )}
        </section>
      </div>

      <footer className="auth-footer">
        YOUR CIRCLE. YOUR CHOICE. <span>·</span> INVITE-ONLY ACCESS
      </footer>
    </main>
  );
}
