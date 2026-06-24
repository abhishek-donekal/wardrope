import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, type, space } from "@/src/theme";

type ReferralData = {
  code: string;
  referral_url: string;
  total_referrals: number;
};

export default function Referral() {
  const router = useRouter();
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<ReferralData>("/users/me/referral");
      setData(res);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shareCode = async () => {
    if (!data) return;
    const message = `Join me on Wardrobe — the AI-powered wardrobe app. Use my referral code ${data.code} when signing up and we both get rewards! ${data.referral_url}`;
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(data.referral_url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } else {
        await Share.share({ message, url: data.referral_url });
      }
    } catch {}
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]} testID="referral-screen">
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} testID="referral-back-btn">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type.overline, { color: colors.text }]}>Refer a Friend</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.body}>
        <Ionicons name="gift-outline" size={52} color={colors.accent} style={{ marginBottom: space.lg }} />
        <Text style={type.h2}>Share the wardrobe</Text>
        <Text style={[type.bodySm, { marginTop: 8, marginBottom: space.xl, color: colors.textSecondary, textAlign: "center", maxWidth: 280 }]}>
          For every friend who signs up using your code, you earn 200 points.
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : data ? (
          <>
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>Your referral code</Text>
              <Text style={styles.code}>{data.code}</Text>
            </View>

            <TouchableOpacity style={styles.shareBtn} onPress={shareCode}>
              <Ionicons name={copied ? "checkmark-outline" : "share-outline"} size={18} color={colors.textInverse} />
              <Text style={styles.shareBtnText}>{copied ? "Link copied!" : "Share your code"}</Text>
            </TouchableOpacity>

            <View style={styles.statsRow}>
              <Ionicons name="people-outline" size={16} color={colors.accent} />
              <Text style={styles.statsText}>
                {data.total_referrals === 0
                  ? "No referrals yet — be the first to share!"
                  : `${data.total_referrals} friend${data.total_referrals === 1 ? "" : "s"} joined · ${data.total_referrals * 200} pts earned`}
              </Text>
            </View>
          </>
        ) : (
          <Text style={{ color: colors.textSecondary }}>Could not load referral code.</Text>
        )}
      </View>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg },
  codeBox: {
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: "rgba(197,160,89,0.07)",
    paddingHorizontal: 40,
    paddingVertical: 20,
    alignItems: "center",
    marginBottom: space.lg,
  },
  codeLabel: { color: colors.textSecondary, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 },
  code: { color: colors.accent, fontSize: 28, fontWeight: "800", letterSpacing: 6 },
  shareBtn: {
    flexDirection: "row",
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: "center",
    gap: 10,
    borderRadius: 2,
    marginBottom: space.lg,
  },
  shareBtnText: { color: colors.textInverse, fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statsText: { color: colors.textSecondary, fontSize: 13 },
});
