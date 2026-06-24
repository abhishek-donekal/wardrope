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
import { useTheme } from "@/src/contexts/ThemeContext";
import { useResponsive } from "@/src/hooks/use-responsive";
import { colors, type, space } from "@/src/theme";
import { THEME_MAP } from "@/src/themes/presets";

function pointsLevel(pts: number): string {
  if (pts >= 1000) return "Platinum";
  if (pts >= 500) return "Gold";
  if (pts >= 100) return "Silver";
  return "Bronze";
}

const PERSONA_META: Record<string, { name: string; emoji: string; tagline: string }> = {
  editor:   { name: "The Editor",     emoji: "👁",  tagline: "Sharp eye, impeccable taste" },
  architect:{ name: "The Architect",  emoji: "□",  tagline: "Minimalism as philosophy" },
  rebel:    { name: "The Rebel",      emoji: "⚡", tagline: "Fashion is never just clothes" },
  hype:     { name: "The Hype Maven", emoji: "◈",  tagline: "Where street meets suite" },
  goddess:  { name: "The Goddess",    emoji: "✦",  tagline: "More is always more" },
};

export default function Profile() {
  const { user, logout, setUser, isDemoMode, exitDemoMode } = useAuth();
  const { themeId } = useTheme();
  const { isTablet } = useResponsive();
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
      if (typeof window !== "undefined" && !window.confirm("Sign out of Wardrobe?")) return;
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

  const performAccountDeletion = async () => {
    try {
      await api("/users/me", { method: "DELETE" });
      await logout();
      router.replace("/auth/login");
    } catch (e: any) {
      const msg = e?.message || "Could not delete account. Please try again or contact support.";
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
    }
  };

  const onDeleteAccount = () => {
    const warning =
      "This will permanently delete your account, wardrobe items, outfits, and all associated data. This cannot be undone.";
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;
      if (!window.confirm(`${warning}\n\nDelete your account?`)) return;
      if (!window.confirm("Are you absolutely sure? This is your final confirmation.")) return;
      performAccountDeletion();
      return;
    }
    Alert.alert(
      "Delete account",
      warning,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Final confirmation",
              "Are you absolutely sure? This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Delete forever", style: "destructive", onPress: performAccountDeletion },
              ]
            );
          },
        },
      ]
    );
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

      <ScrollView contentContainerStyle={[styles.scroll, isTablet && styles.scrollTablet]}>
        {isDemoMode && (
          <View style={styles.demoBanner}>
            <Text style={styles.demoBannerTitle}>You're previewing Wardrobe</Text>
            <Text style={styles.demoBannerSub}>
              Sign in or create an account to save your wardrobe
            </Text>
            <TouchableOpacity
              style={styles.demoBannerBtn}
              onPress={async () => { await exitDemoMode(); router.replace("/auth/login"); }}
            >
              <Text style={styles.demoBannerBtnText}>Sign In or Create Account</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.statsRow}>
          <Stat label="Items" value={stats.items} />
          <View style={styles.statDivider} />
          <Stat label="Saved looks" value={stats.outfits} />
          <View style={styles.statDivider} />
          <Stat label="Plan" value={user?.plan_type === "free" || !user?.plan_type ? "Free" : (user.plan_type.charAt(0).toUpperCase() + user.plan_type.slice(1))} />
        </View>

        {/* Points badge */}
        {user && (
          <View style={styles.pointsRowWrap}>
            <View style={styles.pointsRow}>
              <Ionicons name="trophy-outline" size={16} color={colors.accent} />
              <Text style={styles.pointsText}>
                {user.points ?? 0} pts · {pointsLevel(user.points ?? 0)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.buyPtsBtn}
              onPress={() => router.push("/buy-points")}
            >
              <Ionicons name="add-circle-outline" size={14} color={colors.textInverse} />
              <Text style={styles.buyPtsBtnText}>Buy Points</Text>
            </TouchableOpacity>
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
            icon="barcode-outline"
            label="Scan barcode"
            sub="Auto-add clothing from its tag"
            onPress={() => router.push("/barcode-scan")}
            testID="profile-row-barcode-scan"
          />
          <Row
            icon="swap-horizontal-outline"
            label="Donate & Swap"
            sub="List items for others"
            onPress={() => router.push("/listings")}
            testID="profile-row-listings"
          />
          <Row
            icon="cube-outline"
            label="Virtual SWAP Box"
            sub="Browse and list items for points"
            onPress={() => router.push("/swapbox")}
            testID="profile-row-swapbox"
          />
          <Row
            icon="people-outline"
            label="Friends"
            sub="Connect with other Wardrobe users"
            onPress={() => router.push("/friends")}
            testID="profile-row-friends"
          />
          <Row
            icon="pulse-outline"
            label="Activity Feed"
            sub="See what your friends are wearing"
            onPress={() => router.push("/activity-feed")}
            testID="profile-row-activity-feed"
          />
          <Row
            icon="play-circle-outline"
            label="Vlog"
            sub="Style tips & inspiration"
            onPress={() => router.push("/vlog")}
            testID="profile-row-vlog"
          />
        </Section>

        <Section title="Personalization">
          <Row
            icon="color-palette-outline"
            label="Theme"
            sub={THEME_MAP[themeId]?.name ?? "Editorial"}
            onPress={() => router.push("/theme-picker")}
            testID="profile-row-theme"
          />
          <Row
            icon="sparkles-outline"
            label="Your stylist"
            sub={(() => {
              const p = PERSONA_META[user?.stylist_persona ?? "editor"];
              return p ? `${p.emoji}  ${p.name} — ${p.tagline}` : "Choose an AI persona";
            })()}
            onPress={() => router.push("/persona-picker")}
            testID="profile-row-persona"
          />
          <Row
            icon="albums-outline"
            label="Manage Closets"
            sub="Create and switch between closets"
            onPress={() => router.push("/closets")}
            testID="profile-row-closets"
          />
          <Row
            icon="pricetags-outline"
            label="Manage categories"
            sub="Add custom clothing categories"
            onPress={() => router.push("/manage-categories")}
            testID="profile-row-categories"
          />
          <Row
            icon="options-outline"
            label="Brand identification"
            sub="Coming soon — AI brand recognition"
            onPress={() => {}}
            testID="profile-row-fidelity"
            chevron={false}
            trailing={
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Soon</Text>
              </View>
            }
          />
        </Section>

        <Section title="Services">
          <Row
            icon="paw-outline"
            label="Find Groomer"
            sub="Pet grooming services near you"
            onPress={() => router.push("/grooming")}
            testID="profile-row-grooming"
          />
          <Row
            icon="filing-outline"
            label="Closet Organizers"
            sub="Professional organizers near you"
            onPress={() => router.push("/organizers")}
            testID="profile-row-organizers"
          />
          <Row
            icon="color-wand-outline"
            label="Dry Cleaners"
            sub="Schedule pickup, earn 50 pts"
            onPress={() => router.push("/drycleaners")}
            testID="profile-row-drycleaners"
          />
        </Section>

        <Section title="Account">
          <Row
            icon="gift-outline"
            label="Refer a friend"
            sub="Earn 200 pts per sign-up"
            onPress={() => router.push("/referral")}
            testID="profile-row-referral"
          />
          <Row
            icon="card-outline"
            label="Plan & Billing"
            sub={(() => {
              const planNames: Record<string, string> = { free: "Free", single: "Single", couples: "Couples", family: "Family" };
              const name = planNames[user?.plan_type ?? "free"] ?? "Free";
              if (user?.plan_type === "free") return "Upgrade for full access";
              const period = user?.plan_period === "annual" ? "· Annual" : "· Monthly";
              return `${name} ${period}`;
            })()}
            onPress={() => router.push("/subscription")}
            testID="profile-row-billing"
          />
          <Row
            icon="chatbubble-outline"
            label="Send feedback"
            sub="Bugs, suggestions, anything"
            onPress={() => router.push("/feedback")}
            testID="profile-row-feedback"
          />
          {!isDemoMode && (
            <Row
              icon="log-out-outline"
              label="Sign out"
              onPress={onLogout}
              testID="profile-logout-btn"
              danger
            />
          )}
          {!isDemoMode && (
            <Row
              icon="trash-outline"
              label="Delete account"
              sub="Permanently remove your account and data"
              onPress={onDeleteAccount}
              testID="profile-delete-account-btn"
              danger
            />
          )}
        </Section>

        <Text style={styles.footer}>{"Wardrobe · v1.0.0"}{"\n"}
          <Text
            style={[styles.footer, { color: colors.accent }]}
            onPress={() => router.push("/privacy-policy" as any)}
          >Privacy Policy</Text>
          {"  ·  "}
          <Text
            style={[styles.footer, { color: colors.accent }]}
            onPress={() => router.push("/terms" as any)}
          >Terms of Use</Text>
        </Text>
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
  scrollTablet: { width: "100%", maxWidth: 720, alignSelf: "center" },
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
  demoBanner: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 2,
    padding: space.lg,
    marginBottom: space.lg,
    alignItems: "center",
  },
  demoBannerTitle: { color: colors.accent, fontWeight: "700", fontSize: 14 },
  demoBannerSub: { color: colors.textSecondary, fontSize: 13, marginTop: 4, textAlign: "center" },
  demoBannerBtn: {
    backgroundColor: colors.accent,
    borderRadius: 2,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: space.md,
  },
  demoBannerBtnText: { color: colors.textInverse, fontWeight: "700", fontSize: 14 },
  footer: { color: colors.textSecondary, textAlign: "center", marginTop: space.xxl, fontSize: 11 },
  comingSoonBadge: {
    backgroundColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  comingSoonText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
  pointsRowWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.md,
    paddingHorizontal: 4,
  },
  pointsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pointsText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  buyPtsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accent,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 2,
  },
  buyPtsBtnText: { color: colors.textInverse, fontSize: 12, fontWeight: "700" },
});
