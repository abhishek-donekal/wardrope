import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Modal,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, type as type_, space } from "@/src/theme";

type FriendRequest = {
  request_id: string;
  from_user_id: string;
  from_name: string;
  from_email?: string;
};

type Friend = {
  user_id: string;
  name: string;
  email?: string;
  points?: number;
};

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const letter = name?.trim()?.[0]?.toUpperCase() ?? "?";
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{letter}</Text>
    </View>
  );
}

export default function Friends() {
  const router = useRouter();
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addFeedback, setAddFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [reqRes, frRes] = await Promise.all([
        api<{ requests: FriendRequest[] }>("/friends/requests"),
        api<{ friends: Friend[] }>("/friends"),
      ]);
      setRequests(reqRes.requests || []);
      setFriends(frRes.friends || []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const respond = async (req: FriendRequest, action: "accept" | "reject") => {
    setRespondingId(req.request_id + action);
    try {
      await api(`/friends/request/${req.request_id}/respond`, {
        method: "POST",
        body: { action },
      });
      setRequests((prev) => prev.filter((r) => r.request_id !== req.request_id));
      if (action === "accept") load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not process request.");
    } finally {
      setRespondingId(null);
    }
  };

  const removeFriend = async (friend: Friend) => {
    const doRemove = async () => {
      try {
        await api(`/friends/${friend.user_id}`, { method: "DELETE" });
        setFriends((prev) => prev.filter((f) => f.user_id !== friend.user_id));
      } catch (e: any) {
        Alert.alert("Error", e?.message || "Could not remove friend.");
      }
    };
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm(`Remove ${friend.name} from your friends?`)) doRemove();
    } else {
      Alert.alert("Remove friend?", `Remove ${friend.name} from your friends?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: doRemove },
      ]);
    }
  };

  const sendRequest = async () => {
    if (!addEmail.trim()) return;
    setAddBusy(true);
    setAddFeedback(null);
    try {
      await api("/friends/request", {
        method: "POST",
        body: { email: addEmail.trim() },
      });
      setAddFeedback({ ok: true, msg: "Friend request sent!" });
      setAddEmail("");
    } catch (e: any) {
      setAddFeedback({ ok: false, msg: e?.message || "Could not send request." });
    } finally {
      setAddBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type_.overline, { color: colors.text }]}>Friends</Text>
        <TouchableOpacity onPress={() => { setAddModalOpen(true); setAddFeedback(null); setAddEmail(""); }}>
          <Ionicons name="person-add-outline" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl tintColor={colors.accent} refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Pending Requests */}
          {requests.length > 0 && (
            <View style={{ marginBottom: space.xl }}>
              <Text style={[type_.overline, { marginBottom: space.sm }]}>
                Pending Requests ({requests.length})
              </Text>
              <View style={styles.section}>
                {requests.map((req) => (
                  <View key={req.request_id} style={styles.requestRow}>
                    <Avatar name={req.from_name} size={38} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.friendName}>{req.from_name}</Text>
                      {req.from_email ? <Text style={styles.friendSub}>{req.from_email}</Text> : null}
                    </View>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => respond(req, "accept")}
                      disabled={respondingId != null}
                    >
                      {respondingId === req.request_id + "accept" ? (
                        <ActivityIndicator size="small" color={colors.textInverse} />
                      ) : (
                        <Text style={styles.acceptBtnText}>Accept</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => respond(req, "reject")}
                      disabled={respondingId != null}
                    >
                      {respondingId === req.request_id + "reject" ? (
                        <ActivityIndicator size="small" color={colors.text} />
                      ) : (
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Friends List */}
          <Text style={[type_.overline, { marginBottom: space.sm }]}>
            My Friends {friends.length > 0 ? `(${friends.length})` : ""}
          </Text>
          {friends.length === 0 ? (
            <View style={styles.emptySection}>
              <Ionicons name="people-outline" size={36} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No friends yet.{"\n"}Add a friend to get started.</Text>
            </View>
          ) : (
            <View style={styles.section}>
              {friends.map((friend) => (
                <TouchableOpacity
                  key={friend.user_id}
                  style={styles.friendRow}
                  onPress={() => router.push(`/friend/${friend.user_id}`)}
                  onLongPress={() => removeFriend(friend)}
                >
                  <Avatar name={friend.name} size={44} />
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={styles.friendName}>{friend.name}</Text>
                    {friend.points != null ? (
                      <Text style={styles.friendSub}>{friend.points} pts</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Add Friend Modal */}
      <Modal
        visible={addModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAddModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[type_.overline, { color: colors.text }]}>Add a Friend</Text>
              <TouchableOpacity onPress={() => setAddModalOpen(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>Email address</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="friend@example.com"
              placeholderTextColor={colors.textSecondary}
              value={addEmail}
              onChangeText={setAddEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {addFeedback && (
              <View style={[styles.feedbackBanner, addFeedback.ok ? styles.feedbackOk : styles.feedbackErr]}>
                <Text style={[styles.feedbackText, { color: addFeedback.ok ? colors.accent : "#FF7A7A" }]}>
                  {addFeedback.msg}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.sendBtn, addBusy && { opacity: 0.6 }]}
              onPress={sendRequest}
              disabled={addBusy}
            >
              {addBusy ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.sendBtnText}>Send Request</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: space.lg, paddingBottom: 100 },
  section: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 8,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    backgroundColor: colors.bgTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.accent, fontWeight: "700" },
  friendName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  friendSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  acceptBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginLeft: 8,
  },
  acceptBtnText: { color: colors.textInverse, fontSize: 12, fontWeight: "700" },
  rejectBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginLeft: 6,
  },
  rejectBtnText: { color: colors.textSecondary, fontSize: 12 },
  emptySection: { alignItems: "center", paddingVertical: space.xxl, gap: 12 },
  emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: "center", lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: space.lg,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space.md,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fieldLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: space.sm,
  },
  fieldInput: {
    color: colors.text,
    fontSize: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingVertical: 10,
  },
  feedbackBanner: { marginTop: space.md, padding: space.sm },
  feedbackOk: { backgroundColor: "rgba(197,160,89,0.1)" },
  feedbackErr: { backgroundColor: "rgba(255,122,122,0.1)" },
  feedbackText: { fontSize: 13 },
  sendBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: space.xl,
  },
  sendBtnText: { color: colors.textInverse, fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
});
