import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { api, uploadImageToS3 } from "@/src/lib/api";
import { colors, type, space } from "@/src/theme";

export default function CameraRollScan() {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]); // local URI list
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState("");

  const ensurePerm = async (): Promise<boolean> => {
    const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) {
      Alert.alert("Photo library", "We need access to scan your photos.", [
        { text: "Cancel", style: "cancel" },
        { text: "Open settings", onPress: () => Linking.openSettings() },
      ]);
      return false;
    }
    const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return req.granted;
  };

  const pick = async () => {
    if (!(await ensurePerm())) return;
    const r = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: 6,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (r.canceled) return;
    const newUris = (r.assets || []).map((a) => a.uri).filter((x): x is string => !!x);
    setPicked((p) => [...p, ...newUris].slice(0, 8));
  };

  const scan = async () => {
    if (picked.length === 0) return;
    setBusy(true);
    setAdded(null);
    setUploadProgress("Uploading images…");
    try {
      // Upload all images to S3 concurrently
      const imageUrls = await Promise.all(
        picked.map((uri) => uploadImageToS3(uri, "item.jpg"))
      );
      setUploadProgress("Processing with AI…");
      const res = await api<{ added: number; errors: number; items: any[] }>("/scan/camera-roll-urls", {
        method: "POST",
        body: { image_urls: imageUrls },
      });
      setAdded(res.added);
    } catch (e: any) {
      Alert.alert("Scan failed", e?.message || "Try again");
    } finally {
      setBusy(false);
      setUploadProgress("");
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]} testID="scan-screen">
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} testID="scan-back-btn">
          <Ionicons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type.overline, { color: colors.text }]}>Camera roll scan</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[type.h2, { marginBottom: space.sm }]}>Find outfits{"\n"}in your photos</Text>
        <Text style={[type.bodySm, { marginBottom: space.xl }]}>
          Pick up to 8 photos. Our AI will detect the main garment in each and add it to your closet.
        </Text>

        {picked.length > 0 ? (
          <View style={styles.grid}>
            {picked.map((uri, i) => (
              <View key={i} style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumb} />
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => setPicked((p) => p.filter((_, idx) => idx !== i))}
                  testID={`scan-remove-${i}`}
                >
                  <Ionicons name="close" size={14} color={colors.text} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        <TouchableOpacity testID="scan-pick-btn" style={styles.pickBtn} onPress={pick}>
          <Ionicons name="images-outline" size={20} color={colors.accent} />
          <Text style={styles.pickBtnText}>
            {picked.length === 0 ? "Choose photos" : `Add more (${picked.length}/8)`}
          </Text>
        </TouchableOpacity>

        {added !== null ? (
          <View style={styles.result} testID="scan-result">
            <Ionicons name="checkmark-circle" size={28} color={colors.accent} />
            <Text style={[type.h3, { marginTop: 8 }]}>
              Added {added} {added === 1 ? "item" : "items"}
            </Text>
            <TouchableOpacity
              style={styles.viewBtn}
              onPress={() => router.replace("/(tabs)/closet")}
              testID="scan-view-closet-btn"
            >
              <Text style={styles.viewBtnText}>View closet</Text>
            </TouchableOpacity>
          </View>
        ) : (
          {busy && uploadProgress ? (
            <View style={styles.progressRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={[type.bodySm, { marginLeft: 10 }]}>{uploadProgress}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            testID="scan-process-btn"
            style={[styles.primaryBtn, (picked.length === 0 || busy) && { opacity: 0.4 }]}
            onPress={scan}
            disabled={picked.length === 0 || busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.primaryBtnText}>Scan {picked.length || ""} photos</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  scroll: { padding: space.lg, paddingBottom: space.xxl },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: space.md },
  thumbWrap: { width: "31%", aspectRatio: 1, position: "relative" },
  thumb: { width: "100%", height: "100%", backgroundColor: colors.bgSecondary },
  removeBtn: {
    position: "absolute", top: 4, right: 4,
    width: 24, height: 24, borderRadius: 999,
    backgroundColor: "rgba(5,5,5,0.7)",
    alignItems: "center", justifyContent: "center",
  },
  pickBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, padding: 16, borderWidth: 1, borderColor: colors.accent, borderStyle: "dashed",
  },
  pickBtnText: { color: colors.accent, fontWeight: "600" },
  progressRow: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, marginTop: space.md },
  primaryBtn: { backgroundColor: colors.accent, paddingVertical: 16, alignItems: "center", marginTop: space.xl },
  primaryBtnText: { color: colors.textInverse, fontWeight: "700", letterSpacing: 1 },
  result: { alignItems: "center", paddingVertical: space.xl, marginTop: space.lg },
  viewBtn: { marginTop: space.lg, paddingHorizontal: 24, paddingVertical: 14, backgroundColor: colors.accent },
  viewBtnText: { color: colors.textInverse, fontWeight: "700", letterSpacing: 0.5 },
});
