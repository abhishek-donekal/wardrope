import { useState } from "react";
import {
  Alert,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/contexts/AuthContext";
import { api } from "@/src/lib/api";
import { BRAND_ID_ENABLED } from "@/src/lib/featureFlags";
import { colors, type, space } from "@/src/theme";

const GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say"];
const LIFESTYLES = ["Classic", "Sporty", "Editorial", "Luxury-leaning", "Bohemian", "Minimalist"];
const STYLES = [
  "Evening events",
  "Workwear",
  "Casual weekends",
  "Athleisure",
  "Date nights",
  "Travel",
  "Vacation",
  "Parenting",
];
const FIDELITY = [
  { id: "descriptive", title: "Descriptive", subtitle: "Fast tagging. No external lookups." },
  { id: "identified", title: "Identified", subtitle: "Brand + product lookup when confident." },
];

// The fidelity step only offers a real choice once brand identification is live;
// until then onboarding ends at the style step.
const STEPS = BRAND_ID_ENABLED ? 5 : 4;
const LAST_STEP = STEPS - 1;

export default function Onboarding() {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [lifestyle, setLifestyle] = useState<string | null>(null);
  const [stylePrefs, setStylePrefs] = useState<string[]>([]);
  const [fidelity, setFidelity] = useState("descriptive");
  const [busy, setBusy] = useState(false);

  const toggle = (s: string) => {
    setStylePrefs((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  };

  // Convert MM/DD/YYYY display value to YYYY-MM-DD for the API
  const dobToISO = (mmddyyyy: string): string | null => {
    const nums = mmddyyyy.replace(/\D/g, "");
    if (nums.length < 8) return null;
    const mm = nums.slice(0, 2);
    const dd = nums.slice(2, 4);
    const yyyy = nums.slice(4, 8);
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatDob = (raw: string): string => {
    const nums = raw.replace(/\D/g, "").slice(0, 8);
    if (nums.length <= 2) return nums;
    if (nums.length <= 4) return `${nums.slice(0, 2)}/${nums.slice(2)}`;
    return `${nums.slice(0, 2)}/${nums.slice(2, 4)}/${nums.slice(4)}`;
  };

  const finish = async () => {
    setBusy(true);
    try {
      const res = await api<{ user: any }>("/users/me/profile", {
        method: "PUT",
        body: {
          dob: dobToISO(dob),
          gender,
          lifestyle,
          style_preferences: stylePrefs,
          fidelity_mode: fidelity,
          onboarding_complete: true,
        },
      });
      setUser(res.user);
      router.replace("/(tabs)/closet");
    } catch (e: any) {
      const msg = e?.message || "Could not save your preferences. Please try again.";
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(msg);
      } else {
        Alert.alert("Something went wrong", msg);
      }
      setBusy(false);
    }
  };

  const next = () => setStep((s) => Math.min(s + 1, LAST_STEP));
  const back = () => (step === 0 ? router.back() : setStep((s) => s - 1));

  return (
    <SafeAreaView style={styles.root} testID="onboarding-screen" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={back} testID="onboarding-back-btn">
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.progressRow}>
            {Array.from({ length: STEPS }, (_, i) => i).map((i) => (
              <View
                key={i}
                style={[styles.progressDot, { backgroundColor: i <= step ? colors.accent : colors.border }]}
              />
            ))}
          </View>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={type.overline}>Step {step + 1} of {STEPS}</Text>

          {step === 0 && (
            <View>
              <Text style={[type.h2, styles.title]}>Hi {user?.name?.split(" ")[0] || "there"} —</Text>
              <Text style={[type.h2, styles.title]}>when were you born?</Text>
              <Text style={[type.bodySm, styles.sub]}>
                We tailor your home feed to your age and lifestyle.
              </Text>
              <Text style={styles.label}>Date of birth</Text>
              <TextInput
                testID="onboarding-dob-input"
                value={dob}
                onChangeText={(t) => setDob(formatDob(t))}
                placeholder="MM/DD/YYYY"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                maxLength={10}
                style={styles.input}
              />
            </View>
          )}

          {step === 1 && (
            <View>
              <Text style={[type.h2, styles.title]}>How do you{"\n"}identify?</Text>
              <Text style={[type.bodySm, styles.sub]}>This helps refine stylist recommendations.</Text>
              <View style={styles.chipWrap}>
                {GENDERS.map((g) => {
                  const active = gender === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      testID={`onboarding-gender-${g.toLowerCase().replace(/\s/g, "-")}`}
                      onPress={() => setGender(g)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{g}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={[type.h2, styles.title]}>Your style{"\n"}leans toward...</Text>
              <Text style={[type.bodySm, styles.sub]}>Pick the closest match.</Text>
              <View style={styles.chipWrap}>
                {LIFESTYLES.map((l) => {
                  const active = lifestyle === l;
                  return (
                    <TouchableOpacity
                      key={l}
                      testID={`onboarding-lifestyle-${l.toLowerCase().replace(/[^a-z]/g, "-")}`}
                      onPress={() => setLifestyle(l)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{l}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={[type.h2, styles.title]}>What do you{"\n"}dress for?</Text>
              <Text style={[type.bodySm, styles.sub]}>Pick as many as you like.</Text>
              <View style={styles.chipWrap}>
                {STYLES.map((s) => {
                  const active = stylePrefs.includes(s);
                  return (
                    <TouchableOpacity
                      key={s}
                      testID={`onboarding-style-${s.toLowerCase().replace(/[^a-z]/g, "-")}`}
                      onPress={() => toggle(s)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {BRAND_ID_ENABLED && step === 4 && (
            <View>
              <Text style={[type.h2, styles.title]}>Cataloging{"\n"}fidelity</Text>
              <Text style={[type.bodySm, styles.sub]}>Choose how detailed your item info is. Switch later anytime.</Text>
              {FIDELITY.map((f) => {
                const active = fidelity === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    testID={`onboarding-fidelity-${f.id}`}
                    onPress={() => setFidelity(f.id)}
                    style={[styles.fidelityCard, active && styles.fidelityCardActive]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, { fontWeight: "700", color: active ? colors.accent : colors.text }]}>
                        {f.title}
                      </Text>
                      <Text style={[type.bodySm, { marginTop: 4 }]}>{f.subtitle}</Text>
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={22} color={colors.accent} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step < LAST_STEP ? (
            <TouchableOpacity testID="onboarding-next-btn" style={styles.primaryBtn} onPress={next}>
              <Text style={styles.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              testID="onboarding-finish-btn"
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              onPress={finish}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.primaryBtnText}>Enter your wardrobe</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
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
  },
  progressRow: { flexDirection: "row", gap: 6 },
  progressDot: { width: 24, height: 2 },
  scroll: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xxl },
  title: { marginTop: 8 },
  sub: { marginTop: space.sm, marginBottom: space.xl },
  label: { ...type.overline, fontSize: 11, marginBottom: 6 },
  input: {
    color: colors.text,
    fontSize: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: "rgba(197,160,89,0.12)" },
  chipText: { color: colors.text, fontSize: 14 },
  chipTextActive: { color: colors.accent, fontWeight: "600" },
  fidelityCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    marginBottom: 12,
    gap: 12,
  },
  fidelityCardActive: { borderColor: colors.accent, backgroundColor: colors.bgSecondary },
  footer: { padding: space.lg, borderTopWidth: 1, borderTopColor: colors.border },
  primaryBtn: { backgroundColor: colors.accent, paddingVertical: 16, alignItems: "center", borderRadius: 2 },
  primaryBtnText: { color: colors.textInverse, fontWeight: "700", letterSpacing: 1, fontSize: 14 },
});
