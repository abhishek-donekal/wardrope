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
  tags: {
    category?: string;
    color?: string;
    season?: string[];
    occasion?: string[];
    description?: string;
  };
  favorite?: boolean;
};

const FILTERS = [
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
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: Item[] }>("/items");
      setItems(res.items);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.tags?.category === filter)),
    [items, filter]
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
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
          onPress={() => router.push("/add-item")}
        >
          <Ionicons name="add" size={24} color={colors.textInverse} />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
      >
        {FILTERS.map((f) => {
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
      </ScrollView>

      {filtered.length === 0 ? (
        <Empty filter={filter} onAdd={() => router.push("/add-item")} onScan={() => router.push("/scan/camera-roll")} />
      ) : (
        <FlatList
          data={filtered}
          numColumns={2}
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
                source={{ uri: `data:image/jpeg;base64,${item.image_base64}` }}
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
  filterRow: { flexGrow: 0 },
  filterRowContent: { paddingHorizontal: space.lg, gap: 8, paddingBottom: space.md },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
  },
  filterChipActive: { borderColor: colors.accent, backgroundColor: "rgba(197,160,89,0.12)" },
  filterText: { color: colors.textSecondary, fontSize: 12, letterSpacing: 0.5 },
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
});
