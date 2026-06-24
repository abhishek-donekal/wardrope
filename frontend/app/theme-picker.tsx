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

import { useTheme } from "@/src/contexts/ThemeContext";
import { colors, type, space } from "@/src/theme";
import type { ThemeId } from "@/src/themes/presets";

export default function ThemePicker() {
  const router = useRouter();
  const { themeId, presets, setTheme } = useTheme();
  const [saving, setSaving] = useState<ThemeId | null>(null);

  const pick = async (id: ThemeId) => {
    if (id === themeId || saving) return;
    setSaving(id);
    try {
      await setTheme(id);
    } catch {
      setSaving(null);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]} testID="theme-picker-screen">
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} testID="theme-back-btn">
          <Ionicons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type.overline, { color: colors.text }]}>Appearance</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[type.h2, { marginBottom: 8 }]}>Choose your theme</Text>
        <Text style={[type.bodySm, { marginBottom: space.xl }]}>
          Pick a color palette that fits your style. Your choice syncs across devices when signed in.
        </Text>

        {presets.map((preset) => {
          const isActive = preset.id === themeId;
          const isSaving = saving === preset.id;
          return (
            <TouchableOpacity
              key={preset.id}
              testID={`theme-card-${preset.id}`}
              style={[styles.card, isActive && styles.cardActive]}
              onPress={() => pick(preset.id)}
              activeOpacity={0.82}
            >
              <View style={styles.cardHeader}>
                <View style={styles.swatchRow}>
                  {preset.swatch.map((hex) => (
                    <View key={hex} style={[styles.swatch, { backgroundColor: hex }]} />
                  ))}
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[styles.name, isActive && { color: colors.accent }]}>{preset.name}</Text>
                  <Text style={styles.tagline}>{preset.description}</Text>
                </View>
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : isActive ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
                ) : (
                  <View style={styles.radioEmpty} />
                )}
              </View>
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
    backgroundColor: colors.accentMuted,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  swatchRow: { flexDirection: "row", gap: 4 },
  swatch: {
    width: 18,
    height: 28,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  name: { color: colors.text, fontSize: 16, fontWeight: "700" },
  tagline: { color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 },
  radioEmpty: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
});
