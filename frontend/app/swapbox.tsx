import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Modal,
  TextInput,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { colors, type as type_, space } from "@/src/theme";

type SwapItem = {
  swap_box_id: string;
  item_id?: string;
  name: string;
  image_url?: string;
  tags?: { category?: string; color?: string };
  owner_name?: string;
  points_cost: number;
  status?: "available" | "claimed";
  description?: string;
};

type ClosetItem = {
  item_id: string;
  name: string;
  image_base64?: string;
  image_url?: string;
  tags?: { category?: string; color?: string };
};

/** A Swap Box entry is named after the closet item it was listed from. */
function itemLabel(item: SwapItem): string {
  return item.name?.trim() || "Untitled item";
}

function timeToast(msg: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(msg);
  } else {
    Alert.alert("", msg);
  }
}

export default function SwapBox() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user, setUser } = useAuth();
  const [tab, setTab] = useState<"browse" | "mine">("browse");
  const [browse, setBrowse] = useState<SwapItem[]>([]);
  const [mine, setMine] = useState<SwapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  // List modal
  const [listModalOpen, setListModalOpen] = useState(false);
  const [closetItems, setClosetItems] = useState<ClosetItem[]>([]);
  const [closetLoading, setClosetLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ClosetItem | null>(null);
  const [listDesc, setListDesc] = useState("");
  const [listPoints, setListPoints] = useState("200");
  const [listBusy, setListBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const [browseRes, mineRes] = await Promise.all([
        api<{ items: SwapItem[] }>("/swapbox"),
        api<{ items: SwapItem[] }>("/swapbox/mine"),
      ]);
      setBrowse(browseRes.items || []);
      setMine(mineRes.items || []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const claimItem = async (item: SwapItem) => {
    const pts = item.points_cost;
    const userPts = user?.points ?? 0;

    if (userPts < pts) {
      const msg = `You need ${pts} pts to claim this item. You have ${userPts} pts.`;
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(msg);
      } else {
        Alert.alert("Not enough points", msg);
      }
      return;
    }

    const dolaim = async () => {
      setClaimingId(item.swap_box_id);
      try {
        const res = await api<{ points_remaining?: number; owner_name?: string }>(
          `/swapbox/${item.swap_box_id}/claim`,
          { method: "POST" }
        );
        if (user && res.points_remaining != null) {
          setUser({ ...user, points: res.points_remaining });
        }
        const owner = res.owner_name || item.owner_name || "The owner";
        timeToast(
          `Claimed "${itemLabel(item)}" for ${pts} pts. ${owner} has been notified and will see it in their activity feed.`
        );
        load();
      } catch (e: any) {
        const msg = e?.message || "Could not complete claim.";
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.alert(msg);
        } else {
          Alert.alert("Error", msg);
        }
      } finally {
        setClaimingId(null);
      }
    };

    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm(`Use ${pts} pts to claim "${itemLabel(item)}"?`)) dolaim();
    } else {
      Alert.alert("Claim this item?", `Use ${pts} pts to claim "${itemLabel(item)}"?\nYou have ${userPts} pts.`, [
        { text: "Cancel", style: "cancel" },
        { text: `Use ${pts} pts`, onPress: dolaim },
      ]);
    }
  };

  const deleteItem = async (item: SwapItem) => {
    const doDelete = async () => {
      try {
        await api(`/swapbox/${item.swap_box_id}`, { method: "DELETE" });
        setMine((prev) => prev.filter((i) => i.swap_box_id !== item.swap_box_id));
      } catch (e: any) {
        Alert.alert("Error", e?.message || "Could not delete listing.");
      }
    };
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm(`Remove "${itemLabel(item)}" from the Swap Box?`)) doDelete();
    } else {
      Alert.alert("Remove listing?", `Remove "${itemLabel(item)}" from the Swap Box?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const openListModal = async () => {
    setListModalOpen(true);
    setClosetLoading(true);
    setSelectedItem(null);
    setListDesc("");
    setListPoints("200");
    setSearchQuery("");
    try {
      const res = await api<{ items: ClosetItem[] }>("/items");
      setClosetItems(res.items || []);
    } catch {}
    setClosetLoading(false);
  };

  const submitListing = async () => {
    if (!selectedItem) {
      Alert.alert("Select an item first");
      return;
    }
    const pts = parseInt(listPoints, 10);
    if (isNaN(pts) || pts < 1) {
      Alert.alert("Enter a valid points cost");
      return;
    }
    setListBusy(true);
    try {
      await api("/swapbox", {
        method: "POST",
        body: {
          item_id: selectedItem.item_id,
          description: listDesc.trim() || undefined,
          points_cost: pts,
        },
      });
      setListModalOpen(false);
      if (user) setUser({ ...user, points: (user.points ?? 0) + 100 });
      timeToast("Listed! You earned 100 points!");
      load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not list item.");
    } finally {
      setListBusy(false);
    }
  };

  const filteredCloset = searchQuery.trim()
    ? closetItems.filter((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : closetItems;

  const data = tab === "browse" ? browse : mine;

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type_.overline, { color: colors.text }]}>Virtual SWAP Box</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Points balance */}
      {user && (
        <View style={styles.balanceRow}>
          <Ionicons name="trophy-outline" size={14} color={colors.accent} />
          <Text style={styles.balanceText}>Your balance: {user.points ?? 0} pts</Text>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "browse" && styles.tabBtnActive]}
          onPress={() => setTab("browse")}
        >
          <Text style={[styles.tabText, tab === "browse" && styles.tabTextActive]}>Browse</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "mine" && styles.tabBtnActive]}
          onPress={() => setTab("mine")}
        >
          <Text style={[styles.tabText, tab === "mine" && styles.tabTextActive]}>Mine</Text>
        </TouchableOpacity>
      </View>

      {tab === "mine" && (
        <TouchableOpacity style={styles.listBtn} onPress={openListModal}>
          <Ionicons name="add-circle-outline" size={18} color={colors.textInverse} />
          <Text style={styles.listBtnText}>List an Item</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cube-outline" size={48} color={colors.textSecondary} />
          <Text style={[type_.body, { marginTop: space.md, textAlign: "center", color: colors.textSecondary }]}>
            {tab === "browse"
              ? "No items in the Swap Box yet"
              : "You haven't listed any items yet"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(it) => it.swap_box_id}
          numColumns={width > 768 ? 4 : width > 480 ? 3 : 2}
          key={width > 768 ? "4" : width > 480 ? "3" : "2"}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: 12 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={<RefreshControl tintColor={colors.accent} refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onLongPress={tab === "mine" && item.status === "available" ? () => deleteItem(item) : undefined}
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.cardImg} />
              ) : (
                <View style={[styles.cardImg, styles.cardImgPlaceholder]}>
                  <Ionicons name="shirt-outline" size={32} color={colors.textSecondary} />
                </View>
              )}
              <View style={styles.cardInfo}>
                {/* Tags */}
                <View style={styles.tagsRow}>
                  {item.tags?.category ? (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>{item.tags.category}</Text>
                    </View>
                  ) : null}
                  {item.tags?.color ? (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>{item.tags.color}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.cardName} numberOfLines={1}>{itemLabel(item)}</Text>
                {tab === "browse" && item.owner_name ? (
                  <Text style={styles.cardOwner} numberOfLines={1}>{item.owner_name}</Text>
                ) : null}
                {tab === "mine" && item.status ? (
                  <View style={[styles.statusBadge, item.status === "claimed" ? styles.statusClaimed : styles.statusAvailable]}>
                    <Text style={styles.statusText}>{item.status === "claimed" ? "Claimed" : "Available"}</Text>
                  </View>
                ) : null}
                {tab === "browse" ? (
                  <TouchableOpacity
                    style={styles.claimBtn}
                    onPress={() => claimItem(item)}
                    disabled={claimingId === item.swap_box_id}
                  >
                    {claimingId === item.swap_box_id ? (
                      <ActivityIndicator size="small" color={colors.textInverse} />
                    ) : (
                      <Text style={styles.claimBtnText}>{item.points_cost} pts</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
                {tab === "mine" && item.status === "available" ? (
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(item)}>
                    <Ionicons name="trash-outline" size={14} color={colors.danger} />
                    <Text style={styles.deleteBtnText}>Remove</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* List an Item Modal */}
      <Modal
        visible={listModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setListModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[type_.overline, { color: colors.text }]}>List an Item</Text>
              <TouchableOpacity onPress={() => setListModalOpen(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            {closetLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search your closet…"
                  placeholderTextColor={colors.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />

                <Text style={[type_.overline, { marginBottom: space.sm, marginTop: space.md }]}>
                  Select Item
                </Text>

                {filteredCloset.length === 0 ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: space.md }}>
                    No items found.
                  </Text>
                ) : (
                  filteredCloset.map((ci) => (
                    <TouchableOpacity
                      key={ci.item_id}
                      style={[styles.closetRow, selectedItem?.item_id === ci.item_id && styles.closetRowSelected]}
                      onPress={() => setSelectedItem(ci)}
                    >
                      {ci.image_base64 ? (
                        <Image source={{ uri: `data:image/jpeg;base64,${ci.image_base64}` }} style={styles.closetThumb} />
                      ) : ci.image_url ? (
                        <Image source={{ uri: ci.image_url }} style={styles.closetThumb} />
                      ) : (
                        <View style={[styles.closetThumb, styles.closetThumbPlaceholder]}>
                          <Ionicons name="shirt-outline" size={16} color={colors.textSecondary} />
                        </View>
                      )}
                      <Text style={styles.closetRowName} numberOfLines={1}>{ci.name}</Text>
                      {selectedItem?.item_id === ci.item_id && (
                        <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                      )}
                    </TouchableOpacity>
                  ))
                )}

                <Text style={styles.fieldLabel}>Description (optional)</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Describe the condition, fit, etc."
                  placeholderTextColor={colors.textSecondary}
                  value={listDesc}
                  onChangeText={setListDesc}
                  multiline
                />

                <Text style={styles.fieldLabel}>Points Cost</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="200"
                  placeholderTextColor={colors.textSecondary}
                  value={listPoints}
                  onChangeText={setListPoints}
                  keyboardType="number-pad"
                />

                <TouchableOpacity
                  style={[styles.submitBtn, listBusy && { opacity: 0.6 }]}
                  onPress={submitListing}
                  disabled={listBusy}
                >
                  {listBusy ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <Text style={styles.submitBtnText}>List Item — Earn 100 pts</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  balanceText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBtnActive: { borderBottomColor: colors.accent },
  tabText: { color: colors.textSecondary, fontSize: 13, letterSpacing: 0.5, fontWeight: "600" },
  tabTextActive: { color: colors.accent },
  listBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent,
    marginHorizontal: space.lg,
    marginVertical: space.md,
    paddingVertical: 12,
  },
  listBtnText: { color: colors.textInverse, fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg },
  grid: { padding: space.lg, paddingBottom: 120 },
  card: { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary },
  cardImg: { width: "100%", aspectRatio: 0.85, backgroundColor: colors.bgTertiary },
  cardImgPlaceholder: { alignItems: "center", justifyContent: "center" },
  cardInfo: { padding: 10 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 6 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border },
  tagText: { fontSize: 9, color: colors.textSecondary, textTransform: "capitalize", letterSpacing: 0.3 },
  cardName: { color: colors.text, fontSize: 13, fontWeight: "600" },
  cardOwner: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  statusBadge: { alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2 },
  statusAvailable: { backgroundColor: "rgba(197,160,89,0.2)" },
  statusClaimed: { backgroundColor: "rgba(100,200,100,0.2)" },
  statusText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, color: colors.text, textTransform: "uppercase" },
  claimBtn: { marginTop: 8, backgroundColor: colors.accent, paddingVertical: 7, alignItems: "center", borderRadius: 2 },
  claimBtnText: { color: colors.textInverse, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  deleteBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  deleteBtnText: { color: colors.danger, fontSize: 11 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: "85%",
    padding: space.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space.md,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    color: colors.text,
    fontSize: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingVertical: 10,
    marginBottom: space.md,
  },
  closetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    backgroundColor: colors.bgTertiary,
    gap: 10,
  },
  closetRowSelected: { borderColor: colors.accent },
  closetThumb: { width: 40, height: 40, backgroundColor: colors.bg },
  closetThumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  closetRowName: { flex: 1, color: colors.text, fontSize: 13 },
  fieldLabel: { ...{} as any, fontSize: 11, letterSpacing: 1.5, color: colors.textSecondary, textTransform: "uppercase" as any, marginTop: space.md, marginBottom: 6 },
  fieldInput: {
    color: colors.text,
    fontSize: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingVertical: 10,
  },
  submitBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: space.xl,
    marginBottom: space.xl,
  },
  submitBtnText: { color: colors.textInverse, fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
});
