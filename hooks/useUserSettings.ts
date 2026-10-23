"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { UserProvider } from "@/types/library";

export type { UserProvider };

export interface UserSettings {
  provider: UserProvider;
  apiKey: string; // empty → Groq
}

// Provider choice persists; a personal API key lives in sessionStorage (this tab only, cleared on close).
const STORAGE_KEY = "yapdraw-user-settings";
const SESSION_KEY_STORAGE = "saysketch-session-api-key";

const DEFAULT_SETTINGS: UserSettings = {
  provider: "openrouter",
  apiKey: "",
};

let clientCache: UserSettings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();
let didScheduleHydrate = false;

function load(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<UserSettings>;
    // Older versions kept the key in localStorage; move it to this session and drop it from disk.
    if (stored.apiKey) {
      if (!sessionStorage.getItem(SESSION_KEY_STORAGE)) sessionStorage.setItem(SESSION_KEY_STORAGE, stored.apiKey);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider: stored.provider ?? DEFAULT_SETTINGS.provider }));
    }
    return {
      provider: stored.provider ?? DEFAULT_SETTINGS.provider,
      apiKey: sessionStorage.getItem(SESSION_KEY_STORAGE) ?? "",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function getSnapshot(): UserSettings {
  return clientCache;
}

function getServerSnapshot(): UserSettings {
  return DEFAULT_SETTINGS;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (typeof window === "undefined") {
    return () => {
      listeners.delete(onChange);
    };
  }

  const onStorage = () => {
    clientCache = load();
    listeners.forEach((l) => l());
  };
  window.addEventListener("storage", onStorage);

  if (!didScheduleHydrate) {
    didScheduleHydrate = true;
    clientCache = load();
    queueMicrotask(() => {
      listeners.forEach((l) => l());
    });
  }

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useUserSettings() {
  const settings = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setSettings = useCallback(
    (update: UserSettings | ((prev: UserSettings) => UserSettings)) => {
      const next =
        typeof update === "function"
          ? (update as (prev: UserSettings) => UserSettings)(clientCache)
          : update;
      clientCache = next;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider: next.provider }));
        if (next.apiKey) sessionStorage.setItem(SESSION_KEY_STORAGE, next.apiKey);
        else sessionStorage.removeItem(SESSION_KEY_STORAGE);
      } catch {
        /* ignore quota / private mode */
      }
      listeners.forEach((l) => l());
    },
    [],
  );

  return { settings, setSettings };
}
