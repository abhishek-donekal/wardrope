import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, type, space } from "@/src/theme";

const DEFAULT_CATS = ["tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"];

export default function ManageCategories() {
  const router = useRouter();
  const [custom, setCustom] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ categories: string[]; custom: string[] }>("/users/me/categories");
      setCustom(res.custom || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addCategory = async () => {
    const name = newName.trim().toLowerCase();
    if (!name) return;
    if (DEFAULT_CATS.includes(name) || custom.includes(name)) {
      Alert.alert("Duplicate", "That category already exists.");
      return;
    }
    setAdding(true);
    try {
      await api("/users/me/categories", { method: "POST", body: { name } });
      setCustom((prev) => [...prev, name]);
      setNewName("");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not add category");
    } finally {
      setAdding(false);
    }
  };

  const deleteCategory = async (name: string) => {
    let confirmed = false;
    if (Platform.OS === "web") {
      confirmed = typeof window !== "undefined" && window.confirm(`Remove "${name}" category?`);
      if (!confirmed) return;
    } else {
      confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert("Remove category", `Remove "${name}"?`, [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Remove", style: "destructive", onPress: () => resolve(true) },
        ]);
      });
      if (!confirmed) return;
    }
    setDeleting(name);
    try {
      await api(`/users/me/categories/${encodeURIComponent(name)}`, { method: "DELETE" });
      setCustom((prev) => prev.filter((c) => c !== name));
    } catch {}
    setDeleting(null);
  };

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type.overline, { color: colors.text }]}>Manage Categories</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Default categories — read-only */}
        <Text style={[type.overline, styles.sectionLabel]}>Default</Text>
        <View style={styles.section}>
          {DEFAULT_CATS.map((c) => (
            <View key={c} style={styles.row}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.catName, { color: colors.textSecondary }]}>{cap(c)}</Text>
            </View>
          ))}
        </View>

        {/* Custom categories */}
        <Text style={[type.overline, styles.sectionLabel]}>Custom</Text>
        <View style={styles.section}>
          {loading ? (
            <View style={{ padding: space.lg, alignItems: "center" }}>
              <ActivityIndicator color={colors.accent} size="small" />
            </View>
          ) : custom.length === 0 ? (
            <View style={styles.row}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>No custom categories yet</Text>
            </View>
          ) : (
            custom.map((c) => (
              <View key={c} style={styles.row}>
                <Ionicons name="pricetag-outline" size={16} color={colors.accent} />
                <Text style={styles.catName}>{cap(c)}</Text>
                {deleting === c ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <TouchableOpacity onPress={() => deleteCategory(c)} style={styles.deleteBtn}>
                    <Ionicons name="close-circle-outline" size={20} color="#FF7A7A" />
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>

        {/* Add new */}
        <Text style={[type.overline, styles.sectionLabel]}>Add New</Text>
        <View style={styles.addRow}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="e.g. Gym, Beach, Formal"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            onSubmitEditing={addCategory}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.addBtn, (!newName.trim() || adding) && { opacity: 0.4 }]}
            onPress={addCategory}
            disabled={!newName.trim() || adding}
          >
            {adding ? (
              <ActivityIndicator color={colors.textInverse} size="small" />
            ) : (
              <Ionicons name="add" size={22} color={colors.textInverse} />
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Categories appear as filters in your closet.</Text>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scroll: { padding: space.lg, paddingBottom: 120 },
  sectionLabel: { marginTop: space.xl, marginBottom: space.sm },
  section: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  catName: { flex: 1, color: colors.text, fontSize: 15 },
  deleteBtn: { padding: 4 },
  addRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: space.md,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 8,
  },
  addBtn: {
    width: 38,
    height: 38,
    backgroundColor: colors.accent,
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { color: colors.textSecondary, fontSize: 12, marginTop: space.sm },
});
