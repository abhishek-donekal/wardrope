import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
  ImageBackground,
  ScrollView,
  TextInput,
  Modal,
  useWindowDimensions,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { colors, type, space } from "@/src/theme";

type Item = {
  item_id: string;
  name: string;
  image_base64: string;
  image_url?: string;
  tags: {
    category?: string;
    color?: string;
    season?: string[];
    occasion?: string[];
    description?: string;
  };
  favorite?: boolean;
};

type Closet = {
  closet_id: string;
  name: string;
  is_default: boolean;
  item_count: number;
};

const DEFAULT_FILTERS = [
  { id: "all", label: "All" },
  { id: "tops", label: "Tops" },
  { id: "bottoms", label: "Bottoms" },
  { id: "dresses", label: "Dresses" },
  { id: "outerwear", label: "Outerwear" },
  { id: "shoes", label: "Shoes" },
  { id: "accessories", label: "Accessories" },
];

export default function Closet() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  useAuth(); // auth context required for API calls
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);

  // Closet state
  const [closets, setClosets] = useState<Closet[]>([]);
  const [selectedClosetId, setSelectedClosetId] = useState<string | null>(null);

  const filters = useMemo(() => {
    const custom = categories.filter(
      (c) => !DEFAULT_FILTERS.some((f) => f.id === c)
    );
    const customChips = custom.map((c) => ({
      id: c,
      label: c.charAt(0).toUpperCase() + c.slice(1),
    }));
    return [...DEFAULT_FILTERS, ...customChips];
  }, [categories]);

  const load = useCallback(async () => {
    try {
      const [closetRes, catRes] = await Promise.all([
        api<{ closets: Closet[] }>("/closets").catch(() => ({ closets: [] })),
        api<{ categories: string[] }>("/users/me/categories").catch(() => ({ categories: [] })),
      ]);

      const fetchedClosets = closetRes.closets || [];
      setClosets(fetchedClosets);

      // Set default selected closet on first load
      setSelectedClosetId((prev) => {
        if (prev) return prev;
        return fetchedClosets[0]?.closet_id ?? null;
      });

      setCategories(catRes.categories || []);
    } catch {
      // ignore
    }
  }, []);

  // Fetch items whenever selectedClosetId changes
  const loadItems = useCallback(async () => {
    try {
      const url = selectedClosetId
        ? `/items?closet_id=${encodeURIComponent(selectedClosetId)}`
        : "/items";
      const itemRes = await api<{ items: Item[] }>(url);
      setItems(itemRes.items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedClosetId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().then(() => loadItems());
    }, [load, loadItems])
  );

  // Reload items when selected closet changes (after initial load)
  useEffect(() => {
    if (!loading) {
      loadItems();
    }
  }, [selectedClosetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addCategory = async () => {
    const name = newCatName.trim().toLowerCase();
    if (!name) return;
    setAddingCat(true);
    try {
      await api("/users/me/categories", { method: "POST", body: { name } });
      setCategories((prev) => [...prev, name]);
      setNewCatName("");
      setShowAddCat(false);
    } catch {
      // ignore duplicate errors silently
    } finally {
      setAddingCat(false);
    }
  };

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.tags?.category === filter)),
    [items, filter]
  );

  const onRefresh = () => {
    setRefreshing(true);
    load().then(() => loadItems());
  };

  if (loading) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]} testID="closet-screen">
      <View style={styles.header}>
        <View>
          <Text style={type.overline}>Your wardrobe</Text>
          <Text style={[type.h2, { marginTop: 4 }]}>{items.length === 1 ? "1 piece" : `${items.length} pieces`}</Text>
        </View>
        <TouchableOpacity
          testID="closet-add-btn"
          style={styles.addBtn}
          onPress={() =>
            router.push(
              selectedClosetId
                ? `/add-item?closet_id=${encodeURIComponent(selectedClosetId)}`
                : "/add-item"
            )
          }
        >
          <Ionicons name="add" size={24} color={colors.textInverse} />
        </TouchableOpacity>
      </View>

      {/* Closet picker */}
      {closets.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.closetRow}
          contentContainerStyle={styles.closetRowContent}
        >
          {closets.map((c) => {
            const active = selectedClosetId === c.closet_id;
            return (
              <TouchableOpacity
                key={c.closet_id}
                testID={`closet-pill-${c.closet_id}`}
                onPress={() => setSelectedClosetId(c.closet_id)}
                style={[styles.closetPill, active && styles.closetPillActive]}
              >
                <Text style={[styles.closetPillText, active && styles.closetPillTextActive]}>
                  {c.name}
                </Text>
                {c.item_count > 0 && (
                  <Text style={[styles.closetPillCount, active && styles.closetPillCountActive]}>
                    {" "}{c.item_count}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
      >
        {filters.map((f) => {
          const active = filter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              testID={`closet-filter-${f.id}`}
              onPress={() => setFilter(f.id)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          testID="closet-filter-add"
          onPress={() => setShowAddCat(true)}
          style={[styles.filterChip, { borderStyle: "dashed" }]}
        >
          <Ionicons name="add" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
      </ScrollView>

      {/* Add category modal */}
      <Modal visible={showAddCat} transparent animationType="fade" onRequestClose={() => setShowAddCat(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={[type.overline, { marginBottom: space.md }]}>New Category</Text>
            <TextInput
              value={newCatName}
              onChangeText={setNewCatName}
              placeholder="e.g. Gym, Beach, Work"
              placeholderTextColor={colors.textSecondary}
              style={styles.modalInput}
              autoFocus
              onSubmitEditing={addCategory}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: space.md }}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setShowAddCat(false); setNewCatName(""); }}>
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, addingCat && { opacity: 0.5 }]} onPress={addCategory} disabled={addingCat}>
                <Text style={{ color: colors.textInverse, fontSize: 14, fontWeight: "700" }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {filtered.length === 0 ? (
        <Empty filter={filter} onAdd={() => router.push(
          selectedClosetId
            ? `/add-item?closet_id=${encodeURIComponent(selectedClosetId)}`
            : "/add-item"
        )} onScan={() => router.push("/barcode-scan")} />
      ) : (
        <FlatList
          data={filtered}
          numColumns={width > 768 ? 4 : width > 480 ? 3 : 2}
          key={width > 768 ? "4" : width > 480 ? "3" : "2"}
          keyExtractor={(it) => it.item_id}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={{ gap: 12 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={<RefreshControl tintColor={colors.accent} refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`closet-item-${item.item_id}`}
              style={styles.card}
              onPress={() => router.push(`/item/${item.item_id}`)}
            >
              <Image
                source={{ uri: item.image_url || (item.image_base64 ? `data:image/jpeg;base64,${item.image_base64}` : undefined) }}
                style={styles.cardImg}
              />
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.name || item.tags?.description || "Item"}
                </Text>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {[item.tags?.color, item.tags?.category].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Empty({ filter, onAdd, onScan }: { filter: string; onAdd: () => void; onScan: () => void }) {
  return (
    <ImageBackground
      source={{ uri: "https://images.unsplash.com/photo-1649361811423-a55616f7ab11" }}
      style={styles.empty}
      imageStyle={{ opacity: 0.35 }}
    >
      <LinearGradient colors={["rgba(5,5,5,0.2)", colors.bg]} locations={[0, 0.8]} style={StyleSheet.absoluteFill} />
      <View style={styles.emptyInner}>
        <Text style={type.overline}>Your closet awaits</Text>
        <Text style={[type.h2, { marginTop: 8, marginBottom: 8 }]}>
          {filter === "all" ? "Add your first piece" : "Nothing here yet"}
        </Text>
        <Text style={[type.bodySm, { marginBottom: space.xl, maxWidth: 280 }]}>
          Snap a photo and our AI will tag it instantly — no typing required.
        </Text>
        <TouchableOpacity testID="closet-empty-add-btn" style={styles.primaryBtn} onPress={onAdd}>
          <Ionicons name="camera-outline" size={18} color={colors.textInverse} />
          <Text style={styles.primaryBtnText}>Catalog an item</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="closet-empty-scan-btn" style={styles.secondaryBtn} onPress={onScan}>
          <Ionicons name="images-outline" size={18} color={colors.text} />
          <Text style={styles.secondaryBtnText}>Scan camera roll</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addBtn: {
    width: 44, height: 44, borderRadius: 2,
    backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center",
  },
  closetRow: { flexGrow: 0 },
  closetRowContent: {
    paddingHorizontal: space.lg,
    gap: 8,
    paddingBottom: space.sm,
  },
  closetPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 38,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.bgSecondary,
    overflow: "visible",
  },
  closetPillActive: {
    borderColor: colors.accent,
    backgroundColor: "rgba(197,160,89,0.15)",
  },
  closetPillText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  closetPillTextActive: { color: colors.accent },
  closetPillCount: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  closetPillCountActive: { color: colors.accent },
  filterRow: { flexGrow: 0 },
  filterRowContent: { paddingHorizontal: space.lg, gap: 8, paddingBottom: space.md },
  filterChip: {
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    overflow: "visible",
  },
  filterChipActive: { borderColor: colors.accent, backgroundColor: "rgba(197,160,89,0.12)" },
  filterText: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  filterTextActive: { color: colors.accent, fontWeight: "600" },
  gridContent: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: 120 },
  card: { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary },
  cardImg: { width: "100%", aspectRatio: 0.85, backgroundColor: colors.bgTertiary },
  cardInfo: { padding: 12 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  cardSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2, textTransform: "capitalize" },
  empty: { flex: 1, justifyContent: "flex-end" },
  emptyInner: { padding: space.lg, paddingBottom: 140 },
  primaryBtn: {
    flexDirection: "row",
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignSelf: "flex-start",
    gap: 8,
    alignItems: "center",
    borderRadius: 2,
  },
  primaryBtnText: { color: colors.textInverse, fontWeight: "700", letterSpacing: 0.5 },
  secondaryBtn: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignSelf: "flex-start",
    gap: 8,
    alignItems: "center",
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.text,
    marginTop: 12,
  },
  secondaryBtnText: { color: colors.text, fontWeight: "600", letterSpacing: 0.5 },
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
    width: "85%",
    maxWidth: 400,
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
