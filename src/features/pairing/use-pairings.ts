"use client";

import { useEffect, useState } from "react";
import {
  subscribeToUserConversations,
  type PairingEntry,
} from "./pairing-service";

export function usePairings(uid: string) {
  const [pairings, setPairings] = useState<PairingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);

    try {
      return subscribeToUserConversations(
        uid,
        (records) => {
          setPairings(records);
          setLoading(false);
        },
        () => {
          setError(true);
          setLoading(false);
        },
      );
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [uid]);

  return { pairings, loading, error };
}
