import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, type, space } from "@/src/theme";

const CATEGORIES = ["General", "Suggestion", "Bug"];

export default function Feedback() {
  const router = useRouter();
  const [category, setCategory] = useState("General");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!message.trim()) return;
    setBusy(true);
    try {
      await api("/feedback", { method: "POST", body: { message: message.trim(), category } });
      setDone(true);
    } catch {}
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[type.overline, { color: colors.text }]}>Feedback</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.success}>
          <Ionicons name="checkmark-circle-outline" size={56} color={colors.accent} />
          <Text style={[type.h2, { marginTop: space.md }]}>Thank you!</Text>
          <Text style={[type.bodySm, { color: colors.textSecondary, marginTop: 8, textAlign: "center", maxWidth: 260 }]}>
            Your feedback helps us build a better Wardrobe.
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]} testID="feedback-screen">
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} testID="feedback-back-btn">
          <Ionicons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type.overline, { color: colors.text }]}>Send Feedback</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[type.h2, { marginBottom: 8 }]}>What&apos;s on your mind?</Text>
        <Text style={[type.bodySm, { color: colors.textSecondary, marginBottom: space.xl }]}>
          Bug reports, suggestions, or just a note — we read everything.
        </Text>

        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c}
              testID={`feedback-cat-${c}`}
              style={[styles.chip, category === c && styles.chipActive]}
              onPress={() => setCategory(c)}
            >
              <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: space.lg }]}>Message</Text>
        <TextInput
          testID="feedback-message-input"
          value={message}
          onChangeText={setMessage}
          placeholder="Tell us anything..."
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          style={styles.textarea}
        />

        <TouchableOpacity
          testID="feedback-submit-btn"
          style={[styles.submitBtn, (!message.trim() || busy) && { opacity: 0.5 }]}
          onPress={submit}
          disabled={!message.trim() || busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.submitBtnText}>Send feedback</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  scroll: { padding: space.lg, paddingBottom: 120 },
  label: { color: colors.textSecondary, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 },
  chips: { flexDirection: "row", gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: "rgba(197,160,89,0.1)" },
  chipText: { color: colors.textSecondary, fontSize: 13 },
  chipTextActive: { color: colors.accent, fontWeight: "600" },
  textarea: {
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 14,
    minHeight: 140,
    lineHeight: 22,
  },
  submitBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: space.xl,
    borderRadius: 2,
  },
  submitBtnText: { color: colors.textInverse, fontWeight: "700", letterSpacing: 1, fontSize: 14 },
  success: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg },
  doneBtn: {
    marginTop: space.xl,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 2,
  },
  doneBtnText: { color: colors.textInverse, fontWeight: "700", fontSize: 14 },
});
