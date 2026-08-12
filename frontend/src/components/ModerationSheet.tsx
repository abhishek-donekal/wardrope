import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, type as type_, space } from "@/src/theme";

export type ModerationTarget = {
  /** What is being reported — matches the backend's report target types. */
  type: "listing" | "swap_box" | "user";
  id: string;
  label: string;
  userId?: string;
  userName?: string;
};

type Props = {
  target: ModerationTarget | null;
  onClose: () => void;
  /** Called after a report or block succeeds so the caller can reload its list. */
  onDone?: (action: "report" | "block") => void;
};

function notify(title: string, msg: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(msg);
  } else {
    Alert.alert(title, msg);
  }
}

/** Report objectionable content or block the account behind it (guideline 1.2). */
export function ModerationSheet({ target, onClose, onDone }: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"report" | "block" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);

  if (!target) return null;

  const who = target.userName || "this account";

  const close = () => {
    setReason("");
    setError(null);
    setBusy(null);
    setConfirmBlock(false);
    onClose();
  };

  const submitReport = async () => {
    setBusy("report");
    setError(null);
    try {
      await api("/report", {
        method: "POST",
        body: { target_type: target.type, target_id: target.id, reason: reason.trim() },
      });
      close();
      notify("Reported", "Thanks — our team will review this, and it's been hidden from your feed.");
      onDone?.("report");
    } catch (e: any) {
      setError(e?.message || "Could not send the report. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const blockUser = async () => {
    if (!target.userId) return;
    setBusy("block");
    setError(null);
    try {
      const res = await api<{ blocked_name?: string }>("/blocks", {
        method: "POST",
        body: { user_id: target.userId },
      });
      close();
      notify(
        "Account blocked",
        `${res.blocked_name || who} is blocked. You won't see each other's listings or activity. ` +
          "Undo it under Profile → Blocked accounts."
      );
      onDone?.("block");
    } catch (e: any) {
      setError(e?.message || "Could not block this account. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={[type_.overline, { color: colors.text }]}>Report or block</Text>
            <TouchableOpacity onPress={close} testID="moderation-close">
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subject} numberOfLines={2}>{target.label}</Text>
          <Text style={styles.help}>
            Reporting sends this to our team for review and hides it from your feed straight away.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="What's wrong with it? (optional)"
            placeholderTextColor={colors.textSecondary}
            value={reason}
            onChangeText={setReason}
            maxLength={500}
            multiline
            testID="moderation-reason"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, busy !== null && { opacity: 0.6 }]}
            onPress={submitReport}
            disabled={busy !== null}
            testID="moderation-report-btn"
          >
            {busy === "report" ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={styles.primaryBtnText}>Submit report</Text>
            )}
          </TouchableOpacity>

          {target.userId ? (
            confirmBlock ? (
              <TouchableOpacity
                style={[styles.dangerBtn, busy !== null && { opacity: 0.6 }]}
                onPress={blockUser}
                disabled={busy !== null}
                testID="moderation-block-confirm"
              >
                {busy === "block" ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Text style={styles.dangerBtnText}>
                    Yes, block {who} — you'll stop seeing each other
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.dangerBtn}
                onPress={() => setConfirmBlock(true)}
                testID="moderation-block-btn"
              >
                <Text style={styles.dangerBtnText}>Block {who}</Text>
              </TouchableOpacity>
            )
          ) : null}

          <TouchableOpacity style={styles.cancelBtn} onPress={close}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: space.lg,
    paddingBottom: space.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space.md,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subject: { color: colors.text, fontSize: 15, fontWeight: "600" },
  help: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  input: {
    color: colors.text,
    fontSize: 14,
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgTertiary,
    padding: 12,
    marginTop: space.md,
    textAlignVertical: "top",
  },
  error: { color: colors.danger, fontSize: 12, marginTop: space.sm },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: space.md,
  },
  primaryBtnText: { color: colors.textInverse, fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
  dangerBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: 13,
    paddingHorizontal: 12,
    alignItems: "center",
    marginTop: space.sm,
  },
  dangerBtnText: { color: colors.danger, fontWeight: "600", fontSize: 13, textAlign: "center" },
  cancelBtn: { paddingVertical: 14, alignItems: "center" },
  cancelText: { color: colors.textSecondary, fontSize: 13 },
});
