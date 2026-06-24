import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";

import { api } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import {
  applyTheme,
  getActiveThemeId,
  getStatusBarStyle,
  reloadApp,
  THEME_STORAGE_KEY,
} from "@/src/theme";
import {
  DEFAULT_THEME_ID,
  isThemeId,
  THEME_PRESETS,
  type ThemeId,
  type ThemePreset,
} from "@/src/themes/presets";

import { useAuth } from "./AuthContext";

type ThemeState = {
  themeId: ThemeId;
  statusBarStyle: "light" | "dark";
  presets: ThemePreset[];
  setTheme: (themeId: ThemeId) => Promise<void>;
};

const Ctx = createContext<ThemeState | null>(null);

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme must be used inside ThemeProvider");
  return v;
}

const ALLOWED_THEMES = new Set(THEME_PRESETS.map((t) => t.id));

export async function bootThemeFromStorage(): Promise<boolean> {
  if (Platform.OS === "web") return true;

  const stored = await storage.getItem(THEME_STORAGE_KEY, DEFAULT_THEME_ID);
  const storedId = isThemeId(stored) ? stored : DEFAULT_THEME_ID;
  if (storedId !== getActiveThemeId()) {
    applyTheme(storedId);
    reloadApp();
    return false;
  }
  return true;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, isDemoMode } = useAuth();
  const [themeId, setThemeId] = useState<ThemeId>(getActiveThemeId());

  useEffect(() => {
    if (!user?.theme_id || isDemoMode) return;
    const remoteId = isThemeId(user.theme_id) ? user.theme_id : DEFAULT_THEME_ID;
    if (remoteId === getActiveThemeId()) return;

    applyTheme(remoteId);
    storage.setItem(THEME_STORAGE_KEY, remoteId);
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.setItem(THEME_STORAGE_KEY, remoteId);
    }
    reloadApp();
  }, [user?.theme_id, isDemoMode]);

  const setTheme = useCallback(
    async (nextId: ThemeId) => {
      if (!ALLOWED_THEMES.has(nextId) || nextId === getActiveThemeId()) return;

      applyTheme(nextId);
      await storage.setItem(THEME_STORAGE_KEY, nextId);
      if (Platform.OS === "web" && typeof localStorage !== "undefined") {
        localStorage.setItem(THEME_STORAGE_KEY, nextId);
      }

      if (user && !isDemoMode) {
        try {
          await api("/users/me/profile", { method: "PUT", body: { theme_id: nextId } });
        } catch {
          // Local preference still saved; sync on next login.
        }
      }

      setThemeId(nextId);
      reloadApp();
    },
    [user, isDemoMode],
  );

  return (
    <Ctx.Provider
      value={{
        themeId,
        statusBarStyle: getStatusBarStyle(),
        presets: THEME_PRESETS,
        setTheme,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
