export type ThemeId = "editorial" | "ivory" | "midnight" | "rose" | "emerald";

export type ThemeColors = {
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  text: string;
  textSecondary: string;
  textInverse: string;
  accent: string;
  accentHover: string;
  accentMuted: string;
  danger: string;
  border: string;
  borderLight: string;
  overlay: string;
};

export type ThemePreset = {
  id: ThemeId;
  name: string;
  description: string;
  statusBar: "light" | "dark";
  swatch: [string, string, string];
  colors: ThemeColors;
};

export const DEFAULT_THEME_ID: ThemeId = "editorial";

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "editorial",
    name: "Editorial",
    description: "Near-black with warm gold — the classic Wardrope look.",
    statusBar: "light",
    swatch: ["#050505", "#C5A059", "#FFFFFF"],
    colors: {
      bg: "#050505",
      bgSecondary: "#121212",
      bgTertiary: "#1A1A1A",
      text: "#FFFFFF",
      textSecondary: "#A3A3A3",
      textInverse: "#000000",
      accent: "#C5A059",
      accentHover: "#DEB76E",
      accentMuted: "rgba(197, 160, 89, 0.12)",
      danger: "#722F37",
      border: "#2A2A2A",
      borderLight: "#333333",
      overlay: "rgba(5, 5, 5, 0.8)",
    },
  },
  {
    id: "ivory",
    name: "Ivory",
    description: "Soft cream backgrounds with charcoal text and gold accents.",
    statusBar: "dark",
    swatch: ["#F5F0E8", "#C5A059", "#1A1A1A"],
    colors: {
      bg: "#F5F0E8",
      bgSecondary: "#EDE6DA",
      bgTertiary: "#E2D9CC",
      text: "#1A1A1A",
      textSecondary: "#5C5C5C",
      textInverse: "#FFFFFF",
      accent: "#9A7B3C",
      accentHover: "#B8924F",
      accentMuted: "rgba(154, 123, 44, 0.12)",
      danger: "#8B3A42",
      border: "#D4C9B8",
      borderLight: "#C9BCA8",
      overlay: "rgba(245, 240, 232, 0.92)",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep navy tones with cool silver highlights.",
    statusBar: "light",
    swatch: ["#0A0F1A", "#8BA4C4", "#E8EDF5"],
    colors: {
      bg: "#0A0F1A",
      bgSecondary: "#111827",
      bgTertiary: "#1A2332",
      text: "#E8EDF5",
      textSecondary: "#8B9CB5",
      textInverse: "#0A0F1A",
      accent: "#8BA4C4",
      accentHover: "#A8BDD4",
      accentMuted: "rgba(139, 164, 196, 0.14)",
      danger: "#9B4D5A",
      border: "#243044",
      borderLight: "#2E3D52",
      overlay: "rgba(10, 15, 26, 0.85)",
    },
  },
  {
    id: "rose",
    name: "Rose",
    description: "Dark canvas with blush and rose-gold accents.",
    statusBar: "light",
    swatch: ["#120A0E", "#D4849A", "#F5E6EC"],
    colors: {
      bg: "#120A0E",
      bgSecondary: "#1C1218",
      bgTertiary: "#261C22",
      text: "#F5E6EC",
      textSecondary: "#A89098",
      textInverse: "#120A0E",
      accent: "#D4849A",
      accentHover: "#E8A0B4",
      accentMuted: "rgba(212, 132, 154, 0.14)",
      danger: "#8B3A4A",
      border: "#3A2A32",
      borderLight: "#4A3840",
      overlay: "rgba(18, 10, 14, 0.85)",
    },
  },
  {
    id: "emerald",
    name: "Emerald",
    description: "Rich forest darks with fresh jade accents.",
    statusBar: "light",
    swatch: ["#071210", "#4A9B7F", "#E2F0EA"],
    colors: {
      bg: "#071210",
      bgSecondary: "#0F1E1A",
      bgTertiary: "#162822",
      text: "#E2F0EA",
      textSecondary: "#7A9A8E",
      textInverse: "#071210",
      accent: "#4A9B7F",
      accentHover: "#5FB896",
      accentMuted: "rgba(74, 155, 127, 0.14)",
      danger: "#8B4A4A",
      border: "#1E332C",
      borderLight: "#2A4438",
      overlay: "rgba(7, 18, 16, 0.85)",
    },
  },
];

export const THEME_MAP: Record<ThemeId, ThemePreset> = Object.fromEntries(
  THEME_PRESETS.map((t) => [t.id, t]),
) as Record<ThemeId, ThemePreset>;

export function isThemeId(value: string): value is ThemeId {
  return value in THEME_MAP;
}
