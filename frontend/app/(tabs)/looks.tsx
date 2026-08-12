import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ImageBackground,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { api } from "@/src/lib/api";
import { useResponsive } from "@/src/hooks/use-responsive";
import { colors, type, space } from "@/src/theme";

type Lookbook = {
  lookbook_id: string;
  title: string;
  subtitle: string;
  cover: string;
  vibe: string;
  tags: string[];
  credit: string;
};

type Outfit = {
  outfit_id: string;
  title: string;
  description: string;
  item_ids: string[];
  occasion: string;
  favorite: boolean;
  rating?: number | null;
  created_at: string;
};

type Item = {
  item_id: string;
  image_base64: string;
  image_url?: string;
};

/** Items uploaded to S3 carry image_url and no base64 — fall back so thumbs never render blank. */
function itemImageUri(it: Item): string | undefined {
  return it.image_url || (it.image_base64 ? `data:image/jpeg;base64,${it.image_base64}` : undefined);
}

export default function Looks() {
  const router = useRouter();
  const { isTablet, sidePad } = useResponsive();
  const [tab, setTab] = useState<"trends" | "saved">("trends");
  const [lookbooks, setLookbooks] = useState<Lookbook[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [items, setItems] = useState<Record<string, Item>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [lb, of, it] = await Promise.all([
        api<{ lookbooks: Lookbook[] }>("/lookbooks"),
        api<{ outfits: Outfit[] }>("/outfits"),
        api<{ items: Item[] }>("/items"),
      ]);
      setLookbooks(lb.lookbooks || []);
      setOutfits(of.outfits || []);
      const map: Record<string, Item> = {};
      (it.items || []).forEach((i) => (map[i.item_id] = i));
      setItems(map);
      setError(null);
    } catch (e: any) {
      // keep whatever was loaded before, but say so rather than showing a blank tab
      setError(e?.message || "Couldn't load your looks. Tap to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rateOutfit = async (outfitId: string, rating: number) => {
    try {
      await api(`/outfits/${outfitId}/rating`, { method: "PATCH", body: { rating } });
      setOutfits((prev) =>
        prev.map((o) => (o.outfit_id === outfitId ? { ...o, rating } : o))
      );
    } catch {}
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]} testID="looks-screen">
      <View style={styles.header}>
        <Text style={type.overline}>Lookbook</Text>
        <Text style={[type.h2, { marginTop: 4 }]}>This week's looks</Text>

        <View style={styles.tabRow}>
          <TouchableOpacity
            testID="looks-tab-trends"
            onPress={() => setTab("trends")}
            style={[styles.tab, tab === "trends" && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === "trends" && styles.tabTextActive]}>Trends</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="looks-tab-saved"
            onPress={() => setTab("saved")}
            style={[styles.tab, tab === "saved" && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === "saved" && styles.tabTextActive]}>
              Saved ({outfits.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : tab === "trends" ? (
        <ScrollView contentContainerStyle={[styles.scroll, isTablet && { paddingHorizontal: space.lg + sidePad }]} showsVerticalScrollIndicator={false}>
          {error ? (
            <TouchableOpacity style={styles.errorBox} onPress={load} testID="looks-error">
              <Text style={[type.bodySm, { textAlign: "center" }]}>{error}</Text>
              <Text style={[type.overline, { color: colors.accent, marginTop: 8 }]}>Tap to retry</Text>
            </TouchableOpacity>
          ) : null}
          {lookbooks.map((lb) => (
            <TouchableOpacity
              key={lb.lookbook_id}
              testID={`lookbook-${lb.lookbook_id}`}
              style={styles.lookCard}
              onPress={() => router.push(`/lookbook/${lb.lookbook_id}`)}
              activeOpacity={0.85}
            >
              <ImageBackground source={{ uri: lb.cover }} style={styles.lookImage} imageStyle={styles.lookImageInner}>
                <LinearGradient
                  colors={["transparent", "rgba(5,5,5,0.85)"]}
                  locations={[0.4, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.lookOverlay}>
                  <Text style={styles.lookCredit}>{lb.credit}</Text>
                  <Text style={styles.lookTitle}>{lb.title}</Text>
                  <Text style={styles.lookSubtitle}>{lb.subtitle}</Text>
                  <View style={styles.lookCta}>
                    <Ionicons name="sparkles" size={14} color={colors.accent} />
                    <Text style={styles.lookCtaText}>Recreate from your closet</Text>
                  </View>
                </View>
              </ImageBackground>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, isTablet && { paddingHorizontal: space.lg + sidePad }]} showsVerticalScrollIndicator={false}>
          {error ? (
            <TouchableOpacity style={styles.errorBox} onPress={load} testID="looks-error-saved">
              <Text style={[type.bodySm, { textAlign: "center" }]}>{error}</Text>
              <Text style={[type.overline, { color: colors.accent, marginTop: 8 }]}>Tap to retry</Text>
            </TouchableOpacity>
          ) : null}
          {outfits.length === 0 && !error ? (
            <View style={styles.savedEmpty}>
              <Text style={type.overline}>Nothing saved yet</Text>
              <Text style={[type.bodySm, { marginTop: 8 }]}>
                Ask the Stylist for looks, then tap “Save look”.
              </Text>
            </View>
          ) : (
            outfits.map((o) => (
              <View key={o.outfit_id} style={styles.savedCard} testID={`saved-outfit-${o.outfit_id}`}>
                <View style={styles.savedThumbs}>
                  {o.item_ids.slice(0, 4).map((id) => {
                    const it = items[id];
                    const uri = it ? itemImageUri(it) : undefined;
                    if (!uri) return null;
                    return <Image key={id} source={{ uri }} style={styles.savedThumb} />;
                  })}
                </View>
                <View style={{ padding: 14 }}>
                  <Text style={styles.savedTitle}>{o.title}</Text>
                  <Text style={styles.savedDesc} numberOfLines={2}>
                    {o.description}
                  </Text>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity
                        key={star}
                        onPress={() => rateOutfit(o.outfit_id, star)}
                        testID={`outfit-star-${o.outfit_id}-${star}`}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                      >
                        <Ionicons
                          name={star <= (o.rating ?? 0) ? "star" : "star-outline"}
                          size={16}
                          color={star <= (o.rating ?? 0) ? "#C5A059" : colors.textSecondary}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  tabRow: { flexDirection: "row", gap: 8, marginTop: space.md },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 2 },
  tabActive: { borderColor: colors.accent, backgroundColor: "rgba(197,160,89,0.12)" },
  tabText: { color: colors.textSecondary, fontSize: 12, letterSpacing: 0.5 },
  tabTextActive: { color: colors.accent, fontWeight: "600" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: space.lg, paddingBottom: 140, gap: 16 },
  lookCard: { borderWidth: 1, borderColor: colors.border, marginBottom: 4, alignSelf: "stretch" },
  lookImage: { width: "100%", aspectRatio: 0.72, justifyContent: "flex-end" },
  lookImageInner: {},
  lookOverlay: { padding: space.lg, paddingBottom: space.xl },
  lookCredit: { ...type.overline, fontSize: 10, color: colors.accent },
  lookTitle: { ...type.h2, marginTop: 6 },
  lookSubtitle: { ...type.bodySm, marginTop: 4 },
  lookCta: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: space.md },
  lookCtaText: { color: colors.accent, fontSize: 13, fontWeight: "600", letterSpacing: 0.5 },
  savedEmpty: { paddingVertical: space.xxl, alignItems: "center" },
  errorBox: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
    padding: space.lg,
    alignItems: "center",
  },
  savedCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
    marginBottom: 12,
  },
  savedThumbs: { flexDirection: "row", flexWrap: "wrap", padding: 4, backgroundColor: colors.bgTertiary },
  savedThumb: { width: "25%", aspectRatio: 1, padding: 2 },
  savedTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  savedDesc: { color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 18 },
  starsRow: { flexDirection: "row", gap: 4, marginTop: 8 },
});
