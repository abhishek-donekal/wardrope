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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, type, space } from "@/src/theme";

type ListingItem = {
  item_id: string;
  name: string;
  image_base64: string;
  tags: any;
  listing_status: string;
  brand?: string | null;
  owner_name?: string;
};

export default function Listings() {
  const router = useRouter();
  const [tab, setTab] = useState<"mine" | "community">("mine");
  const [mine, setMine] = useState<ListingItem[]>([]);
  const [community, setCommunity] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [myRes, comRes] = await Promise.all([
        api<{ items: ListingItem[] }>("/items/listings/mine"),
        api<{ items: ListingItem[] }>("/items/listings/community"),
      ]);
      setMine(myRes.items || []);
      setCommunity(comRes.items || []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const data = tab === "mine" ? mine : community;

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type.overline, { color: colors.text }]}>Donate &amp; Swap</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "mine" && styles.tabBtnActive]}
          onPress={() => setTab("mine")}
        >
          <Text style={[styles.tabText, tab === "mine" && styles.tabTextActive]}>My Listings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "community" && styles.tabBtnActive]}
          onPress={() => setTab("community")}
        >
          <Text style={[styles.tabText, tab === "community" && styles.tabTextActive]}>Community</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="swap-horizontal-outline" size={48} color={colors.textSecondary} />
          <Text style={[type.body, { marginTop: space.md, textAlign: "center" }]}>
            {tab === "mine"
              ? "No listings yet.\nOpen an item and tap Donate or Swap."
              : "No community listings yet."}
          </Text>
          {tab === "mine" ? (
            <TouchableOpacity
              style={styles.goClosetBtn}
              onPress={() => router.push("/(tabs)/closet")}
            >
              <Text style={styles.goClosetText}>Go to closet</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(it) => it.item_id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: 12 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={<RefreshControl tintColor={colors.accent} refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={tab === "mine" ? () => router.push(`/item/${item.item_id}`) : undefined}
              activeOpacity={tab === "mine" ? 0.7 : 1}
            >
              {item.image_base64 ? (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${item.image_base64}` }}
                  style={styles.cardImg}
                />
              ) : (
                <View style={[styles.cardImg, styles.cardImgPlaceholder]}>
                  <Ionicons name="shirt-outline" size={32} color={colors.textSecondary} />
                </View>
              )}
              <View style={styles.cardInfo}>
                <View style={[styles.badge, item.listing_status === "donate" ? styles.badgeDonate : styles.badgeSwap]}>
                  <Text style={styles.badgeText}>
                    {item.listing_status === "donate" ? "Donate" : "Swap"}
                  </Text>
                </View>
                <Text style={styles.cardName} numberOfLines={1}>{item.name || "Item"}</Text>
                {item.brand ? <Text style={styles.cardBrand} numberOfLines={1}>{item.brand}</Text> : null}
                {tab === "community" && item.owner_name ? (
                  <Text style={styles.cardOwner}>{item.owner_name}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg },
  grid: { padding: space.lg, paddingBottom: 120 },
  card: { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary },
  cardImg: { width: "100%", aspectRatio: 0.85, backgroundColor: colors.bgTertiary },
  cardImgPlaceholder: { alignItems: "center", justifyContent: "center" },
  cardInfo: { padding: 10 },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
    marginBottom: 6,
  },
  badgeDonate: { backgroundColor: "rgba(197,160,89,0.2)" },
  badgeSwap: { backgroundColor: "rgba(100,160,197,0.2)" },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, color: colors.text, textTransform: "uppercase" },
  cardName: { color: colors.text, fontSize: 13, fontWeight: "600" },
  cardBrand: { color: colors.accent, fontSize: 11, marginTop: 2 },
  cardOwner: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  goClosetBtn: {
    marginTop: space.lg,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 2,
  },
  goClosetText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
});
