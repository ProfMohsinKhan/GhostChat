"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-context";
import { AuthScreen } from "@/features/auth/auth-screen";
import { WelcomeScreen } from "@/features/onboarding/welcome-screen";
import { SAMPLE_CONTACTS } from "@/features/chat/sample-data";
import type { Contact, ContactTab, QuotedMessage, SampleMessage } from "@/features/chat/types";
import { ChatItem } from "@/features/chat/chat-item";
import { ChatView } from "@/features/chat/chat-view";
import { EphemeralControlsModal } from "@/features/chat/ephemeral-controls-modal";
import { DestroyModal } from "@/features/chat/destroy-modal";

const FALLBACK_EMPTY_CONTACT: Contact = {
  id: "empty-chats",
  name: "No Active Chats",
  initials: "GC",
  color: "teal",
  online: false,
  preview: "Click '+ New Invite' to pair with a contact",
  time: "",
  tab: "chats",
  fingerprint: "0000 0000 0000 0000",
  linkedDevicesCount: 1,
  messages: [],
};
import { ChatInfoDrawer } from "@/features/chat/chat-info-drawer";
import { DeviceVerificationModal } from "@/features/chat/device-verification-modal";
import { PrivacySettingsView } from "@/features/settings/privacy-settings-view";
import { PairingModal } from "@/features/pairing/pairing-modal";
import { publishAgreementKey } from "@/features/pairing/pairing-service";
import { usePairings } from "@/features/pairing/use-pairings";
import { IdentityDialog } from "@/features/identity/identity-dialog";
import { useDeviceIdentity } from "@/features/identity/use-device-identity";
import {
  destroyConversationForBoth,
  reopenConversation,
  parseExpiryDurationMs,
} from "@/features/messaging/messaging-service";
import { useLiveMessages } from "@/features/messaging/use-live-messages";
import { usePresence } from "@/features/presence/use-presence";
import {
  deriveKeyFingerprint,
  computeSafetyNumber,
} from "@/features/verification/verification-service";
import {
  saveStoredVerification,
  deleteStoredVerification,
  checkKeyChangeStatus,
} from "@/features/verification/verification-storage";
import { useSmartNotifications } from "@/features/notifications/use-smart-notifications";
import { useWebRTCCall } from "@/features/calls/use-webrtc-call";
import { CallModal } from "@/features/calls/call-modal";
import { usePwa } from "@/features/pwa/use-pwa";
import { ShortcutsModal } from "@/features/pwa/shortcuts-modal";
import { Icon } from "@/components/icons";

type ModalType =
  | "ephemeral"
  | "destroy"
  | "info"
  | "verify"
  | "pair"
  | "identity"
  | "preview-info"
  | "shortcuts"
  | null;

export default function Home() {
  const auth = useAuth();
  const [unauthedView, setUnauthedView] = useState<"welcome" | "signin" | "demo">("welcome");

  // Loading state
  if (auth.status === "loading") {
    return (
      <main className="auth-loading" aria-live="polite">
        <span className="auth-spinner" /> Checking your session…
      </main>
    );
  }

  // If user is signed in with Firebase Auth, render Authenticated Workspace
  if (auth.status === "signed-in" && auth.user) {
    return (
      <AuthenticatedWorkspace
        uid={auth.user.uid}
        email={auth.user.email ?? "user@ghostchat.local"}
        onSignOut={auth.signOut}
        isLiveSession={true}
      />
    );
  }

  // If user explicitly chose Demo Mode
  if (unauthedView === "demo") {
    return (
      <AuthenticatedWorkspace
        uid="demo-preview-uid"
        email="alex@ghostchat.local"
        onSignOut={async () => setUnauthedView("signin")}
        isLiveSession={false}
        onExitDemo={() => setUnauthedView("signin")}
      />
    );
  }

  // Welcome / Onboarding Screen
  if (unauthedView === "welcome") {
    return (
      <WelcomeScreen
        onJoinInvite={() => setUnauthedView("signin")}
        onScanQR={() => setUnauthedView("signin")}
        onSignIn={() => setUnauthedView("signin")}
        onEnterPreview={() => setUnauthedView("demo")}
      />
    );
  }

  // Sign In Screen
  return (
    <AuthScreen
      status={auth.status}
      isConfigured={auth.isConfigured}
      signIn={auth.signIn}
      signUp={auth.signUp}
      onBackToOnboarding={() => setUnauthedView("welcome")}
      onOpenDemo={() => setUnauthedView("demo")}
    />
  );
}

type WorkspaceProps = {
  uid: string;
  email: string;
  onSignOut: () => Promise<void>;
  isLiveSession: boolean;
  onExitDemo?: () => void;
};

function AuthenticatedWorkspace({
  uid,
  email,
  onSignOut,
  isLiveSession,
  onExitDemo,
}: WorkspaceProps) {
  // Realtime Database pairings subscription for authenticated user
  const { pairings, loading: pairingsLoading, error: pairingsError } = usePairings(
    isLiveSession ? uid : ""
  );

  // In-memory messages and contacts store
  const [activeContactId, setActiveContactId] = useState<string>("alex");
  const [activeTab, setActiveTab] = useState<ContactTab>("chats");
  const [searchQuery, setSearchQuery] = useState("");
  const [railSection, setRailSection] = useState<"chats" | "settings">("chats");
  const [mobileShowList, setMobileShowList] = useState(false);
  const [activeTimer, setActiveTimer] = useState("20 min");
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [toastMessage, setToastMessage] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pwa = usePwa();

  // Desktop Keyboard Shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // 1. Esc: close modals, drawers, or exit search
      if (e.key === "Escape") {
        if (activeModal) {
          e.preventDefault();
          setActiveModal(null);
          return;
        }
        if (mobileShowList) {
          setMobileShowList(false);
          return;
        }
        if (searchQuery) {
          setSearchQuery("");
          return;
        }
      }

      // 2. Ctrl/Cmd + K: Focus contact search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // 3. Ctrl/Cmd + N: Open Pair modal
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setActiveModal("pair");
        return;
      }

      // 4. Ctrl/Cmd + /: Open Shortcuts modal
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setActiveModal((prev) => (prev === "shortcuts" ? null : "shortcuts"));
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeModal, mobileShowList, searchQuery]);

  const identity = useDeviceIdentity(uid);
  const myAgreementKey =
    identity.status === "ready" ? identity.identity.agreementPublicKey : undefined;

  // Auto-sync local agreement public key to active conversations if not yet recorded
  React.useEffect(() => {
    if (!isLiveSession || !myAgreementKey) return;
    for (const p of pairings) {
      if (p.state !== "active") continue;
      if (p.ownerUid === uid && !p.ownerAgreementKey) {
        publishAgreementKey(p.id, uid, myAgreementKey).catch(() => {});
      } else if (p.acceptedBy === uid && !p.acceptedAgreementKey) {
        publishAgreementKey(p.id, uid, myAgreementKey).catch(() => {});
      }
    }
  }, [isLiveSession, pairings, uid, myAgreementKey]);

  const currentPairing = useMemo(() => {
    if (!isLiveSession) return undefined;
    return pairings.find((p) => p.id === activeContactId);
  }, [isLiveSession, pairings, activeContactId]);

  const isLivePairing = Boolean(currentPairing && currentPairing.state === "active");
  const isDestroyed = Boolean(currentPairing && currentPairing.state === "destroyed");

  const peerUid = currentPairing
    ? currentPairing.ownerUid === uid
      ? currentPairing.acceptedBy
      : currentPairing.ownerUid
    : undefined;

  const peerAgreementKey = currentPairing
    ? currentPairing.ownerUid === uid
      ? currentPairing.acceptedAgreementKey
      : currentPairing.ownerAgreementKey
    : undefined;

  const live = useLiveMessages({
    conversationId: isLivePairing && currentPairing ? currentPairing.id : null,
    generation: currentPairing?.generation ?? 1,
    currentUserUid: uid,
    recipientUid: peerUid ?? null,
    recipientAgreementKey: peerAgreementKey ?? null,
    senderAgreementKey: myAgreementKey ?? null,
    enabled: isLivePairing,
    isDestroyed,
  });

  const presence = usePresence({
    conversationId: isLivePairing && currentPairing ? currentPairing.id : null,
    uid,
    peerUid: peerUid ?? null,
    enabled: isLivePairing && !isDestroyed,
  });

  const [verificationMap, setVerificationMap] = useState<
    Record<
      string,
      {
        isVerified: boolean;
        isKeyChanged: boolean;
        safetyNumber?: string;
        fingerprint?: string;
        previousFingerprint?: string;
      }
    >
  >({});

  const [nicknames, setNicknames] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(`ghostchat_nicknames_${uid}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [hiddenContactIds, setHiddenContactIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(`ghostchat_hidden_${uid}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [showDemoContacts, setShowDemoContacts] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = localStorage.getItem(`ghostchat_show_demo_${uid}`);
      return raw !== null ? JSON.parse(raw) : false;
    } catch {
      return false;
    }
  });

  const [antiScreenshotEnabled, setAntiScreenshotEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = localStorage.getItem(`ghostchat_anti_screenshot_${uid}`);
      return stored !== null ? JSON.parse(stored) : true;
    } catch {
      return true;
    }
  });

  function handleToggleAntiScreenshot(enabled: boolean) {
    setAntiScreenshotEnabled(enabled);
    try {
      localStorage.setItem(`ghostchat_anti_screenshot_${uid}`, JSON.stringify(enabled));
    } catch {}
  }

  const [isSidebarMenuOpen, setIsSidebarMenuOpen] = useState(false);

  function handleSetNickname(pairingId: string, name: string) {
    const trimmed = name.trim();
    setNicknames((prev) => {
      const next = { ...prev };
      if (trimmed) {
        next[pairingId] = trimmed;
      } else {
        delete next[pairingId];
      }
      try {
        localStorage.setItem(`ghostchat_nicknames_${uid}`, JSON.stringify(next));
      } catch {}
      return next;
    });
    if (trimmed) {
      notify(`Contact renamed to "${trimmed}"`);
    }
  }

  function handleHideContact(contactId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    setHiddenContactIds((prev) => {
      if (prev.includes(contactId)) return prev;
      const next = [...prev, contactId];
      try {
        localStorage.setItem(`ghostchat_hidden_${uid}`, JSON.stringify(next));
      } catch {}
      return next;
    });
    notify("Chat removed from list.");
  }

  function handleClearAllDestroyed() {
    const destroyedIds = pairings
      .filter((p) => p.state === "destroyed" || (p.state === "pending" && p.expiresAt <= Date.now()))
      .map((p) => p.id);
    if (destroyedIds.length === 0) return;

    setHiddenContactIds((prev) => {
      const combined = Array.from(new Set([...prev, ...destroyedIds]));
      try {
        localStorage.setItem(`ghostchat_hidden_${uid}`, JSON.stringify(combined));
      } catch {}
      return combined;
    });
    setIsSidebarMenuOpen(false);
    notify(`Removed ${destroyedIds.length} inactive chat${destroyedIds.length > 1 ? "s" : ""}.`);
  }

  function handleToggleDemoContacts() {
    setShowDemoContacts((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`ghostchat_show_demo_${uid}`, JSON.stringify(next));
      } catch {}
      notify(next ? "Demo contacts enabled." : "Demo contacts hidden.");
      return next;
    });
    setIsSidebarMenuOpen(false);
  }

  function handleRestoreHiddenChats() {
    setHiddenContactIds([]);
    try {
      localStorage.removeItem(`ghostchat_hidden_${uid}`);
    } catch {}
    setIsSidebarMenuOpen(false);
    notify("All hidden chats restored.");
  }

  useEffect(() => {
    if (!isLivePairing || !currentPairing || !peerUid || !peerAgreementKey) return;
    const pairingId = currentPairing.id;
    let isCancelled = false;

    async function loadVerification() {
      try {
        const peerFingerprint = await deriveKeyFingerprint(peerAgreementKey!);
        let safetyNumStr = "";
        if (myAgreementKey) {
          const safetyRes = await computeSafetyNumber(myAgreementKey, peerAgreementKey!);
          safetyNumStr = safetyRes.safetyNumber;
        }

        const status = await checkKeyChangeStatus(
          uid,
          peerUid!,
          peerFingerprint,
          safetyNumStr
        );

        if (!isCancelled) {
          setVerificationMap((prev) => ({
            ...prev,
            [pairingId]: {
              isVerified: status.isVerified,
              isKeyChanged: status.isKeyChanged,
              safetyNumber: safetyNumStr,
              fingerprint: peerFingerprint,
              previousFingerprint: status.storedVerification?.verifiedFingerprint,
            },
          }));
        }
      } catch (err) {
        console.error("Failed to load verification status:", err);
      }
    }

    loadVerification();

    return () => {
      isCancelled = true;
    };
  }, [
    isLivePairing,
    currentPairing,
    uid,
    peerUid,
    peerAgreementKey,
    myAgreementKey,
  ]);

  function notify(msg: string) {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(""), 2600);
  }

  // Map RTDB pairings into Contact objects
  const liveContacts = useMemo<Contact[]>(() => {
    if (!isLiveSession) return [];
    return pairings
      .filter((pairing) => !hiddenContactIds.includes(pairing.id))
      .map((pairing) => {
      const isPairingDestroyed = pairing.state === "destroyed";
      const isExpired =
        pairing.state === "pending" && pairing.expiresAt <= Date.now();
      const isCurrentActive =
        currentPairing && pairing.id === currentPairing.id;
      const peerOnline = isCurrentActive
        ? presence.isPeerOnline
        : pairing.state === "active";
      const peerLastSeen = isCurrentActive
        ? presence.peerLastSeen
        : undefined;
      const isPeerTyping = isCurrentActive
        ? presence.isPeerTyping
        : false;

      const verInfo = verificationMap[pairing.id];
      const isVerified = verInfo?.isVerified ?? false;
      const isKeyChanged = verInfo?.isKeyChanged ?? false;
      const safetyNumber = verInfo?.safetyNumber;
      const fingerprint = verInfo?.fingerprint || "Derived during Phase 4";
      const previousFingerprint = verInfo?.previousFingerprint;

      const customName = nicknames[pairing.id];
      const title =
        customName ||
        (pairing.state === "pending"
          ? isExpired
            ? "Expired Invite"
            : "Pending Invite"
          : isPairingDestroyed
          ? "Destroyed Chat"
          : "Paired Peer");

      const COLORS: Contact["color"][] = ["teal", "lavender", "coral", "sage", "blue"];
      const initials = customName
        ? customName.slice(0, 2).toUpperCase()
        : pairing.state === "pending"
        ? "I"
        : isPairingDestroyed
        ? "D"
        : "P";

      const colorIndex = (customName || pairing.id)
        .split("")
        .reduce((acc, c) => acc + c.charCodeAt(0), 0) % COLORS.length;
      const color = isPairingDestroyed
        ? "coral"
        : pairing.state === "pending"
        ? "lavender"
        : COLORS[colorIndex];

      const preview =
        pairing.state === "pending"
          ? isExpired
            ? "Invite expired after 24 hours"
            : `Code: ${pairing.id.slice(0, 8)}... (waiting to pair)`
          : isPairingDestroyed
          ? "Conversation destroyed for both"
          : isPeerTyping
          ? "typing…"
          : pairing.ownerAgreementKey && pairing.acceptedAgreementKey
          ? "E2EE session active (AES-256-GCM)"
          : "Pairing established · Exchanging keys...";

      return {
        id: pairing.id,
        name: title,
        initials,
        color,
        online: peerOnline,
        lastSeen: peerLastSeen,
        isTyping: isPeerTyping,
        preview,
        time: pairing.destroyedAt
          ? new Date(pairing.destroyedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })
          : new Date(pairing.createdAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            }),
        tab: "chats" as const,
        expiryBadge: isExpired || isPairingDestroyed
          ? ("expired" as const)
          : pairing.state === "active"
          ? ((activeTimer === "10 min" ? "10m" : "20m") as Contact["expiryBadge"])
          : undefined,
        verified: isVerified,
        fingerprint,
        safetyNumber,
        isKeyChanged,
        previousFingerprint,
        linkedDevicesCount: 1,
        messages: [
          {
            id: `sys-${pairing.id}`,
            sender: "system" as const,
            text: isPairingDestroyed
              ? "This conversation generation has been destroyed. All encrypted records were revoked and purged."
              : pairing.state === "pending"
              ? isExpired
                ? "This invite code has expired. Generate a fresh code to pair with a contact."
                : `Private invite code: ${pairing.id}. Share privately with your contact. It works once and expires after 24 hours.`
              : "Private 1-on-1 pairing active in Firebase Realtime Database. Authenticated membership verified by security rules.",
            time: new Date(pairing.createdAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            }),
          },
        ],
      };
    });
  }, [
    pairings,
    hiddenContactIds,
    nicknames,
    isLiveSession,
    activeTimer,
    currentPairing,
    presence.isPeerOnline,
    presence.peerLastSeen,
    presence.isPeerTyping,
    verificationMap,
  ]);

  const destroyedContactsCount = useMemo(() => {
    return liveContacts.filter((c) => {
      const p = pairings.find((item) => item.id === c.id);
      return p && (p.state === "destroyed" || (p.state === "pending" && p.expiresAt <= Date.now()));
    }).length;
  }, [liveContacts, pairings]);

  // Combine live RTDB pairings with sample contacts
  const allContacts = useMemo(() => {
    const visibleLive = liveContacts;
    const visibleSamples = SAMPLE_CONTACTS.filter((c) => !hiddenContactIds.includes(c.id));

    if (isLiveSession) {
      if (showDemoContacts) {
        return [...visibleLive, ...visibleSamples];
      }
      return visibleLive.length > 0 ? visibleLive : visibleSamples;
    }
    return visibleSamples;
  }, [liveContacts, hiddenContactIds, isLiveSession, showDemoContacts]);

  useEffect(() => {
    if (allContacts.length > 0 && !allContacts.some((c) => c.id === activeContactId)) {
      setActiveContactId(allContacts[0].id);
    }
  }, [allContacts, activeContactId]);

  const activeContact =
    allContacts.find((c) => c.id === activeContactId) ?? allContacts[0] ?? FALLBACK_EMPTY_CONTACT;

  const displayedMessages: SampleMessage[] = useMemo(() => {
    if (isDestroyed) {
      return [
        {
          id: `sys-destroyed-${currentPairing?.id}`,
          sender: "system",
          text: "This conversation generation has been destroyed for both participants. All encrypted transport records were purged and generation bumped.",
          time: currentPairing?.destroyedAt
            ? new Date(currentPairing.destroyedAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })
            : "Just now",
        },
      ];
    }
    if (isLivePairing) {
      const baseMsgs =
        live.messages.length > 0
          ? live.messages
          : [
              {
                id: `sys-${currentPairing?.id}`,
                sender: "system" as const,
                text: peerAgreementKey
                  ? "Private 1-on-1 pairing active. Keys exchanged via Web Crypto. Type a message to start encrypted chat."
                  : "Waiting for peer to open the chat to complete public key exchange.",
                time: "Just now",
              },
            ];

      if (activeContact.isKeyChanged) {
        return [
          {
            id: `sys-key-changed-${currentPairing?.id}`,
            sender: "system" as const,
            text: `⚠️ Security Warning: ${activeContact.name}'s cryptographic key has changed since you last verified. Compare safety numbers before sharing private data.`,
            time: "Security Warning",
          },
          ...baseMsgs,
        ];
      }

      return baseMsgs;
    }
    return activeContact.messages;
  }, [
    isDestroyed,
    isLivePairing,
    live.messages,
    currentPairing?.id,
    currentPairing?.destroyedAt,
    peerAgreementKey,
    activeContact.messages,
    activeContact.isKeyChanged,
    activeContact.name,
  ]);

  // Smart Visibility-Aware Notifications Engine (Phase 16)
  const notifications = useSmartNotifications();
  const lastMsgCountRef = useRef<number>(0);

  // Monitor incoming messages for background / screen-off / unseen notification triggers
  useEffect(() => {
    if (!isLivePairing) return;
    if (live.messages.length > lastMsgCountRef.current) {
      const newIncoming = live.messages
        .slice(lastMsgCountRef.current)
        .filter((m) => m.sender === "them");

      if (newIncoming.length > 0) {
        // notifyIfBackground strictly suppresses if user is actively looking at the chat
        notifications.notifyIfBackground({
          title: "GhostChat",
          body: `New confidential message from ${activeContact.name}`,
          tag: `msg-${activeContact.id}`,
        });
      }
    }
    lastMsgCountRef.current = live.messages.length;
  }, [live.messages, isLivePairing, activeContact.name, activeContact.id, notifications]);

  // Request notification permission once in active conversation if default
  useEffect(() => {
    if (isLivePairing && notifications.permission === "default") {
      notifications.requestPermission().catch(() => {});
    }
  }, [isLivePairing, notifications]);

  // WebRTC Ephemeral P2P Voice Calling (Phase 17)
  const call = useWebRTCCall({
    conversationId: isLivePairing && currentPairing ? currentPairing.id : null,
    currentUserUid: uid,
    peerName: activeContact.name,
    enabled: isLivePairing && !isDestroyed,
    onIncomingCallBackground: (callerName) => {
      notifications.notifyIfBackground({
        title: "Incoming Voice Call",
        body: `${callerName} is calling you on GhostChat`,
        tag: "ghostchat-voice-call",
        playTone: false,
      });
    },
    onError: (msg) => notify(msg),
  });

  const filteredContacts = useMemo(() => {
    const list = allContacts.filter((c) => {
      const matchesTab = c.tab === activeTab;
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.preview.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });

    // WhatsApp / Instagram sorting: Active conversations float to the top
    return list.slice().sort((a, b) => {
      const aIsDestroyed = a.expiryBadge === "expired" || a.preview.toLowerCase().includes("destroyed");
      const bIsDestroyed = b.expiryBadge === "expired" || b.preview.toLowerCase().includes("destroyed");
      if (aIsDestroyed !== bIsDestroyed) {
        return aIsDestroyed ? 1 : -1;
      }
      return 0;
    });
  }, [allContacts, activeTab, searchQuery]);

  const chatsCount = allContacts.filter((c) => c.tab === "chats").length;
  const roomsCount = allContacts.filter((c) => c.tab === "rooms").length;
  const requestsCount = allContacts.filter((c) => c.tab === "requests").length;

  async function handleSendMessage(
    text: string,
    replyTo?: QuotedMessage,
    imageData?: string,
    viewOnce?: boolean
  ) {
    if (isLivePairing) {
      if (!peerAgreementKey) {
        notify("Peer's cryptographic key is still syncing. Wait a moment or ask them to open the app.");
        return;
      }
      try {
        const expiryMs = parseExpiryDurationMs(activeTimer);
        await live.sendMessage(text, expiryMs, replyTo, imageData, viewOnce);
      } catch (err) {
        notify(err instanceof Error ? err.message : "Failed to send encrypted message.");
      }
      return;
    }

    if (currentPairing && currentPairing.state === "pending") {
      notify("This invite is waiting for your contact to join before messaging can begin.");
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

    const newMessage: SampleMessage = {
      id: `msg-${Date.now()}`,
      sender: "me",
      text,
      time: timeStr,
      delivered: true,
      expiresIn: activeTimer,
      replyTo,
      imageData,
      viewOnce,
    };

    activeContact.messages.push(newMessage);
  }

  async function handleConfirmDestroy(permanentlyUnpair: boolean = false) {
    if (currentPairing) {
      try {
        await destroyConversationForBoth({
          conversationId: currentPairing.id,
          currentGeneration: currentPairing.generation ?? 1,
          currentUserUid: uid,
          permanentlyUnpair,
        });
        if (permanentlyUnpair) {
          notify(
            "Conversation permanently destroyed for both users. Generation bumped and all records purged."
          );
        } else {
          notify(
            "All messages wiped for both users! Generation bumped; chat remains open."
          );
        }
      } catch (err) {
        notify(
          err instanceof Error ? err.message : "Failed to destroy conversation."
        );
      }
      setActiveModal(null);
      return;
    }

    activeContact.messages = [
      {
        id: `destroyed-${Date.now()}`,
        sender: "system",
        text: "This conversation generation has been destroyed. All encrypted records were revoked and purged.",
        time: "Just now",
      },
    ];
    activeContact.preview = "Conversation destroyed for both";
    activeContact.expiryBadge = "expired";
    setActiveModal(null);
    notify(
      `Conversation with ${activeContact.name} was permanently destroyed for both users.`
    );
  }

  async function handleReopenSession() {
    if (!currentPairing) return;
    try {
      await reopenConversation({
        conversationId: currentPairing.id,
        currentGeneration: currentPairing.generation ?? 1,
      });
      notify("Chat session reopened! Connection active.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to reopen conversation.");
    }
  }

  async function handleToggleVerified(isVerified: boolean) {
    if (!currentPairing || !peerUid || !peerAgreementKey) {
      activeContact.verified = isVerified;
      return;
    }

    try {
      const peerFingerprint = await deriveKeyFingerprint(peerAgreementKey);
      let safetyNum = "";
      if (myAgreementKey) {
        const res = await computeSafetyNumber(myAgreementKey, peerAgreementKey);
        safetyNum = res.safetyNumber;
      }

      if (isVerified) {
        await saveStoredVerification({
          userUid: uid,
          peerUid,
          conversationId: currentPairing.id,
          verifiedFingerprint: peerFingerprint,
          verifiedSafetyNumber: safetyNum,
          verifiedAt: Date.now(),
        });
        setVerificationMap((prev) => ({
          ...prev,
          [currentPairing.id]: {
            isVerified: true,
            isKeyChanged: false,
            safetyNumber: safetyNum,
            fingerprint: peerFingerprint,
          },
        }));
        notify(`Security key for ${activeContact.name} marked as verified.`);
      } else {
        await deleteStoredVerification(uid, peerUid);
        setVerificationMap((prev) => ({
          ...prev,
          [currentPairing.id]: {
            isVerified: false,
            isKeyChanged: false,
            safetyNumber: safetyNum,
            fingerprint: peerFingerprint,
          },
        }));
        notify(`Verification cleared for ${activeContact.name}.`);
      }
    } catch (err) {
      console.error("Failed to update verification status:", err);
      notify("Failed to update verification status.");
    }
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      {/* TopBar */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="ghost" size={20} />
          </span>
          <span>
            ghost<span className="brand-accent">chat</span>
          </span>
          <span className="brand-beta">
            {isLiveSession ? "PHASE 13 · PRODUCTION READY" : "DEMO PREVIEW"}
          </span>
        </div>

        <div className="topbar-right">
          {/* Offline indicator if disconnected */}
          {!pwa.isOnline && (
            <span
              className="offline-banner-pill"
              title="Network disconnected. Realtime ephemeral messaging is paused until reconnected."
            >
              <Icon name="shieldAlert" size={13} />
              <span>Offline Mode</span>
            </span>
          )}

          {/* Install PWA button */}
          {pwa.isInstallable && (
            <button
              type="button"
              className="install-app-btn"
              onClick={pwa.promptInstall}
              title="Install GhostChat as Desktop/Mobile PWA"
            >
              <Icon name="download" size={14} />
              <span>Install App</span>
            </button>
          )}

          {/* Keyboard shortcuts trigger */}
          <button
            type="button"
            className="icon-button"
            onClick={() => setActiveModal("shortcuts")}
            title="Keyboard Shortcuts (Ctrl + /)"
            aria-label="Keyboard Shortcuts"
            style={{ width: "32px", height: "32px" }}
          >
            <Icon name="device" size={16} />
          </button>

          {isLiveSession ? (
            <span className="auth-live-indicator" title={`Signed in as ${email}`}>
              <span className="secure-dot" />
              <span>{email}</span>
            </span>
          ) : (
            <button
              type="button"
              className="preview-badge-pill"
              onClick={onExitDemo}
              title="Click to sign in with provisioned Firebase account"
            >
              <span className="caption-dot" />
              <span>DEMO MODE · SIGN IN</span>
            </button>
          )}

          <button
            type="button"
            className="avatar avatar-me"
            onClick={() => {
              setRailSection("settings");
              setMobileShowList(true);
            }}
            aria-label={`Signed in as ${email}. Open privacy settings.`}
            title={email}
          >
            {email.slice(0, 1).toUpperCase()}
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className={`workspace ${mobileShowList ? "show-list" : ""}`}>
        {/* Navigation Rail (Desktop) */}
        <nav className="rail" aria-label="Main Navigation">
          <button
            type="button"
            className={`rail-button ${railSection === "chats" ? "selected" : ""}`}
            onClick={() => {
              setRailSection("chats");
              setMobileShowList(true);
            }}
            aria-label="Chats"
            title="Chats"
          >
            <Icon name="chat" size={20} />
            <span className="rail-badge">{chatsCount}</span>
          </button>

          <button
            type="button"
            className="rail-button"
            onClick={() => setActiveModal("pair")}
            aria-label="Invite contact"
            title="Invite & Pair"
          >
            <Icon name="users" size={20} />
          </button>

          <div className="rail-spacer" />

          <button
            type="button"
            className={`rail-button ${
              railSection === "settings" ? "selected" : ""
            }`}
            onClick={() => {
              setRailSection("settings");
              setMobileShowList(true);
            }}
            aria-label="Privacy & Security Settings"
            title="Privacy Settings"
          >
            <Icon name="settings" size={20} />
          </button>

          <button
            type="button"
            className="rail-help"
            onClick={() => setActiveModal("preview-info")}
            aria-label="About GhostChat Phase 3"
            title="Architecture & Status"
          >
            <Icon name="spark" size={18} />
          </button>
        </nav>

        {/* Conversation Panel / Sidebar */}
        <aside
          className={`conversation-panel ${
            railSection === "settings" ? "settings-panel" : ""
          }`}
        >
          {railSection === "chats" ? (
            <>
              <header className="panel-heading">
                <div>
                  <p className="eyebrow">YOUR SPACE</p>
                  <h1>
                    GhostChat{" "}
                    <span className="count-pill">
                      {allContacts.length.toString().padStart(2, "0")}
                    </span>
                  </h1>
                </div>

                <div className="panel-actions-row">
                  <button
                    type="button"
                    className="icon-button accent-button"
                    onClick={() => setActiveModal("pair")}
                    aria-label="Create one-time invite"
                    title="Create One-Time Invite"
                  >
                    <Icon name="plus" size={17} />
                  </button>
                  <div className="sidebar-menu-wrapper">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setIsSidebarMenuOpen((prev) => !prev)}
                      aria-label="More options"
                      title="Chat options"
                    >
                      <Icon name="dots" size={17} />
                    </button>
                    {isSidebarMenuOpen && (
                      <div className="sidebar-dropdown-menu">
                        <button
                          type="button"
                          className="sidebar-menu-item"
                          onClick={() => {
                            setIsSidebarMenuOpen(false);
                            setActiveModal("pair");
                          }}
                        >
                          <Icon name="plus" size={14} /> New One-Time Invite
                        </button>
                        {destroyedContactsCount > 0 && (
                          <button
                            type="button"
                            className="sidebar-menu-item danger-action"
                            onClick={handleClearAllDestroyed}
                          >
                            <Icon name="trash" size={14} /> Clear Inactive Chats ({destroyedContactsCount})
                          </button>
                        )}
                        {isLiveSession && (
                          <button
                            type="button"
                            className="sidebar-menu-item"
                            onClick={handleToggleDemoContacts}
                          >
                            <Icon name="users" size={14} /> {showDemoContacts ? "Hide Demo Contacts" : "Show Demo Contacts"}
                          </button>
                        )}
                        {hiddenContactIds.length > 0 && (
                          <button
                            type="button"
                            className="sidebar-menu-item"
                            onClick={handleRestoreHiddenChats}
                          >
                            <Icon name="refresh" size={14} /> Restore Hidden Chats ({hiddenContactIds.length})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </header>

              {/* Filter Tabs: Chats, Rooms, Requests */}
              <div className="filter-row" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "chats"}
                  className={`filter-chip ${
                    activeTab === "chats" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("chats")}
                >
                  Chats <span>{chatsCount}</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "rooms"}
                  className={`filter-chip ${
                    activeTab === "rooms" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("rooms")}
                >
                  Rooms <span>{roomsCount}</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "requests"}
                  className={`filter-chip ${
                    activeTab === "requests" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("requests")}
                >
                  Requests <span>{requestsCount}</span>
                </button>
              </div>

              {/* Search Box */}
              <label className="search-box">
                <Icon name="search" size={16} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations"
                  aria-label="Search conversations"
                />
                <kbd>⌘ K</kbd>
              </label>

              {/* Pairings Status Banner if loading or error */}
              {isLiveSession && pairingsLoading && (
                <div className="pairing-status-pill">
                  <span className="auth-spinner" />
                  <span>Syncing pairings from Firebase RTDB…</span>
                </div>
              )}

              {isLiveSession && pairingsError && (
                <div className="pairing-status-pill error-status">
                  <Icon name="info" size={13} />
                  <span>RTDB pairings unavailable. Check your connection.</span>
                </div>
              )}

              {/* Inactive / Destroyed chats cleanup banner */}
              {destroyedContactsCount > 0 && (
                <div className="cleanup-banner">
                  <span>{destroyedContactsCount} inactive / destroyed chat{destroyedContactsCount > 1 ? "s" : ""}</span>
                  <button
                    type="button"
                    className="cleanup-btn"
                    onClick={handleClearAllDestroyed}
                    title="Clear all destroyed chats from list"
                  >
                    Clear All
                  </button>
                </div>
              )}

              {/* Chat List Items */}
              <div
                className="chat-list"
                role="list"
                aria-label="Conversations List"
              >
                {filteredContacts.map((contact) => (
                  <ChatItem
                    key={contact.id}
                    contact={contact}
                    isActive={
                      activeContact.id === contact.id && railSection === "chats"
                    }
                    onSelect={() => {
                      setActiveContactId(contact.id);
                      setRailSection("chats");
                      setMobileShowList(false);
                    }}
                    onDelete={() => handleHideContact(contact.id)}
                  />
                ))}

                {filteredContacts.length === 0 && (
                  <div className="empty-search">
                    No conversations found in this tab.
                  </div>
                )}
              </div>

              {/* Floating Action Button (FAB) */}
              <button
                type="button"
                className="fab-compose"
                onClick={() => setActiveModal("pair")}
                aria-label="Start new encrypted chat"
                title="New Invite"
              >
                <Icon name="pencil" size={20} />
              </button>
            </>
          ) : (
            <PrivacySettingsView
              email={email}
              defaultTimer={activeTimer}
              onSelectTimer={(timer) => setActiveTimer(timer)}
              onOpenIdentity={() => setActiveModal("identity")}
              onSignOut={async () => {
                try {
                  await onSignOut();
                  notify("Signed out of session.");
                } catch (err) {
                  notify(err instanceof Error ? err.message : "Sign out failed.");
                }
              }}
              notify={notify}
              antiScreenshot={antiScreenshotEnabled}
              onToggleAntiScreenshot={handleToggleAntiScreenshot}
            />
          )}
        </aside>

        {/* Active Chat Conversation View */}
        <ChatView
          contact={{
            ...activeContact,
            online: isLivePairing ? presence.isPeerOnline : activeContact.online,
            lastSeen: isLivePairing ? presence.peerLastSeen : activeContact.lastSeen,
            isTyping: isLivePairing ? presence.isPeerTyping : activeContact.isTyping,
            messages: displayedMessages,
          }}
          activeTimer={activeTimer}
          onBack={() => setMobileShowList(true)}
          onOpenInfo={() => setActiveModal("info")}
          onOpenEphemeralModal={() => setActiveModal("ephemeral")}
          onOpenDestroyModal={() => setActiveModal("destroy")}
          onSendMessage={handleSendMessage}
          onTyping={presence.setTyping}
          isLive={isLivePairing}
          isKeyReady={Boolean(peerAgreementKey)}
          isDestroyed={isDestroyed}
          onReopenSession={handleReopenSession}
          onRenameContact={(newName) => handleSetNickname(activeContact.id, newName)}
          onDeleteConversation={() => handleHideContact(activeContact.id)}
          antiScreenshotEnabled={antiScreenshotEnabled}
          onScreenshotAttempt={(msg) => notify(msg)}
          onBurnMessage={(msgId) => live.burnMessage(msgId)}
          onStartVoiceCall={
            isLivePairing
              ? call.startCall
              : () => notify("Pair with a contact to start encrypted voice calls.")
          }
        />

        {/* WebRTC Ephemeral Voice Call Modal / Active Floating Bar */}
        <CallModal
          peerName={activeContact.name}
          peerInitials={activeContact.initials}
          callState={call.callState}
          durationSec={call.durationSec}
          isMuted={call.isMuted}
          onAccept={call.acceptCall}
          onDecline={call.declineCall}
          onEnd={call.endCall}
          onToggleMute={call.toggleMute}
        />
      </div>

      {/* Modals & Drawers */}
      {activeModal === "ephemeral" && (
        <EphemeralControlsModal
          activeTimer={activeTimer}
          onSelectTimer={(timer) => {
            setActiveTimer(timer);
            notify(`Message lifetime set to ${timer}.`);
          }}
          onDestroy={() => {
            setActiveModal("destroy");
          }}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === "destroy" && (
        <DestroyModal
          contactName={activeContact.name}
          onConfirmDestroy={handleConfirmDestroy}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === "info" && (
        <ChatInfoDrawer
          contact={activeContact}
          activeTimer={activeTimer}
          onClose={() => setActiveModal(null)}
          onOpenVerify={() => setActiveModal("verify")}
          onOpenEphemeral={() => setActiveModal("ephemeral")}
          onDestroy={() => setActiveModal("destroy")}
          notify={notify}
          onRenameContact={(newName) => handleSetNickname(activeContact.id, newName)}
          onDeleteContact={(id) => handleHideContact(id)}
        />
      )}

      {activeModal === "verify" && (
        <DeviceVerificationModal
          contact={activeContact}
          onToggleVerified={handleToggleVerified}
          onClose={() => setActiveModal(null)}
          notify={notify}
        />
      )}

      {activeModal === "pair" && (
        <PairingModal
          uid={uid}
          agreementPublicKey={myAgreementKey}
          onClose={() => setActiveModal(null)}
          onPaired={(code, customName) => {
            setActiveContactId(code);
            if (customName) {
              handleSetNickname(code, customName);
            }
            notify(`Invite ready: ${customName || code.slice(0, 8)}`);
          }}
          notify={notify}
        />
      )}

      {activeModal === "identity" && (
        <IdentityDialog
          state={identity.status}
          identity={
            identity.status === "ready" ? identity.identity : undefined
          }
          error={identity.status === "error" ? identity.message : undefined}
          onClose={() => setActiveModal(null)}
          onRemove={identity.remove}
          onRecreate={identity.recreate}
          notify={notify}
        />
      )}

      {activeModal === "preview-info" && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setActiveModal(null);
          }}
          role="presentation"
        >
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-scope-title"
          >
            <button
              type="button"
              className="modal-close icon-button"
              onClick={() => setActiveModal(null)}
              aria-label="Close dialog"
            >
              <Icon name="close" size={18} />
            </button>
            <div className="verify-symbol">
              <Icon name="users" size={24} />
            </div>
            <p className="eyebrow">PHASE 3 ARCHITECTURE</p>
            <h2 id="preview-scope-title">Private Invitation &amp; Pairing</h2>
            <p className="modal-copy">
              GhostChat Phase 3 implements high-entropy, single-use invite codes
              creating atomic, private 1-on-1 pairing nodes in Firebase RTDB.
            </p>
            <div className="destroy-implications-list">
              <div className="implication-item">
                <span className="dot danger-dot" />
                <span>
                  <strong>128-Bit Entropy &amp; 24h Lifetime:</strong> Random
                  URL-safe 22-character codes created with Web Crypto. Single-use
                  acceptance prevents replay or duplicate pairing.
                </span>
              </div>
              <div className="implication-item">
                <span className="dot neutral-dot" />
                <span>
                  <strong>Scoped Security Rules:</strong> Rules authorize only the
                  creator and the single accepting account to access the node. All
                  third-party enumeration is denied.
                </span>
              </div>
            </div>
            <button
              type="button"
              className="primary-modal-button"
              onClick={() => setActiveModal(null)}
            >
              Done
            </button>
          </section>
        </div>
      )}

      {activeModal === "shortcuts" && (
        <ShortcutsModal onClose={() => setActiveModal(null)} />
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="toast" role="status" aria-live="polite">
          <Icon name="check" size={16} />
          <span>{toastMessage}</span>
        </div>
      )}
    </main>
  );
}
