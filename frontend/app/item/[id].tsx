import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, type, space } from "@/src/theme";

type Item = {
  item_id: string;
  name: string;
  image_base64: string;
  tags: any;
  favorite: boolean;
  brand?: string | null;
  listing_status?: string | null;
};

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api<{ item: Item }>(`/items/${id}`);
      setItem(res.item);
    } catch {}
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFav = async () => {
    if (!item) return;
    const next = !item.favorite;
    setItem({ ...item, favorite: next });
    try {
      await api(`/items/${item.item_id}`, { method: "PUT", body: { favorite: next } });
    } catch {}
  };

  const onDelete = () => {
    if (Platform.OS === "web") {
      if (!window.confirm("Delete this item? This cannot be undone.")) return;
      api(`/items/${id}`, { method: "DELETE" }).then(() => router.back()).catch(() => {});
      return;
    }
    Alert.alert("Delete item", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/items/${id}`, { method: "DELETE" });
            router.back();
          } catch {}
        },
      },
    ]);
  };

  const setListing = async (status: string | null) => {
    if (!item) return;
    try {
      const res = await api<{ item: Item }>(`/items/${item.item_id}/listing`, {
        method: "PATCH",
        body: { status },
      });
      setItem(res.item);
    } catch {}
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!item) {
    return (
      <View style={styles.loading}>
        <Text style={type.body}>Item not found.</Text>
      </View>
    );
  }

  const t = item.tags || {};

  return (
    <View style={styles.root} testID="item-detail-screen">
      <Image
        source={{ uri: `data:image/jpeg;base64,${item.image_base64}` }}
        style={styles.image}
      />
      <SafeAreaView style={styles.topOverlay} edges={["top"]} pointerEvents="box-none">
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="item-back-btn">
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleFav} style={styles.iconBtn} testID="item-fav-btn">
            <Ionicons
              name={item.favorite ? "heart" : "heart-outline"}
              size={22}
              color={item.favorite ? colors.accent : colors.text}
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        <Text style={type.overline}>{t.category || "Item"}</Text>
        <Text style={[type.h2, { marginTop: 4 }]}>{item.name || t.description}</Text>
        {item.brand ? (
          <Text style={styles.brandText}>{item.brand}</Text>
        ) : null}

        <View style={styles.tagsRow}>
          {t.color ? <Pill text={t.color} /> : null}
          {t.pattern ? <Pill text={t.pattern} /> : null}
          {t.material ? <Pill text={t.material} /> : null}
          {t.formality ? <Pill text={t.formality} /> : null}
        </View>

        {t.season?.length ? (
          <Section label="Season">
            <Text style={styles.line}>{t.season.join(" · ")}</Text>
          </Section>
        ) : null}
        {t.occasion?.length ? (
          <Section label="Occasion">
            <Text style={styles.line}>{t.occasion.join(" · ")}</Text>
          </Section>
        ) : null}

        {/* Donate / Swap listing */}
        <Section label="List this item">
          {!item.listing_status ? (
            <View style={styles.listingRow}>
              <TouchableOpacity
                testID="item-donate-btn"
                style={styles.listingBtn}
                onPress={() => setListing("donate")}
              >
                <Ionicons name="heart-outline" size={16} color={colors.text} />
                <Text style={styles.listingBtnText}>Donate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="item-swap-btn"
                style={styles.listingBtn}
                onPress={() => setListing("swap")}
              >
                <Ionicons name="swap-horizontal-outline" size={16} color={colors.text} />
                <Text style={styles.listingBtnText}>Swap</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.listingActiveRow}>
              <View style={[styles.listingBadge, item.listing_status === "donate" ? styles.badgeDonate : styles.badgeSwap]}>
                <Text style={styles.listingBadgeText}>
                  {item.listing_status === "donate" ? "Listed for Donate" : "Listed for Swap"}
                </Text>
              </View>
              <TouchableOpacity
                testID="item-remove-listing-btn"
                onPress={() => setListing(null)}
                style={styles.removeListing}
              >
                <Text style={styles.removeListingText}>Remove listing</Text>
              </TouchableOpacity>
            </View>
          )}
        </Section>

        <TouchableOpacity testID="item-delete-btn" style={styles.deleteBtn} onPress={onDelete}>
          <Ionicons name="trash-outline" size={16} color={"#FF7A7A"} />
          <Text style={styles.deleteText}>Delete item</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{text}</Text>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.lg }}>
      <Text style={[type.overline, { marginBottom: 6 }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "55%", backgroundColor: colors.bgSecondary },
  topOverlay: { position: "absolute", top: 0, left: 0, right: 0 },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    backgroundColor: "rgba(5,5,5,0.55)",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: { flex: 1, marginTop: -24, backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetContent: { padding: space.lg, paddingBottom: space.xxl },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: space.md },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 2,
  },
  pillText: { color: colors.text, fontSize: 12, textTransform: "capitalize" },
  line: { color: colors.text, fontSize: 14, textTransform: "capitalize" },
  deleteBtn: {
    marginTop: space.xxl,
    flexDirection: "row",
    gap: 8,
    paddingVertical: 14,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#722F37",
  },
  deleteText: { color: "#FF7A7A", fontSize: 13, letterSpacing: 0.5 },
  brandText: { color: colors.accent, fontSize: 13, marginTop: 4, letterSpacing: 0.5 },
  listingRow: { flexDirection: "row", gap: 10 },
  listingBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
  },
  listingBtnText: { color: colors.text, fontSize: 14 },
  listingActiveRow: { gap: 8 },
  listingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 2,
    alignSelf: "flex-start",
  },
  badgeDonate: { backgroundColor: "rgba(197,160,89,0.15)", borderWidth: 1, borderColor: colors.accent },
  badgeSwap: { backgroundColor: "rgba(100,160,197,0.15)", borderWidth: 1, borderColor: "#64A0C5" },
  listingBadgeText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  removeListing: { paddingVertical: 4 },
  removeListingText: { color: colors.textSecondary, fontSize: 12, textDecorationLine: "underline" },
});
