import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { api } from "@/src/lib/api";
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

type Item = { item_id: string; name: string; image_base64: string; image_url?: string; tags: any };

/** Items uploaded to S3 carry image_url and no base64 — fall back so thumbs never render blank. */
function itemImageUri(it: Item): string | undefined {
  return it.image_url || (it.image_base64 ? `data:image/jpeg;base64,${it.image_base64}` : undefined);
}

export default function LookbookDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [lb, setLb] = useState<Lookbook | null>(null);
  const [recreating, setRecreating] = useState(false);
  const [recreated, setRecreated] = useState<{ title: string; description: string; items: Item[] } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ lookbook: Lookbook }>(`/lookbooks/${id}`);
        setLb(res.lookbook);
      } catch {}
    })();
  }, [id]);

  const recreate = async () => {
    setRecreating(true);
    try {
      const res = await api<{ message: string; outfit: { title: string; description: string; item_ids: string[] } | null }>(
        `/lookbooks/${id}/recreate`,
        { method: "POST" }
      );
      if (res.outfit) {
        const items = await api<{ items: Item[] }>("/items");
        const map: Record<string, Item> = {};
        items.items.forEach((i) => (map[i.item_id] = i));
        setRecreated({
          title: res.outfit.title,
          description: res.outfit.description,
          items: res.outfit.item_ids.map((id) => map[id]).filter(Boolean),
        });
      } else {
        setRecreated({ title: "Nothing matched", description: res.message, items: [] });
      }
    } catch (e: any) {
      setRecreated({ title: "Error", description: e?.message || "Try again later", items: [] });
    } finally {
      setRecreating(false);
    }
  };

  if (!lb) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root} testID="lookbook-detail-screen">
      <ImageBackground source={{ uri: lb.cover }} style={styles.hero}>
        <LinearGradient
          colors={["rgba(5,5,5,0.2)", "rgba(5,5,5,0.5)", colors.bg]}
          locations={[0, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.heroInner} edges={["top"]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="lookbook-back-btn">
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <Text style={[type.overline, { color: colors.accent }]}>{lb.credit}</Text>
          <Text style={[type.h1, { marginTop: 6 }]}>{lb.title}</Text>
          <Text style={[type.bodySm, { marginTop: 4 }]}>{lb.subtitle}</Text>
        </SafeAreaView>
      </ImageBackground>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[type.overline, { marginBottom: 8 }]}>Vibe</Text>
        <View style={styles.tagRow}>
          {lb.tags.map((t) => (
            <View key={t} style={styles.tag}>
              <Text style={styles.tagText}>{t}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          testID="lookbook-recreate-btn"
          style={[styles.recreateBtn, recreating && { opacity: 0.6 }]}
          onPress={recreate}
          disabled={recreating}
        >
          {recreating ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <>
              <Ionicons name="sparkles" size={16} color={colors.textInverse} />
              <Text style={styles.recreateBtnText}>Recreate from my closet</Text>
            </>
          )}
        </TouchableOpacity>

        {recreated ? (
          <View style={{ marginTop: space.xl }}>
            <Text style={[type.overline, { color: colors.accent }]}>Your version</Text>
            <Text style={[type.h3, { marginTop: 6 }]}>{recreated.title}</Text>
            <Text style={[type.bodySm, { marginTop: 4 }]}>{recreated.description}</Text>
            {recreated.items.length > 0 ? (
              <View style={styles.itemsRow}>
                {recreated.items.map((it) => (
                  <View key={it.item_id} style={styles.itemThumbWrap}>
                    <Image source={{ uri: itemImageUri(it) }} style={styles.itemThumb} />
                    <Text numberOfLines={2} style={styles.itemThumbLabel}>{it.name}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  hero: { height: 360, justifyContent: "flex-end" },
  heroInner: { paddingHorizontal: space.lg, paddingBottom: space.lg, flex: 1 },
  backBtn: {
    width: 40, height: 40, backgroundColor: "rgba(5,5,5,0.55)", borderRadius: 999,
    alignItems: "center", justifyContent: "center", marginTop: 8,
  },
  scroll: { padding: space.lg, paddingBottom: space.xxl },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: space.lg },
  tag: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  tagText: { color: colors.text, fontSize: 12, textTransform: "capitalize" },
  recreateBtn: {
    flexDirection: "row",
    backgroundColor: colors.accent,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: space.md,
  },
  recreateBtnText: { color: colors.textInverse, fontWeight: "700", letterSpacing: 0.5 },
  itemsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: space.md },
  itemThumbWrap: { width: "47%" },
  itemThumb: { width: "100%", aspectRatio: 0.9, backgroundColor: colors.bgSecondary },
  itemThumbLabel: { color: colors.text, fontSize: 12, marginTop: 6 },
});
