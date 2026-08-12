import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, type as type_, space } from "@/src/theme";

type BlockedAccount = {
  user_id: string;
  name: string;
};

export default function BlockedAccounts() {
  const router = useRouter();
  const [blocked, setBlocked] = useState<BlockedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ blocked: BlockedAccount[] }>("/blocks");
      setBlocked(res.blocked || []);
    } catch (e: any) {
      setError(e?.message || "Could not load blocked accounts.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const unblock = async (account: BlockedAccount) => {
    setBusyId(account.user_id);
    try {
      await api(`/blocks/${account.user_id}`, { method: "DELETE" });
      setBlocked((prev) => prev.filter((b) => b.user_id !== account.user_id));
    } catch (e: any) {
      const msg = e?.message || "Could not unblock this account.";
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type_.overline, { color: colors.text }]}>Blocked accounts</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.textSecondary} />
          <Text style={[type_.body, { color: colors.textSecondary, marginTop: space.md, textAlign: "center" }]}>
            {error}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : blocked.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="shield-checkmark-outline" size={48} color={colors.textSecondary} />
          <Text style={[type_.body, { marginTop: space.md, textAlign: "center", color: colors.textSecondary }]}>
            You haven't blocked anyone.{"\n"}Use the flag icon on a listing or profile to report or block.
          </Text>
        </View>
      ) : (
        <FlatList
          data={blocked}
          keyExtractor={(b) => b.user_id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl tintColor={colors.accent} refreshing={refreshing} onRefresh={onRefresh} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
              <TouchableOpacity
                style={styles.unblockBtn}
                onPress={() => unblock(item)}
                disabled={busyId === item.user_id}
                testID={`unblock-${item.user_id}`}
              >
                {busyId === item.user_id ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={styles.unblockText}>Unblock</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        />
      )}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg },
  list: { padding: space.lg, paddingBottom: 100 },
  separator: { height: 1, backgroundColor: colors.border },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  rowName: { flex: 1, color: colors.text, fontSize: 14 },
  unblockBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 88,
    alignItems: "center",
  },
  unblockText: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  retryBtn: { marginTop: space.lg, borderWidth: 1, borderColor: colors.accent, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
});
