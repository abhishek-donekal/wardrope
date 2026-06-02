import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/contexts/AuthContext";
import { api } from "@/src/lib/api";
import { colors, type, space } from "@/src/theme";

const CODE_LENGTH = 6;

export default function VerifyEmail() {
  const { user, setUser } = useAuth();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<TextInput>(null);

  // Countdown for resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async () => {
    if (code.length !== CODE_LENGTH) {
      setErr("Enter the full 6-digit code");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; user: any }>("/auth/verify-email", {
        method: "POST",
        body: { email: user?.email, code: code.trim() },
      });
      setUser(res.user);
      if (res.user.phone) {
        router.replace("/auth/verify-phone");
      } else {
        router.replace("/onboarding");
      }
    } catch (e: any) {
      setErr(e?.message || "Incorrect code — try again");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setErr(null);
    try {
      await api("/auth/resend-email-code", { method: "POST" });
      setCooldown(60);
    } catch (e: any) {
      setErr(e?.message || "Could not resend code");
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.inner}>
          {/* Header */}
          <View style={styles.iconWrap}>
            <Ionicons name="mail-outline" size={40} color={colors.accent} />
          </View>
          <Text style={[type.h2, { marginTop: space.md }]}>Check your email</Text>
          <Text style={[type.bodySm, { marginTop: space.sm, textAlign: "center", maxWidth: 300 }]}>
            We sent a 6-digit code to{"\n"}
            <Text style={{ color: colors.accent }}>{user?.email}</Text>
          </Text>

          {err ? <Text style={styles.err}>{err}</Text> : null}

          {/* Code input */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => inputRef.current?.focus()}
            style={styles.codeWrap}
          >
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.codeBox,
                  code.length === i && styles.codeBoxActive,
                  code[i] ? styles.codeBoxFilled : null,
                ]}
              >
                <Text style={styles.codeChar}>{code[i] || ""}</Text>
              </View>
            ))}
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={(t) => {
                const nums = t.replace(/\D/g, "").slice(0, CODE_LENGTH);
                setCode(nums);
              }}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              style={styles.hiddenInput}
              autoFocus
            />
          </TouchableOpacity>

          {/* Verify button */}
          <TouchableOpacity
            style={[styles.primaryBtn, (busy || code.length < CODE_LENGTH) && { opacity: 0.5 }]}
            onPress={submit}
            disabled={busy || code.length < CODE_LENGTH}
          >
            {busy ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.primaryBtnText}>Verify email</Text>
            )}
          </TouchableOpacity>

          {/* Resend */}
          <TouchableOpacity onPress={resend} disabled={cooldown > 0 || resending} style={styles.resendBtn}>
            {resending ? (
              <ActivityIndicator color={colors.textSecondary} size="small" />
            ) : (
              <Text style={[styles.resendText, cooldown > 0 && { color: colors.textSecondary }]}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace(user?.phone ? "/auth/verify-phone" : "/onboarding")}
            style={styles.skipBtn}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(197,160,89,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  codeWrap: {
    flexDirection: "row",
    gap: 10,
    marginTop: space.xl,
    marginBottom: space.xl,
    position: "relative",
  },
  codeBox: {
    width: 44,
    height: 54,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSecondary,
  },
  codeBoxActive: { borderColor: colors.accent },
  codeBoxFilled: { borderColor: colors.accent, backgroundColor: "rgba(197,160,89,0.08)" },
  codeChar: { fontSize: 22, fontWeight: "700", color: colors.text },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 2,
    width: "100%",
  },
  primaryBtnText: { color: colors.textInverse, fontWeight: "700", letterSpacing: 1, fontSize: 14 },
  resendBtn: { marginTop: space.lg, padding: space.sm },
  resendText: { color: colors.accent, fontSize: 14 },
  skipBtn: { marginTop: space.md, padding: space.sm },
  skipText: { color: colors.textSecondary, fontSize: 13, textDecorationLine: "underline" },
  err: {
    color: "#FF7A7A",
    backgroundColor: "rgba(114,47,55,0.25)",
    padding: 10,
    borderRadius: 2,
    marginTop: space.md,
    fontSize: 13,
    textAlign: "center",
    width: "100%",
  },
});
