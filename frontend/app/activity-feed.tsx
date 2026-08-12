import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, type as type_, space } from "@/src/theme";

type ActivityEvent = {
  event_id: string;
  type: "item_added" | "outfit_saved" | "swap_listed" | "listing_claimed" | "swap_claimed" | string;
  user_name: string;
  user_id?: string;
  item_name?: string;
  outfit_title?: string;
  created_at: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function eventIcon(type: string): { name: any; color: string } {
  switch (type) {
    case "item_added": return { name: "shirt-outline", color: colors.accent };
    case "outfit_saved": return { name: "images-outline", color: "#7BA7BC" };
    case "swap_listed": return { name: "swap-horizontal-outline", color: "#A0C878" };
    case "listing_claimed":
    case "swap_claimed": return { name: "hand-left-outline", color: colors.accent };
    default: return { name: "ellipse-outline", color: colors.textSecondary };
  }
}

function eventText(event: ActivityEvent): string {
  switch (event.type) {
    case "item_added":
      return `${event.user_name} added a new item${event.item_name ? ` · ${event.item_name}` : ""}`;
    case "outfit_saved":
      return `${event.user_name} saved a new look${event.outfit_title ? ` · "${event.outfit_title}"` : ""}`;
    case "swap_listed":
      return `${event.user_name} listed something in the Swap Box`;
    case "listing_claimed":
      return `${event.user_name} claimed your listing${event.item_name ? ` · ${event.item_name}` : ""}`;
    case "swap_claimed":
      return `${event.user_name} claimed your Swap Box item${event.item_name ? ` · ${event.item_name}` : ""}`;
    default:
      return `${event.user_name} did something`;
  }
}

export default function ActivityFeed() {
  const router = useRouter();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ events: any[] }>("/activity-feed");
      // Backend stores activity_id/event_type with details nested under `data` —
      // normalize to the flat shape this screen renders.
      setEvents(
        (res.events || []).map((e: any): ActivityEvent => ({
          event_id: e.event_id ?? e.activity_id,
          type: e.type ?? e.event_type,
          user_name: e.user_name,
          created_at: e.created_at,
          item_name: e.item_name ?? e.data?.item_name,
          outfit_title: e.outfit_title ?? e.data?.outfit_title,
        }))
      );
    } catch (e: any) {
      setError(e?.message || "Could not load activity.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type_.overline, { color: colors.text }]}>Activity Feed</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.textSecondary} />
          <Text style={[type_.body, { color: colors.textSecondary, marginTop: space.md, textAlign: "center" }]}>
            {error}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : events.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
          <Text style={[type_.body, { marginTop: space.md, textAlign: "center", color: colors.textSecondary }]}>
            Add friends to see their activity here
          </Text>
          <TouchableOpacity style={styles.addFriendsBtn} onPress={() => router.push("/friends")}>
            <Text style={styles.addFriendsBtnText}>Find Friends</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.event_id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl tintColor={colors.accent} refreshing={refreshing} onRefresh={onRefresh} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const icon = eventIcon(item.type);
            return (
              <View style={styles.eventRow}>
                <View style={[styles.iconCircle, { borderColor: icon.color + "44" }]}>
                  <Ionicons name={icon.name} size={18} color={icon.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.eventText}>{eventText(item)}</Text>
                  <Text style={styles.eventTime}>{timeAgo(item.created_at)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg },
  list: { padding: space.lg, paddingBottom: 100 },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: 62 },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSecondary,
  },
  eventText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  eventTime: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  retryBtn: { marginTop: space.lg, borderWidth: 1, borderColor: colors.accent, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  addFriendsBtn: {
    marginTop: space.lg,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  addFriendsBtnText: { color: colors.textInverse, fontWeight: "700", fontSize: 14 },
});
