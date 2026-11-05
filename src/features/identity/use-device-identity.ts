"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createNewDeviceIdentity,
  deleteDeviceIdentity,
  getOrCreateDeviceIdentity,
  type DeviceIdentity,
} from "@/features/identity/identity-service";

type IdentityState =
  | { status: "loading" }
  | { status: "ready"; identity: DeviceIdentity }
  | { status: "missing" }
  | { status: "error"; message: string };

export function useDeviceIdentity(uid: string) {
  const [state, setState] = useState<IdentityState>({ status: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    void getOrCreateDeviceIdentity(uid)
      .then((identity) => { if (active) setState({ status: "ready", identity }); })
      .catch((error: unknown) => {
        if (active) setState({ status: "error", message: error instanceof Error ? error.message : "Local identity could not be loaded." });
      });
    return () => { active = false; };
  }, [uid, refreshKey]);

  const remove = useCallback(async () => {
    await deleteDeviceIdentity(uid);
    setState({ status: "missing" });
  }, [uid]);

  const recreate = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const identity = await createNewDeviceIdentity(uid);
      setState({ status: "ready", identity });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "A new local identity could not be created." });
    }
  }, [uid]);

  const reload = useCallback(() => setRefreshKey((key) => key + 1), []);
  return { ...state, remove, recreate, reload };
}
