import { useSyncExternalStore } from "react";

export const PROCESS_DETAILS_FOLD_KEY = "pi-web:fold-process-details";
let folded = true;
const listeners = new Set<() => void>();

function readStored(): boolean {
  try { return window.localStorage.getItem(PROCESS_DETAILS_FOLD_KEY) !== "false"; }
  catch { return true; }
}

function notify() { listeners.forEach(listener => listener()); }
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== PROCESS_DETAILS_FOLD_KEY) return;
  const next = readStored();
  if (next !== folded) { folded = next; notify(); }
}
function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    folded = readStored();
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function setProcessDetailsFolded(next: boolean) {
  folded = next;
  try { window.localStorage.setItem(PROCESS_DETAILS_FOLD_KEY, String(next)); } catch {}
  notify();
}

/** Browser-only preference; turning it off restores the flat transcript. */
export function useProcessDetailsFolded(): boolean {
  return useSyncExternalStore(subscribe, () => folded, () => true);
}
