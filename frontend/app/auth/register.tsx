import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useRouter, Link, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/contexts/AuthContext";
import { useResponsive } from "@/src/hooks/use-responsive";
import { colors, type, space } from "@/src/theme";

function formatPhone(raw: string): string {
  const nums = raw.replace(/\D/g, "").slice(0, 10);
  if (nums.length <= 3) return nums;
  if (nums.length <= 6) return `(${nums.slice(0, 3)}) ${nums.slice(3)}`;
  return `(${nums.slice(0, 3)}) ${nums.slice(3, 6)}-${nums.slice(6)}`;
}

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const { isTablet } = useResponsive();
  const params = useLocalSearchParams<{ ref?: string }>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(params.ref ? params.ref.toUpperCase() : "");

  useEffect(() => {
    if (params.ref) setReferralCode(params.ref.toUpperCase());
  }, [params.ref]);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!email || !password || !name) {
      setErr("Name, email and password are required");
      return;
    }
    if (password.length < 6) {
      setErr("Password must be at least 6 characters");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      // Strip formatting from phone before sending
      const rawPhone = phone.replace(/\D/g, "");
      await register(email.trim(), password, name.trim(), rawPhone ? `+1${rawPhone}` : undefined, referralCode.trim() || undefined);
      // Navigate to email verification — backend already sent the code
      router.replace("/auth/verify-email");
    } catch (e: any) {
      setErr(e?.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} testID="register-screen" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.form, isTablet && styles.formTablet]} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="register-back-btn">
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={type.overline}>Step 1 of 2</Text>
          <Text style={[type.h1, { marginTop: 6 }]}>Create{"\n"}your closet</Text>
          <Text style={[type.bodySm, { marginTop: space.sm, marginBottom: space.xl }]}>
            A few quick details, then we'll catalog your wardrobe.
          </Text>

          {err ? (
            <Text style={styles.err} testID="register-error">
              {err}
            </Text>
          ) : null}

          <Text style={styles.label}>Name</Text>
          <TextInput
            testID="register-name-input"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: space.md }]}>Email</Text>
          <TextInput
            testID="register-email-input"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: space.md }]}>Phone number <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            testID="register-phone-input"
            value={phone}
            onChangeText={(t) => setPhone(formatPhone(t))}
            placeholder="(555) 000-0000"
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: space.md }]}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              testID="register-password-input"
              value={password}
              onChangeText={setPassword}
              placeholder="6+ characters"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showPassword}
              style={[styles.input, { flex: 1, borderBottomWidth: 0 }]}
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { marginTop: space.md }]}>Referral code <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            testID="register-referral-input"
            value={referralCode}
            onChangeText={(t) => setReferralCode(t.toUpperCase())}
            placeholder="e.g. AB3X9KTZ"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
            style={styles.input}
          />

          <TouchableOpacity
            testID="register-submit-btn"
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.primaryBtnText}>Continue</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.legal}>
            By continuing you agree to our{" "}
            <Text style={styles.legalLink} onPress={() => router.push("/terms" as any)}>Terms of Use</Text>
            {" "}and{" "}
            <Text style={styles.legalLink} onPress={() => router.push("/privacy-policy" as any)}>Privacy Policy</Text>.
          </Text>

          <View style={styles.footer}>
            <Text style={type.bodySm}>Already have an account? </Text>
            <Link href="/auth/login" asChild>
              <TouchableOpacity testID="register-go-login">
                <Text style={[type.bodySm, { color: colors.accent }]}>Sign in</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  form: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  formTablet: { width: "100%", maxWidth: 480, alignSelf: "center" },
  back: { paddingVertical: space.sm, marginBottom: space.md, marginLeft: -8 },
  label: { ...type.overline, fontSize: 11, marginBottom: 6 },
  optional: { color: colors.textSecondary, fontWeight: "400", letterSpacing: 0 },
  input: {
    color: colors.text,
    fontSize: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  eyeBtn: { padding: 10 },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 2,
    marginTop: space.xl,
  },
  primaryBtnText: { color: colors.textInverse, fontWeight: "700", letterSpacing: 1, fontSize: 14 },
  legal: { color: colors.textSecondary, fontSize: 12, textAlign: "center", marginTop: space.lg, lineHeight: 18 },
  legalLink: { color: colors.accent, fontWeight: "600" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: space.lg },
  err: {
    color: "#FF7A7A",
    backgroundColor: "rgba(114, 47, 55, 0.25)",
    padding: 10,
    borderRadius: 2,
    marginBottom: space.md,
    fontSize: 13,
  },
});
