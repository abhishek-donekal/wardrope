import { useState } from "react";
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
  ImageBackground,
  Alert,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/contexts/AuthContext";
import { colors, type, space } from "@/src/theme";

export default function Login() {
  const { login, loginWithGoogle, enterDemoMode } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!email || !password) {
      setErr("Email and password required");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setErr(null);
    setBusy(true);
    try {
      await loginWithGoogle();
      router.replace("/");
    } catch (e: any) {
      if (e?.message && !e.message.includes("cancel")) {
        Alert.alert("Google sign-in", e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="login-screen">
      <ImageBackground
        source={{ uri: "https://images.pexels.com/photos/28263000/pexels-photo-28263000.jpeg" }}
        style={styles.hero}
      >
        <LinearGradient
          colors={["transparent", "rgba(5,5,5,0.4)", colors.bg]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.heroInner}>
          <Text style={type.overline}>What's In My</Text>
          <Text style={[type.h1, { marginTop: 6 }]}>Wardrobe</Text>
          <Text style={[type.bodySm, { marginTop: 8, maxWidth: 280 }]}>
            Your closet, catalogued. Your stylist, on call.
          </Text>
        </SafeAreaView>
      </ImageBackground>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheet}
      >
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={[type.h3, { marginBottom: space.lg }]}>Sign in</Text>

          {err ? (
            <Text style={styles.err} testID="login-error">
              {err}
            </Text>
          ) : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            testID="login-email-input"
            value={email}
            onChangeText={setEmail}
            placeholder="you@wardrobe.app"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: space.md }]}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              testID="login-password-input"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showPassword}
              style={[styles.input, { flex: 1 }]}
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            testID="login-submit-btn"
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.primaryBtnText}>Sign in</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity testID="login-google-btn" style={styles.googleBtn} onPress={google} disabled={busy}>
            <Ionicons name="logo-google" size={18} color={colors.text} />
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.demoBtn}
            onPress={() => {
              enterDemoMode();
              router.replace("/");
            }}
          >
            <Text style={styles.demoBtnText}>Preview Experience</Text>
            <Text style={styles.demoBtnSub}>No account needed</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={type.bodySm}>New here? </Text>
            <Link href="/auth/register" asChild>
              <TouchableOpacity testID="login-go-register">
                <Text style={[type.bodySm, { color: colors.accent }]}>Create an account</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { height: 320, justifyContent: "flex-end" },
  heroInner: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  sheet: { flex: 1 },
  form: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xxl },
  label: { ...type.overline, fontSize: 11, marginBottom: 6 },
  input: {
    color: colors.text,
    fontSize: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    fontFamily: type.body.fontFamily as string,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 2,
    marginTop: space.xl,
  },
  primaryBtnText: { color: colors.textInverse, fontWeight: "700", letterSpacing: 1, fontSize: 14 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: space.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...type.overline, marginHorizontal: 12 },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.text,
    borderRadius: 2,
    gap: 10,
  },
  googleBtnText: { color: colors.text, fontWeight: "600", letterSpacing: 0.5 },
  demoBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 2,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: space.md,
  },
  demoBtnText: { color: colors.accent, fontWeight: "600", fontSize: 15 },
  demoBtnSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: space.lg },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  eyeBtn: { padding: 10 },
  err: {
    color: "#FF7A7A",
    backgroundColor: "rgba(114, 47, 55, 0.25)",
    padding: 10,
    borderRadius: 2,
    marginBottom: space.md,
    fontSize: 13,
  },
});
