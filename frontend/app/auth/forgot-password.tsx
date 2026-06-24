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
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, type, space } from "@/src/theme";

type Step = "email" | "code" | "done";

export default function ForgotPassword() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const requestCode = async () => {
    if (!email.trim()) { setErr("Email is required"); return; }
    setErr(null);
    setBusy(true);
    try {
      await api("/auth/forgot-password", {
        method: "POST",
        body: { email: email.trim().toLowerCase() },
        auth: false,
      });
      setStep("code");
    } catch (e: any) {
      setErr(e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!code.trim()) { setErr("Enter the 6-digit code"); return; }
    if (newPassword.length < 6) { setErr("Password must be at least 6 characters"); return; }
    setErr(null);
    setBusy(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), code: code.trim(), new_password: newPassword },
        auth: false,
      });
      setStep("done");
    } catch (e: any) {
      setErr(e?.message || "Invalid or expired code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]} testID="forgot-password-screen">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="forgot-back-btn">
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={type.overline}>Account recovery</Text>
          <Text style={[type.h1, { marginTop: 6 }]}>Reset{"\n"}password</Text>

          {step === "done" ? (
            <View style={{ marginTop: space.xl }}>
              <Text style={[type.body, { color: colors.accent, marginBottom: space.lg }]}>
                Password updated. You can now sign in with your new password.
              </Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => router.replace("/auth/login")}
                testID="forgot-go-login-btn"
              >
                <Text style={styles.primaryBtnText}>Back to sign in</Text>
              </TouchableOpacity>
            </View>
          ) : step === "email" ? (
            <View style={{ marginTop: space.xl }}>
              <Text style={[type.bodySm, { color: colors.textSecondary, marginBottom: space.xl }]}>
                Enter your email address and we'll send a 6-digit code to reset your password.
              </Text>

              {err ? <Text style={styles.err}>{err}</Text> : null}

              <Text style={styles.label}>Email</Text>
              <TextInput
                testID="forgot-email-input"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
                onSubmitEditing={requestCode}
                returnKeyType="send"
              />

              <TouchableOpacity
                testID="forgot-send-code-btn"
                style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
                onPress={requestCode}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.primaryBtnText}>Send reset code</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ marginTop: space.xl }}>
              <Text style={[type.bodySm, { color: colors.textSecondary, marginBottom: space.xl }]}>
                Check your email for the 6-digit code, then choose a new password.
              </Text>

              {err ? <Text style={styles.err}>{err}</Text> : null}

              <Text style={styles.label}>6-digit code</Text>
              <TextInput
                testID="forgot-code-input"
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                maxLength={6}
                style={styles.input}
              />

              <Text style={[styles.label, { marginTop: space.md }]}>New password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  testID="forgot-new-password-input"
                  value={newPassword}
                  onChangeText={setNewPassword}
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

              <TouchableOpacity
                testID="forgot-reset-btn"
                style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
                onPress={resetPassword}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.primaryBtnText}>Set new password</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.resendBtn} onPress={() => { setStep("email"); setErr(null); }}>
                <Text style={styles.resendText}>Resend code</Text>
              </TouchableOpacity>
            </View>
          )}
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
  resendBtn: { paddingVertical: 14, alignItems: "center", marginTop: space.sm },
  resendText: { color: colors.textSecondary, fontSize: 13 },
  err: {
    color: "#FF7A7A",
    backgroundColor: "rgba(114, 47, 55, 0.25)",
    padding: 10,
    borderRadius: 2,
    marginBottom: space.md,
    fontSize: 13,
  },
});
