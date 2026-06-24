import { Platform, Alert } from "react-native";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { colors, type, space } from "@/src/theme";

export default function Vlog() {
  const router = useRouter();

  const notifyMe = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.alert("You're on the list! We'll let you know when videos drop.");
    } else {
      Alert.alert("You're on the list!", "We'll let you know when videos drop.");
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]} testID="vlog-screen">
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} testID="vlog-back-btn">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type.overline, { color: colors.text }]}>Vlog</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.body}>
        <LinearGradient
          colors={["rgba(197,160,89,0.12)", "transparent"]}
          style={styles.iconBg}
        >
          <Ionicons name="play-circle-outline" size={72} color={colors.accent} />
        </LinearGradient>

        <Text style={[type.overline, { marginTop: space.xl, marginBottom: 8 }]}>Coming soon</Text>
        <Text style={[type.h2, { textAlign: "center", marginBottom: 12 }]}>Watch &amp; Style</Text>
        <Text style={[type.bodySm, { color: colors.textSecondary, textAlign: "center", maxWidth: 300, lineHeight: 22 }]}>
          Style tips, outfit breakdowns, and behind-the-scenes looks from the world of fashion — all curated for your wardrobe.
        </Text>

        <TouchableOpacity style={styles.notifyBtn} onPress={notifyMe} testID="vlog-notify-btn">
          <Ionicons name="notifications-outline" size={18} color={colors.textInverse} />
          <Text style={styles.notifyBtnText}>Notify me when it drops</Text>
        </TouchableOpacity>

        <View style={styles.tagRow}>
          {["Style Tips", "Designer Interviews", "Outfit Breakdowns", "Trend Reports"].map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
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
  iconBg: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  notifyBtn: {
    flexDirection: "row",
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: "center",
    gap: 10,
    borderRadius: 2,
    marginTop: space.xl,
    marginBottom: space.lg,
  },
  notifyBtnText: { color: colors.textInverse, fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
  },
  tagText: { color: colors.textSecondary, fontSize: 11, letterSpacing: 0.5 },
});
