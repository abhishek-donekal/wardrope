import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { colors, type, space } from "@/src/theme";

type PersonaKey = "editor" | "architect" | "rebel" | "hype" | "goddess";

type Persona = {
  key: PersonaKey;
  name: string;
  tagline: string;
  description: string;
  emoji: string;
};

const PERSONAS: Persona[] = [
  {
    key: "editor",
    name: "The Editor",
    tagline: "Sharp eye, impeccable taste",
    emoji: "👁",
    description:
      "A Vogue-grade fashion director — authoritative, discerning, and always three seasons ahead. Think Anna Wintour meets Grace Coddington. Brevity with wit; truth without apology.",
  },
  {
    key: "architect",
    name: "The Architect",
    tagline: "Minimalism as philosophy",
    emoji: "□",
    description:
      "Armani, Jil Sander, Phoebe Philo — every line purposeful, every detail intentional, every excess eliminated. Quiet luxury that whispers rather than shouts.",
  },
  {
    key: "rebel",
    name: "The Rebel",
    tagline: "Fashion is never just clothes",
    emoji: "⚡",
    description:
      "McQueen's raw darkness, Westwood's anarchic tailoring, Galliano's theatrical genius. Fashion as art, protest, and identity. Challenges every convention.",
  },
  {
    key: "hype",
    name: "The Hype Maven",
    tagline: "Where street meets suite",
    emoji: "◈",
    description:
      "Virgil Abloh's deconstruction, Kim Jones's archival obsession, Jerry Lorenzo's spiritual minimalism. Bridges streetwear and luxury with effortless cultural fluency.",
  },
  {
    key: "goddess",
    name: "The Goddess",
    tagline: "More is always more",
    emoji: "✦",
    description:
      "Versace, Valentino, Cavalli — bold, glamorous, unapologetically maximalist. Celebrates color, drama, pattern, and the visceral joy of being seen.",
  },
];

export default function PersonaPicker() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [saving, setSaving] = useState<PersonaKey | null>(null);
  const current = (user?.stylist_persona ?? "editor") as PersonaKey;

  const pick = async (key: PersonaKey) => {
    if (key === current || saving) return;
    setSaving(key);
    try {
      const res = await api<{ user: any }>("/users/me/profile", {
        method: "PUT",
        body: { stylist_persona: key },
      });
      setUser(res.user);
      router.back();
    } catch {
      setSaving(null);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]} testID="persona-picker-screen">
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} testID="persona-back-btn">
          <Ionicons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type.overline, { color: colors.text }]}>Your Stylist</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[type.h2, { marginBottom: 8 }]}>Choose your AI persona</Text>
        <Text style={[type.bodySm, { marginBottom: space.xl, color: colors.textSecondary }]}>
          Your stylist shapes how the AI talks to you — outfit critiques, wardrobe gaps, and style advice all take on this voice.
        </Text>

        {PERSONAS.map((p) => {
          const isActive = p.key === current;
          const isSaving = saving === p.key;
          return (
            <TouchableOpacity
              key={p.key}
              testID={`persona-card-${p.key}`}
              style={[styles.card, isActive && styles.cardActive]}
              onPress={() => pick(p.key)}
              activeOpacity={0.82}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.emoji, isActive && { color: colors.accent }]}>{p.emoji}</Text>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[styles.name, isActive && { color: colors.accent }]}>{p.name}</Text>
                  <Text style={styles.tagline}>{p.tagline}</Text>
                </View>
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : isActive ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
                ) : (
                  <View style={styles.radioEmpty} />
                )}
              </View>
              <Text style={styles.description}>{p.description}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  scroll: { padding: space.lg, paddingBottom: 120 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
    padding: space.lg,
    marginBottom: 12,
    borderRadius: 2,
  },
  cardActive: {
    borderColor: colors.accent,
    backgroundColor: "rgba(197,160,89,0.07)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  emoji: { fontSize: 24, color: colors.textSecondary, width: 32, textAlign: "center" },
  name: { color: colors.text, fontSize: 16, fontWeight: "700" },
  tagline: { color: colors.textSecondary, fontSize: 12, marginTop: 2, fontStyle: "italic" },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  radioEmpty: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
});
