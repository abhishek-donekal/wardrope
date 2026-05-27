import { useState, useRef } from "react";
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

function formatPhone(raw: string): string {
  const nums = raw.replace(/\D/g, "").slice(0, 10);
  if (nums.length <= 3) return nums;
  if (nums.length <= 6) return `(${nums.slice(0, 3)}) ${nums.slice(3)}`;
  return `(${nums.slice(0, 3)}) ${nums.slice(3, 6)}-${nums.slice(6)}`;
}

export default function VerifyPhone() {
  const { user, setUser } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<"enter" | "verify">(user?.phone ? "verify" : "enter");
  const [phone, setPhone] = useState(user?.phone ? formatPhone(user.phone.replace("+1", "")) : "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const codeRef = useRef<TextInput>(null);

  const sendCode = async () => {
    const rawNums = phone.replace(/\D/g, "");
    if (rawNums.length < 10) {
      setErr("Enter a valid 10-digit US phone number");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await api("/auth/send-phone-code", {
        method: "POST",
        body: { phone: `+1${rawNums}` },
      });
      setStep("verify");
      setTimeout(() => codeRef.current?.focus(), 300);
    } catch (e: any) {
      setErr(e?.message || "Could not send code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (code.length !== CODE_LENGTH) {
      setErr("Enter the full 6-digit code");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const rawNums = phone.replace(/\D/g, "");
      const res = await api<{ ok: boolean; user: any }>("/auth/verify-phone", {
        method: "POST",
        body: { phone: `+1${rawNums}`, code: code.trim() },
      });
      setUser(res.user);
      router.replace("/onboarding");
    } catch (e: any) {
      setErr(e?.message || "Incorrect code — try again");
    } finally {
      setBusy(false);
    }
  };

  const skip = () => router.replace("/onboarding");

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.inner}>
          <View style={styles.iconWrap}>
            <Ionicons name="phone-portrait-outline" size={40} color={colors.accent} />
          </View>

          {step === "enter" ? (
            <>
              <Text style={[type.h2, { marginTop: space.md }]}>Add your phone</Text>
              <Text style={[type.bodySm, { marginTop: space.sm, textAlign: "center", maxWidth: 300 }]}>
                We'll send a one-time code to verify your number.
              </Text>

              {err ? <Text style={styles.err}>{err}</Text> : null}

              <Text style={[styles.label, { marginTop: space.xl }]}>US phone number</Text>
              <TextInput
                value={phone}
                onChangeText={(t) => setPhone(formatPhone(t))}
                placeholder="(555) 000-0000"
                placeholderTextColor={colors.textSecondary}
                keyboardType="phone-pad"
                style={styles.input}
              />

              <TouchableOpacity
                style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
                onPress={sendCode}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.primaryBtnText}>Send code</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[type.h2, { marginTop: space.md }]}>Enter the code</Text>
              <Text style={[type.bodySm, { marginTop: space.sm, textAlign: "center", maxWidth: 300 }]}>
                Sent via SMS to{"\n"}
                <Text style={{ color: colors.accent }}>{phone}</Text>
              </Text>

              {err ? <Text style={styles.err}>{err}</Text> : null}

              {/* Code boxes */}
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => codeRef.current?.focus()}
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
                  ref={codeRef}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, CODE_LENGTH))}
                  keyboardType="number-pad"
                  maxLength={CODE_LENGTH}
                  style={styles.hiddenInput}
                  autoFocus
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryBtn, (busy || code.length < CODE_LENGTH) && { opacity: 0.5 }]}
                onPress={verify}
                disabled={busy || code.length < CODE_LENGTH}
              >
                {busy ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.primaryBtnText}>Verify phone</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { setStep("enter"); setCode(""); setErr(null); }} style={styles.secondaryBtn}>
                <Text style={styles.secondaryText}>Change number</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={skip} style={styles.skipBtn}>
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
  label: { ...type.overline, fontSize: 11, marginBottom: 6, alignSelf: "flex-start", width: "100%" },
  input: {
    color: colors.text,
    fontSize: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    width: "100%",
    marginBottom: space.xl,
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
  hiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0 },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 2,
    width: "100%",
  },
  primaryBtnText: { color: colors.textInverse, fontWeight: "700", letterSpacing: 1, fontSize: 14 },
  secondaryBtn: { marginTop: space.md, padding: space.sm },
  secondaryText: { color: colors.textSecondary, fontSize: 14 },
  skipBtn: { marginTop: space.xl, padding: space.sm },
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
