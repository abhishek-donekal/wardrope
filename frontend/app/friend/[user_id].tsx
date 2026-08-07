import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, type as type_, space } from "@/src/theme";

type SharedCloset = {
  closet_id: string;
  name: string;
};

type OutfitCard = {
  outfit_id: string;
  title?: string;
  occasion?: string;
};

type FriendProfile = {
  user_id: string;
  name: string;
  points?: number;
  level?: string;
  shared_closets?: SharedCloset[];
  looks?: OutfitCard[];
};

function pointsLevel(pts: number): string {
  if (pts >= 1000) return "Platinum";
  if (pts >= 500) return "Gold";
  if (pts >= 100) return "Silver";
  return "Bronze";
}

function Avatar({ name, size = 64 }: { name: string; size?: number }) {
  const letter = name?.trim()?.[0]?.toUpperCase() ?? "?";
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{letter}</Text>
    </View>
  );
}

export default function FriendProfile() {
  const router = useRouter();
  const { user_id } = useLocalSearchParams<{ user_id: string }>();
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user_id) return;
    setError(null);
    try {
      const res = await api<{
        friend: { user_id: string; name: string; picture?: string | null; points?: number };
        shared_closets?: SharedCloset[];
        public_looks?: OutfitCard[];
      }>(`/friends/${user_id}/profile`);
      setProfile(
        res.friend
          ? { ...res.friend, shared_closets: res.shared_closets ?? [], looks: res.public_looks ?? [] }
          : null
      );
    } catch (e: any) {
      setError(e?.message || "Could not load profile.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const pts = profile?.points ?? 0;
  const level = profile?.level ?? pointsLevel(pts);

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type_.overline, { color: colors.text }]}>Friend Profile</Text>
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
      ) : !profile ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary }}>Profile not found.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl tintColor={colors.accent} refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Profile header */}
          <View style={styles.profileHeader}>
            <Avatar name={profile.name} size={72} />
            <View style={{ marginTop: space.md, alignItems: "center" }}>
              <Text style={[type_.h3, { textAlign: "center" }]}>{profile.name}</Text>
              <View style={styles.levelRow}>
                <Ionicons name="trophy-outline" size={14} color={colors.accent} />
                <Text style={styles.levelText}>{pts} pts · {level}</Text>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeText}>{level}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Shared Closets */}
          <Text style={[type_.overline, { marginBottom: space.sm, marginTop: space.xl }]}>Shared Closets</Text>
          {(profile.shared_closets ?? []).length === 0 ? (
            <View style={styles.emptySection}>
              <Ionicons name="albums-outline" size={28} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No shared closets yet.</Text>
            </View>
          ) : (
            <View style={styles.section}>
              {(profile.shared_closets ?? []).map((cl) => (
                <View key={cl.closet_id} style={styles.sectionRow}>
                  <Ionicons name="albums-outline" size={18} color={colors.accent} />
                  <Text style={styles.sectionRowText}>{cl.name}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Their Looks */}
          <Text style={[type_.overline, { marginBottom: space.sm, marginTop: space.xl }]}>Their Looks</Text>
          {(profile.looks ?? []).length === 0 ? (
            <View style={styles.emptySection}>
              <Ionicons name="images-outline" size={28} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No saved looks yet.</Text>
            </View>
          ) : (
            <View style={styles.looksGrid}>
              {(profile.looks ?? []).map((look) => (
                <View key={look.outfit_id} style={styles.lookCard}>
                  <Ionicons name="color-palette-outline" size={20} color={colors.accent} />
                  <Text style={styles.lookTitle} numberOfLines={1}>{look.title || "Untitled look"}</Text>
                  {look.occasion ? (
                    <Text style={styles.lookOccasion} numberOfLines={1}>{look.occasion}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
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
  scroll: { padding: space.lg, paddingBottom: 100 },
  profileHeader: {
    alignItems: "center",
    paddingVertical: space.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  avatar: {
    backgroundColor: colors.bgTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.accent, fontWeight: "700" },
  levelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  levelText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  levelBadge: {
    backgroundColor: "rgba(197,160,89,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
    marginLeft: 4,
  },
  levelBadgeText: { color: colors.accent, fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  section: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sectionRowText: { color: colors.text, fontSize: 14 },
  emptySection: {
    alignItems: "center",
    paddingVertical: space.xl,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  emptyText: { color: colors.textSecondary, fontSize: 13 },
  looksGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  lookCard: {
    flex: 1,
    minWidth: "44%",
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: 6,
  },
  lookTitle: { color: colors.text, fontSize: 13, fontWeight: "600" },
  lookOccasion: { color: colors.textSecondary, fontSize: 11, textTransform: "capitalize" },
  retryBtn: { marginTop: space.lg, borderWidth: 1, borderColor: colors.accent, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
});
