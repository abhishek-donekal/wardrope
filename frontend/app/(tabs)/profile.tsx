import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { colors, type, space } from "@/src/theme";

function pointsLevel(pts: number): string {
  if (pts >= 1000) return "Platinum";
  if (pts >= 500) return "Gold";
  if (pts >= 100) return "Silver";
  return "Bronze";
}

export default function Profile() {
  const { user, logout, setUser } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({ items: 0, outfits: 0 });

  const load = useCallback(async () => {
    try {
      const [it, of] = await Promise.all([
        api<{ items: any[] }>("/items"),
        api<{ outfits: any[] }>("/outfits"),
      ]);
      setStats({ items: it.items.length, outfits: of.outfits.length });
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleFidelity = async () => {
    const next = user?.fidelity_mode === "identified" ? "descriptive" : "identified";
    try {
      const res = await api<{ user: any }>("/users/me/profile", {
        method: "PUT",
        body: { fidelity_mode: next },
      });
      setUser(res.user);
    } catch {}
  };

  const onLogout = async () => {
    // Use native browser confirm on web (Alert.alert is unreliable in static Expo web builds)
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && !window.confirm("Sign out of Wardrope?")) return;
      await logout();
      router.replace("/auth/login");
      return;
    }
    Alert.alert("Sign out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/auth/login");
        },
      },
    ]);
  };

  return (
    <View style={styles.root} testID="profile-screen">
      <ImageBackground
        source={{ uri: "https://images.unsplash.com/photo-1672137233327-37b0c1049e77" }}
        style={styles.hero}
        imageStyle={{ opacity: 0.55 }}
      >
        <LinearGradient
          colors={["transparent", "rgba(5,5,5,0.6)", colors.bg]}
          locations={[0, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.heroInner} edges={["top"]}>
          <Text style={type.overline}>Your profile</Text>
          <Text style={[type.h1, { marginTop: 6 }]} numberOfLines={1}>
            {user?.name || "Wardrobe owner"}
          </Text>
          <Text style={[type.bodySm, { marginTop: 4 }]}>{user?.email}</Text>
        </SafeAreaView>
      </ImageBackground>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.statsRow}>
          <Stat label="Items" value={stats.items} />
          <View style={styles.statDivider} />
          <Stat label="Saved looks" value={stats.outfits} />
          <View style={styles.statDivider} />
          <Stat label="Plan" value={"Free"} />
        </View>

        {/* Points badge */}
        {user && (
          <View style={styles.pointsRow}>
            <Ionicons name="trophy-outline" size={16} color={colors.accent} />
            <Text style={styles.pointsText}>
              {user.points ?? 0} pts · {pointsLevel(user.points ?? 0)}
            </Text>
          </View>
        )}

        <Section title="Wardrobe">
          <Row
            icon="add-circle-outline"
            label="Catalog a new item"
            onPress={() => router.push("/add-item")}
            testID="profile-row-add-item"
          />
          <Row
            icon="images-outline"
            label="Scan camera roll"
            sub="Find outfits in your photos"
            onPress={() => router.push("/scan/camera-roll")}
            testID="profile-row-camera-roll"
          />
          <Row
            icon="swap-horizontal-outline"
            label="Donate & Swap"
            sub="List items for others"
            onPress={() => router.push("/listings")}
            testID="profile-row-listings"
          />
        </Section>

        <Section title="Personalization">
          <Row
            icon="pricetags-outline"
            label="Manage categories"
            sub="Add custom clothing categories"
            onPress={() => router.push("/manage-categories")}
            testID="profile-row-categories"
          />
          <Row
            icon="options-outline"
            label="Cataloging fidelity"
            sub={user?.fidelity_mode === "identified" ? "Identified · brand lookup (mocked)" : "Descriptive · fast tagging"}
            onPress={toggleFidelity}
            testID="profile-row-fidelity"
            chevron={false}
            trailing={
              <View style={[styles.toggle, user?.fidelity_mode === "identified" && styles.toggleOn]}>
                <View
                  style={[
                    styles.toggleKnob,
                    { left: user?.fidelity_mode === "identified" ? 22 : 2 },
                  ]}
                />
              </View>
            }
          />
        </Section>

        <Section title="Account">
          <Row
            icon="log-out-outline"
            label="Sign out"
            onPress={onLogout}
            testID="profile-logout-btn"
            danger
          />
        </Section>

        <Text style={styles.footer}>{"What's In My Wardrobe · v0.1"}</Text>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={[type.h3, { fontSize: 22 }]}>{value}</Text>
      <Text style={[type.overline, { fontSize: 10, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.xl }}>
      <Text style={[type.overline, { marginBottom: space.sm }]}>{title}</Text>
      <View style={styles.section}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  sub,
  onPress,
  testID,
  danger,
  chevron = true,
  trailing,
}: {
  icon: any;
  label: string;
  sub?: string;
  onPress?: () => void;
  testID?: string;
  danger?: boolean;
  chevron?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={20} color={danger ? "#FF7A7A" : colors.text} />
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={[styles.rowLabel, danger && { color: "#FF7A7A" }]}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {trailing}
      {chevron && !trailing ? <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { height: 240, justifyContent: "flex-end" },
  heroInner: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  scroll: { padding: space.lg, paddingBottom: 140 },
  statsRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.lg,
    backgroundColor: colors.bgSecondary,
  },
  statDivider: { width: 1, backgroundColor: colors.border },
  section: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.text, fontSize: 15 },
  rowSub: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  toggle: {
    width: 42,
    height: 22,
    backgroundColor: colors.border,
    borderRadius: 999,
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: colors.accent },
  toggleKnob: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  footer: { color: colors.textSecondary, textAlign: "center", marginTop: space.xxl, fontSize: 11 },
  pointsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: space.md,
    paddingHorizontal: 4,
  },
  pointsText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
});
