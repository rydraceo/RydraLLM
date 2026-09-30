"use client";

import { useEffect, useRef } from "react";
import type { CopilotAction } from "@/lib/ai/types";

const EVENT = "rydra:action";
const PENDING_KEY = "rydra:pending-actions";

export function emitAction(a: CopilotAction) {
  window.dispatchEvent(new CustomEvent<CopilotAction>(EVENT, { detail: a }));
}

// Used when the action targets a page that isn't mounted yet (Copilot navigates first).
export function queueAction(a: CopilotAction) {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    const list: CopilotAction[] = raw ? JSON.parse(raw) : [];
    list.push(a);
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {}
}

// Pages call this to receive Copilot actions. Queued actions are applied on mount.
export function useCopilotActions(handler: (a: CopilotAction) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const on = (e: Event) => ref.current((e as CustomEvent<CopilotAction>).detail);
    window.addEventListener(EVENT, on);
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (raw) {
        sessionStorage.removeItem(PENDING_KEY);
        (JSON.parse(raw) as CopilotAction[]).forEach((a) => ref.current(a));
      }
    } catch {}
    return () => window.removeEventListener(EVENT, on);
  }, []);
}
