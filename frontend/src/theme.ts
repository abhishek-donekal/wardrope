// Design tokens — theme presets in ./themes/presets.ts
import { Platform, TextStyle } from "react-native";

import {
  DEFAULT_THEME_ID,
  isThemeId,
  THEME_MAP,
  type ThemeColors,
  type ThemeId,
} from "./themes/presets";

export const THEME_STORAGE_KEY = "wardrope_theme_id";

export type { ThemeColors, ThemeId };

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" });
const sans = Platform.select({ ios: "System", android: "sans-serif", default: "System" });

export const fonts = {
  heading: serif as string,
  body: sans as string,
};

function readWebStoredThemeId(): ThemeId | null {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") return null;
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored && isThemeId(stored)) return stored;
  return null;
}

let activeThemeId: ThemeId = readWebStoredThemeId() ?? DEFAULT_THEME_ID;

function buildType(c: ThemeColors): Record<string, TextStyle> {
  return {
    h1: {
      fontFamily: fonts.heading,
      fontSize: 40,
      lineHeight: 44,
      letterSpacing: -1,
      color: c.text,
      fontWeight: "600",
    },
    h2: {
      fontFamily: fonts.heading,
      fontSize: 32,
      lineHeight: 36,
      letterSpacing: -0.5,
      color: c.text,
      fontWeight: "600",
    },
    h3: {
      fontFamily: fonts.heading,
      fontSize: 24,
      lineHeight: 28,
      color: c.text,
      fontWeight: "600",
    },
    bodyLg: { fontFamily: fonts.body, fontSize: 18, lineHeight: 26, color: c.text },
    body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: c.text },
    bodySm: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.textSecondary },
    overline: {
      fontFamily: fonts.body,
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 1.5,
      color: c.textSecondary,
      textTransform: "uppercase" as TextStyle["textTransform"],
    },
  };
}

export let colors: ThemeColors = { ...THEME_MAP[activeThemeId].colors };
export let type: Record<string, TextStyle> = buildType(colors);

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 };
export const radius = { sm: 2, md: 4, lg: 8, pill: 999 };

export function getActiveThemeId(): ThemeId {
  return activeThemeId;
}

export function getStatusBarStyle(): "light" | "dark" {
  return THEME_MAP[activeThemeId].statusBar;
}

export function applyTheme(themeId: ThemeId): void {
  const preset = THEME_MAP[themeId] ?? THEME_MAP[DEFAULT_THEME_ID];
  activeThemeId = preset.id;
  colors = { ...preset.colors };
  type = buildType(colors);
}

export function reloadApp(): void {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.location.reload();
    return;
  }
  try {
    const { DevSettings } = require("react-native");
    DevSettings.reload();
  } catch {
    // Production builds without DevSettings — theme applies on next cold start.
  }
}
