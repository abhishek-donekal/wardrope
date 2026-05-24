// Design tokens — derived from /app/design_guidelines.json
import { Platform, TextStyle } from "react-native";

export const colors = {
  bg: "#050505",
  bgSecondary: "#121212",
  bgTertiary: "#1A1A1A",
  text: "#FFFFFF",
  textSecondary: "#A3A3A3",
  textInverse: "#000000",
  accent: "#C5A059",
  accentHover: "#DEB76E",
  danger: "#722F37",
  border: "#2A2A2A",
  borderLight: "#333333",
  overlay: "rgba(5,5,5,0.8)",
};

// Heading: serif (Playfair Display fallback). Body: system sans (Outfit fallback).
const serif = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" });
const sans = Platform.select({ ios: "System", android: "sans-serif", default: "System" });

export const fonts = {
  heading: serif as string,
  body: sans as string,
};

export const type: Record<string, TextStyle> = {
  h1: { fontFamily: fonts.heading, fontSize: 40, lineHeight: 44, letterSpacing: -1, color: colors.text, fontWeight: "600" },
  h2: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 36, letterSpacing: -0.5, color: colors.text, fontWeight: "600" },
  h3: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 28, color: colors.text, fontWeight: "600" },
  bodyLg: { fontFamily: fonts.body, fontSize: 18, lineHeight: 26, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.text },
  bodySm: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  overline: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.5,
    color: colors.textSecondary,
    textTransform: "uppercase" as TextStyle["textTransform"],
  },
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 };

export const radius = { sm: 2, md: 4, lg: 8, pill: 999 };
