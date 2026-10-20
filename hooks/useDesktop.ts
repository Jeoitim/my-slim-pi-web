"use client";
import { useSyncExternalStore } from "react";
import type { DesktopBridge } from "@/electron/shared/contracts";
const subscribe = () => () => {};
const snapshot = (): DesktopBridge | undefined => window.piDesktop;
const serverSnapshot = () => undefined;
/** Capability detection, never a user-agent or URL flag. */
export function useDesktop() { return useSyncExternalStore(subscribe, snapshot, serverSnapshot); }
