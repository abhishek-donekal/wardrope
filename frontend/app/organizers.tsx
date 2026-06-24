import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  Modal,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, type as type_, space } from "@/src/theme";

type Organizer = {
  place_id?: string;
  name: string;
  address?: string;
  rating?: number;
  open_now?: boolean;
};

type ServiceResult = {
  results?: Organizer[];
  has_api_key?: boolean;
};

function StarRating({ rating }: { rating?: number }) {
  if (!rating) return null;
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < full ? "star" : i === full && half ? "star-half" : "star-outline"}
          size={12}
          color={colors.accent}
        />
      ))}
      <Text style={{ color: colors.textSecondary, fontSize: 11, marginLeft: 4 }}>{rating.toFixed(1)}</Text>
    </View>
  );
}

export default function Organizers() {
  const router = useRouter();
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [results, setResults] = useState<Organizer[]>([]);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedOrganizer, setSelectedOrganizer] = useState<Organizer | null>(null);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingNotes, setBookingNotes] = useState("");

  const search = useCallback(async () => {
    if (!lat.trim() || !lng.trim()) {
      Alert.alert("Enter coordinates", "Please enter both latitude and longitude.");
      return;
    }
    setLoading(true);
    try {
      const res = await api<ServiceResult>(`/services/organizers?lat=${lat.trim()}&lng=${lng.trim()}`);
      setResults(res.results || []);
      setHasApiKey(res.has_api_key !== false);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not load results.");
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [lat, lng]);

  const openBooking = (organizer: Organizer) => {
    setSelectedOrganizer(organizer);
    setBookingNotes("");
    setBookingOpen(true);
  };

  const submitBooking = async () => {
    if (!selectedOrganizer) return;
    setBookingBusy(true);
    try {
      await api("/services/book", {
        method: "POST",
        body: {
          service_type: "organizer",
          business_name: selectedOrganizer.name,
          address: selectedOrganizer.address,
          notes: bookingNotes.trim() || undefined,
        },
      });
      setBookingOpen(false);
      const msg = "Session booked successfully!";
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(msg);
      } else {
        Alert.alert("Booked!", msg);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not book session.");
    } finally {
      setBookingBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type_.overline, { color: colors.text }]}>Closet Organizers Near You</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.locationCard}>
          <Text style={[type_.overline, { marginBottom: space.sm }]}>Your Location</Text>
          <View style={styles.coordRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Latitude</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. 40.7128"
                placeholderTextColor={colors.textSecondary}
                value={lat}
                onChangeText={setLat}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Longitude</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. -74.0060"
                placeholderTextColor={colors.textSecondary}
                value={lng}
                onChangeText={setLng}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={search} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.searchBtnText}>Search Nearby</Text>
            )}
          </TouchableOpacity>
        </View>

        {!hasApiKey && (
          <View style={styles.apiBanner}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.apiBannerText}>
              Location services coming soon — configure Google Places API key.
            </Text>
          </View>
        )}

        {searched && !loading && results.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="grid-outline" size={40} color={colors.textSecondary} />
            <Text style={[type_.body, { color: colors.textSecondary, marginTop: space.md, textAlign: "center" }]}>
              No organizers found nearby.{"\n"}Try different coordinates.
            </Text>
          </View>
        )}

        {results.map((item, idx) => (
          <View key={item.place_id ?? idx} style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Ionicons name="filing-outline" size={18} color={colors.accent} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.resultName}>{item.name}</Text>
                {item.address ? <Text style={styles.resultAddress}>{item.address}</Text> : null}
              </View>
              {item.open_now !== undefined && (
                <View style={[styles.openBadge, !item.open_now && styles.closedBadge]}>
                  <Text style={styles.openBadgeText}>{item.open_now ? "Open" : "Closed"}</Text>
                </View>
              )}
            </View>
            <StarRating rating={item.rating} />
            <TouchableOpacity style={styles.bookBtn} onPress={() => openBooking(item)}>
              <Text style={styles.bookBtnText}>Book a Consultation</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={{ height: 80 }} />
      </ScrollView>

      <Modal
        visible={bookingOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setBookingOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[type_.overline, { color: colors.text }]}>Book Organizer</Text>
              <TouchableOpacity onPress={() => setBookingOpen(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            {selectedOrganizer && (
              <Text style={styles.modalBusiness}>{selectedOrganizer.name}</Text>
            )}
            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Closet size, preferences, availability…"
              placeholderTextColor={colors.textSecondary}
              value={bookingNotes}
              onChangeText={setBookingNotes}
              multiline
            />
            <TouchableOpacity
              style={[styles.searchBtn, bookingBusy && { opacity: 0.6 }, { marginTop: space.xl }]}
              onPress={submitBooking}
              disabled={bookingBusy}
            >
              {bookingBusy ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.searchBtnText}>Confirm Booking</Text>
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
  locationCard: {
    margin: space.lg,
    padding: space.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  coordRow: { flexDirection: "row" },
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
  searchBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: space.lg,
  },
  searchBtnText: { color: colors.textInverse, fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
  apiBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    padding: space.md,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  apiBannerText: { color: colors.textSecondary, fontSize: 12, flex: 1 },
  emptyState: { alignItems: "center", padding: space.xl, marginTop: space.xl },
  resultCard: {
    marginHorizontal: space.lg,
    marginBottom: 12,
    padding: space.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  resultName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  resultAddress: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  openBadge: { backgroundColor: "rgba(100,200,100,0.2)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2 },
  closedBadge: { backgroundColor: "rgba(200,100,100,0.2)" },
  openBadgeText: { fontSize: 10, fontWeight: "700", color: colors.text, textTransform: "uppercase" },
  bookBtn: { marginTop: space.md, backgroundColor: colors.accent, paddingVertical: 12, alignItems: "center" },
  bookBtnText: { color: colors.textInverse, fontWeight: "700", fontSize: 13, letterSpacing: 0.3 },
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
  modalBusiness: { color: colors.text, fontSize: 16, fontWeight: "600", marginBottom: space.md },
});
