import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, type, space } from "@/src/theme";

type Closet = {
  closet_id: string;
  user_id: string;
  name: string;
  description?: string | null;
  is_default: boolean;
  item_count: number;
};

export default function ClosetsScreen() {
  const router = useRouter();
  const [closets, setClosets] = useState<Closet[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ closets: Closet[] }>("/closets");
      setClosets(res.closets || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const createCloset = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await api<{ closet: Closet }>("/closets", {
        method: "POST",
        body: { name },
      });
      setClosets((prev) => [...prev, res.closet]);
      setNewName("");
      setShowCreate(false);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not create closet");
    } finally {
      setCreating(false);
    }
  };

  const deleteCloset = async (closet: Closet) => {
    const doDelete = async () => {
      try {
        await api(`/closets/${closet.closet_id}`, { method: "DELETE" });
        setClosets((prev) => prev.filter((c) => c.closet_id !== closet.closet_id));
      } catch (e: any) {
        Alert.alert("Error", e?.message || "Could not delete closet");
      }
    };

    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`Delete "${closet.name}"?`)) {
        await doDelete();
      }
      return;
    }
    Alert.alert(
      "Delete closet",
      `Delete "${closet.name}"? Items in this closet will not be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]} testID="closets-screen">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type.overline, { color: colors.text }]}>Manage Closets</Text>
        <TouchableOpacity
          onPress={() => setShowCreate(true)}
          style={styles.addBtn}
          testID="closets-add-btn"
        >
          <Ionicons name="add" size={22} color={colors.textInverse} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={closets}
          keyExtractor={(c) => c.closet_id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={type.bodySm}>No closets yet. Tap + to create one.</Text>
            </View>
          }
          renderItem={({ item: closet }) => (
            <View style={styles.row} testID={`closet-row-${closet.closet_id}`}>
              <View style={styles.rowIcon}>
                <Ionicons name="albums-outline" size={20} color={closet.is_default ? colors.accent : colors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.rowName}>{closet.name}</Text>
                  {closet.is_default && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>Default</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.rowSub}>
                  {closet.item_count === 1 ? "1 item" : `${closet.item_count} items`}
                </Text>
              </View>
              {!closet.is_default && (
                <TouchableOpacity
                  onPress={() => deleteCloset(closet)}
                  hitSlop={10}
                  testID={`closet-delete-${closet.closet_id}`}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}

      {/* Create closet modal */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={[type.overline, { marginBottom: space.md }]}>New Closet</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Summer, Work, Travel"
              placeholderTextColor={colors.textSecondary}
              style={styles.modalInput}
              autoFocus
              onSubmitEditing={createCloset}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: space.md }}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setShowCreate(false); setNewName(""); }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, creating && { opacity: 0.5 }]}
                onPress={createCloset}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color={colors.textInverse} size="small" />
                ) : (
                  <Text style={{ color: colors.textInverse, fontSize: 14, fontWeight: "700" }}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 2,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
  },
  listContent: { paddingBottom: 100 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.bgSecondary,
  },
  rowIcon: { marginRight: 14 },
  rowName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  rowSub: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  defaultBadge: {
    backgroundColor: "rgba(197,160,89,0.18)",
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  defaultBadgeText: { color: colors.accent, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBox: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    width: 300,
    borderRadius: 4,
  },
  modalInput: {
    color: colors.text,
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingVertical: 10,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
  },
  modalConfirm: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
});
