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
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { colors, type, space } from "@/src/theme";

const SWAP_COST = 500; // fallback only — the server sends points_cost (SWAP_CLAIM_COST)

type ListingItem = {
  item_id: string;
  name: string;
  image_base64: string;
  image_url?: string | null;
  tags: any;
  listing_status: string;
  brand?: string | null;
  owner_name?: string;
  points_cost?: number;
  listing_claimed?: boolean;
  claimed_by_me?: boolean;
  claimed_by_name?: string | null;
};

type ClaimResponse = {
  name: string;
  owner_name: string;
  points_spent: number;
  points_remaining: number;
};

function listingLabel(item: ListingItem): string {
  return item.name?.trim() || "this item";
}

function claimCost(item: ListingItem): number {
  if (item.listing_status === "donate") return 0;
  return item.points_cost ?? SWAP_COST;
}

/** Items uploaded to S3 carry image_url and no base64; the community view carries neither. */
function listingImageUri(it: ListingItem): string | undefined {
  return it.image_url || (it.image_base64 ? `data:image/jpeg;base64,${it.image_base64}` : undefined);
}

export default function Listings() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user, setUser } = useAuth();
  const [tab, setTab] = useState<"mine" | "community">("mine");
  const [mine, setMine] = useState<ListingItem[]>([]);
  const [community, setCommunity] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [myRes, comRes] = await Promise.all([
        api<{ items: ListingItem[] }>("/items/listings/mine"),
        api<{ items: ListingItem[] }>("/items/listings/community"),
      ]);
      setMine(myRes.items || []);
      setCommunity(comRes.items || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't load listings. Check your connection and try again.");
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const notify = (title: string, msg: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.alert(msg);
    } else {
      Alert.alert(title, msg);
    }
  };

  const claimItem = async (item: ListingItem) => {
    const isDonate = item.listing_status === "donate";
    const pts = claimCost(item);
    const userPts = user?.points ?? 0;

    const doClaim = async () => {
      setClaimingId(item.item_id);
      try {
        const res = await api<ClaimResponse>(`/items/listings/${item.item_id}/claim`, {
          method: "POST",
        });
        if (user) setUser({ ...user, points: res.points_remaining });
        // Re-read from the server so the card shows the state that was actually saved.
        await load();
        const spent = res.points_spent ? `${res.points_spent} pts were deducted. ` : "";
        notify(
          "Claimed",
          `You claimed "${res.name || listingLabel(item)}". ${spent}${res.owner_name} has been ` +
            `notified and will see your claim in their activity feed.`
        );
      } catch (e: any) {
        // A failed claim changes nothing server-side — reload so the card is accurate.
        await load();
        notify("Could not claim", e?.message || "Could not complete claim. Please try again.");
      } finally {
        setClaimingId(null);
      }
    };

    if (isDonate) {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        if (window.confirm(`Claim "${listingLabel(item)}" for free?`)) doClaim();
      } else {
        Alert.alert("Claim this item?", `"${listingLabel(item)}" is free to claim.`, [
          { text: "Cancel", style: "cancel" },
          { text: "Claim", onPress: doClaim },
        ]);
      }
    } else {
      if (userPts < pts) {
        notify("Not enough points", `You need ${pts} pts to claim this swap. You have ${userPts} pts.`);
        return;
      }
      if (Platform.OS === "web" && typeof window !== "undefined") {
        if (window.confirm(`Use ${pts} pts to claim "${listingLabel(item)}"? You have ${userPts} pts.`)) doClaim();
      } else {
        Alert.alert("Use points to swap?", `Use ${pts} pts to claim "${listingLabel(item)}"?\nYou have ${userPts} pts.`, [
          { text: "Cancel", style: "cancel" },
          { text: `Use ${pts} pts`, onPress: doClaim },
        ]);
      }
    }
  };

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
      ) : error && data.length === 0 ? (
        <View style={styles.center} testID="listings-error">
          <Ionicons name="alert-circle-outline" size={48} color={colors.accent} />
          <Text style={[type.body, { marginTop: space.md, textAlign: "center" }]}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRefresh} disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.retryBtnText}>Try again</Text>
            )}
          </TouchableOpacity>
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
          numColumns={width > 768 ? 4 : width > 480 ? 3 : 2}
          key={width > 768 ? "4" : width > 480 ? "3" : "2"}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: 12 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={<RefreshControl tintColor={colors.accent} refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const imageUri = listingImageUri(item);
            return (
            <TouchableOpacity
              style={styles.card}
              onPress={tab === "mine" ? () => router.push(`/item/${item.item_id}`) : undefined}
              activeOpacity={tab === "mine" ? 0.7 : 1}
            >
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.cardImg} />
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
                {tab === "mine" && item.listing_claimed ? (
                  <Text style={styles.cardClaimed} numberOfLines={1}>
                    {item.claimed_by_name ? `Claimed by ${item.claimed_by_name}` : "Claimed"}
                  </Text>
                ) : null}
                {tab === "community" ? (
                  <TouchableOpacity
                    style={[
                      styles.claimBtn,
                      item.listing_status === "donate" && styles.claimBtnFree,
                      item.listing_claimed && styles.claimBtnDone,
                    ]}
                    onPress={() => claimItem(item)}
                    disabled={claimingId === item.item_id || !!item.listing_claimed}
                  >
                    {claimingId === item.item_id ? (
                      <ActivityIndicator size="small" color={colors.textInverse} />
                    ) : (
                      <Text style={[styles.claimBtnText, item.listing_claimed && styles.claimBtnDoneText]}>
                        {item.listing_claimed
                          ? item.claimed_by_me
                            ? "Claimed by you"
                            : "Claimed"
                          : item.listing_status === "donate"
                            ? "Claim free"
                            : `${claimCost(item)} pts`}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            </TouchableOpacity>
            );
          }}
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
  cardClaimed: { color: colors.accent, fontSize: 11, marginTop: 4, fontWeight: "600" },
  claimBtn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    paddingVertical: 7,
    alignItems: "center",
    borderRadius: 2,
  },
  claimBtnFree: { backgroundColor: "rgba(197,160,89,0.6)" },
  claimBtnDone: { backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border },
  claimBtnText: { color: colors.textInverse, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  claimBtnDoneText: { color: colors.textSecondary },
  goClosetBtn: {
    marginTop: space.lg,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 2,
  },
  goClosetText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  retryBtn: {
    marginTop: space.lg,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
  },
  retryBtnText: { color: colors.text, fontSize: 13, letterSpacing: 0.5 },
});
