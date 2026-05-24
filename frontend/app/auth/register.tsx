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
} from "react-native";
import { useRouter, Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/contexts/AuthContext";
import { colors, type, space } from "@/src/theme";

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!email || !password || !name) {
      setErr("All fields required");
      return;
    }
    if (password.length < 6) {
      setErr("Password must be at least 6 characters");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await register(email.trim(), password, name.trim());
      router.replace("/onboarding");
    } catch (e: any) {
      setErr(e?.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} testID="register-screen" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
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
            placeholder="you@wardrobe.app"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: space.md }]}>Password</Text>
          <TextInput
            testID="register-password-input"
            value={password}
            onChangeText={setPassword}
            placeholder="6+ characters"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
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
  back: { paddingVertical: space.sm, marginBottom: space.md, marginLeft: -8 },
  label: { ...type.overline, fontSize: 11, marginBottom: 6 },
  input: {
    color: colors.text,
    fontSize: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 2,
    marginTop: space.xl,
  },
  primaryBtnText: { color: colors.textInverse, fontWeight: "700", letterSpacing: 1, fontSize: 14 },
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
