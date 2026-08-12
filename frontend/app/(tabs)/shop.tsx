import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { useResponsive } from "@/src/hooks/use-responsive";
import { colors, type, space } from "@/src/theme";

type Suggestion = {
  gap_title: string;
  description: string;
  search_term: string;
  store: string;
  store_search_url: string;
};

const STORE_ICONS: Record<string, string> = {
  "H&M": "shirt-outline",
  Zara: "bag-outline",
  ASOS: "storefront-outline",
  Nordstrom: "diamond-outline",
  Uniqlo: "layers-outline",
};

export default function Shop() {
  const { isTablet } = useResponsive();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const res = await api<{ suggestions: Suggestion[]; cached: boolean }>(
        "/users/me/suggestions" + (force ? "?refresh=1" : "")
      );
      setSuggestions(res.suggestions || []);
      setCached(res.cached ?? false);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your suggestions. Pull down to retry.");
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = () => {
    setRefreshing(true);
    load(true);
  };

  const openStore = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]} testID="shop-screen">
      <View style={styles.header}>
        <View>
          <Text style={type.overline}>Style intelligence</Text>
          <Text style={[type.h2, { marginTop: 4 }]}>For You</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={refresh} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Ionicons name="refresh-outline" size={20} color={colors.text} />
          )}
        </TouchableOpacity>
      </View>

      {cached ? (
        <Text style={styles.cachedNote}>Suggestions refreshed daily · tap ↻ to update now</Text>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[type.bodySm, { marginTop: space.md }]}>Analysing your wardrobe…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, isTablet && styles.scrollTablet]}
          refreshControl={<RefreshControl tintColor={colors.accent} refreshing={refreshing} onRefresh={refresh} />}
        >
          <Text style={[type.bodySm, styles.intro]}>
            Based on your wardrobe, these are your biggest style gaps. Tap a card to shop the look.
          </Text>

          {error ? (
            <View style={styles.errorBox} testID="shop-error">
              <Ionicons name="alert-circle-outline" size={18} color={colors.accent} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={refresh} disabled={refreshing}>
                <Text style={styles.retryBtnText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {suggestions.map((s, idx) => (
            <View key={idx} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.storeIcon}>
                  <Ionicons
                    name={(STORE_ICONS[s.store] || "bag-outline") as any}
                    size={18}
                    color={colors.accent}
                  />
                </View>
                <Text style={styles.storeName}>{s.store}</Text>
              </View>
              <Text style={styles.gapTitle}>{s.gap_title}</Text>
              <Text style={styles.gapDesc}>{s.description}</Text>
              <TouchableOpacity
                style={styles.shopBtn}
                onPress={() => openStore(s.store_search_url)}
              >
                <Ionicons name="open-outline" size={14} color={colors.textInverse} />
                <Text style={styles.shopBtnText}>Shop {s.store}</Text>
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.disclaimer}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.disclaimerText}>
              Suggestions are AI-generated based on your closet. Links open partner store search pages.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
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
  refreshBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
  },
  cachedNote: {
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: "center",
    paddingBottom: 6,
    paddingHorizontal: space.lg,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: space.lg, paddingBottom: 120 },
  scrollTablet: { width: "100%", maxWidth: 720, alignSelf: "center" },
  intro: {
    color: colors.textSecondary,
    marginBottom: space.lg,
    lineHeight: 20,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
    padding: space.lg,
    marginBottom: 12,
    borderRadius: 2,
  },
  errorBox: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
    padding: space.lg,
    marginBottom: 12,
    borderRadius: 2,
    alignItems: "center",
    gap: 8,
  },
  errorText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center" },
  retryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 2,
  },
  retryBtnText: { color: colors.text, fontSize: 12, letterSpacing: 0.5 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: space.sm },
  storeIcon: {
    width: 32,
    height: 32,
    borderRadius: 2,
    backgroundColor: "rgba(197,160,89,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  storeName: { color: colors.textSecondary, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: "600" },
  gapTitle: { color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: 6 },
  gapDesc: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: space.md },
  shopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
    borderRadius: 2,
  },
  shopBtnText: { color: colors.textInverse, fontWeight: "700", fontSize: 13, letterSpacing: 0.5 },
  disclaimer: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  disclaimerText: { flex: 1, color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
});
