"use client";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getFirebaseClient, isFirebaseConfigured } from "@/lib/firebase/client";

export type AuthStatus = "loading" | "unconfigured" | "signed-out" | "signed-in" | "error";

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setStatus("unconfigured");
      return;
    }

    try {
      const { auth } = getFirebaseClient();
      return onAuthStateChanged(
        auth,
        (nextUser) => {
          setUser(nextUser);
          setStatus(nextUser ? "signed-in" : "signed-out");
        },
        () => {
          setUser(null);
          setStatus("error");
        },
      );
    } catch {
      setUser(null);
      setStatus("error");
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isFirebaseConfigured) throw new Error("Firebase is not configured for this deployment.");
    if (!email.trim() || !password) throw new Error("Enter your email address and password.");

    try {
      const { auth } = getFirebaseClient();
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      throw new Error(getAuthErrorMessage(error));
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { auth } = getFirebaseClient();
      await firebaseSignOut(auth);
    } catch {
      throw new Error("Sign out could not finish. Check your connection and try again.");
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, isConfigured: isFirebaseConfigured, signIn, signOut }),
    [status, user, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}

function getAuthErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-email":
      return "Those sign-in details could not be verified.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a little while, then try again.";
    case "auth/network-request-failed":
      return "Firebase could not be reached. Check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Email and password sign-in is not enabled for this Firebase project yet.";
    default:
      return "Sign-in could not be completed. Check your details and try again.";
  }
}
