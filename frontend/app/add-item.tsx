import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  Alert,
  Linking,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { api } from "@/src/lib/api";
import { colors, type, space } from "@/src/theme";


type Tags = {
  type?: string;
  category?: string;
  color?: string;
  pattern?: string;
  material?: string;
  season?: string[];
  occasion?: string[];
  formality?: string;
  description?: string;
};

export default function AddItem() {
  const router = useRouter();
  const params = useLocalSearchParams<{ prefill_name?: string; prefill_brand?: string }>();
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [tags, setTags] = useState<Tags | null>(null);
  const [name, setName] = useState(params.prefill_name || "");
  const [brand, setBrand] = useState(params.prefill_brand || "");
  const [busy, setBusy] = useState<"idle" | "picking" | "tagging" | "saving">("idle");

  const ensureCameraPerm = async (): Promise<boolean> => {
    const cur = await ImagePicker.getCameraPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) {
      Alert.alert(
        "Camera permission",
        "We need camera access to capture clothing items.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open settings", onPress: () => Linking.openSettings() },
        ]
      );
      return false;
    }
    const req = await ImagePicker.requestCameraPermissionsAsync();
    return req.granted;
  };

  const ensureLibraryPerm = async (): Promise<boolean> => {
    const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) {
      Alert.alert(
        "Photo library",
        "We need access to your photos to pick an image.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open settings", onPress: () => Linking.openSettings() },
        ]
      );
      return false;
    }
    const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return req.granted;
  };

  const handleResult = async (b64?: string | null) => {
    if (!b64) {
      setBusy("idle");
      return;
    }
    setImageBase64(b64);
    setBusy("tagging");
    try {
      const res = await api<{ tags: Tags }>("/ai/tag-item", {
        method: "POST",
        body: { image_base64: b64 },
      });
      setTags(res.tags);
      // Only set name from AI if not pre-filled (e.g. from barcode scan)
      setName((prev) => prev || res.tags.description || res.tags.type || "");
    } catch (e: any) {
      Alert.alert("AI tagging failed", e?.message || "Unknown error");
    } finally {
      setBusy("idle");
    }
  };

  const fromCamera = async () => {
    if (!(await ensureCameraPerm())) return;
    setBusy("picking");
    try {
      const r = await ImagePicker.launchCameraAsync({
        base64: true,
        quality: 0.7,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (r.canceled) return setBusy("idle");
      await handleResult(r.assets?.[0]?.base64);
    } catch {
      setBusy("idle");
    }
  };

  const fromLibrary = async () => {
    if (!(await ensureLibraryPerm())) return;
    setBusy("picking");
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        base64: true,
        quality: 0.7,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (r.canceled) return setBusy("idle");
      await handleResult(r.assets?.[0]?.base64);
    } catch {
      setBusy("idle");
    }
  };

  const save = async () => {
    if (!imageBase64 || !tags) return;
    setBusy("saving");
    try {
      await api("/items", {
        method: "POST",
        body: {
          image_base64: imageBase64,
          name: name || tags.description,
          tags,
          ...(brand.trim() ? { brand: brand.trim() } : {}),
        },
      });
      router.back();
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message || "Unknown error");
    } finally {
      setBusy("idle");
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]} testID="add-item-screen">
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} testID="add-item-back-btn">
          <Ionicons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type.overline, { color: colors.text }]}>Catalog an item</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {!imageBase64 ? (
          <View style={styles.choose}>
            <Text style={[type.h2, { marginBottom: space.md }]}>Show us the piece</Text>
            <Text style={[type.bodySm, { marginBottom: space.xl }]}>
              Snap a photo against a clean background, or pick from your library.
            </Text>

            <TouchableOpacity testID="add-item-camera-btn" style={styles.bigBtn} onPress={fromCamera}>
              <Ionicons name="camera-outline" size={28} color={colors.accent} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.bigBtnTitle}>Take a photo</Text>
                <Text style={styles.bigBtnSub}>Best results: plain background, one item</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity testID="add-item-library-btn" style={styles.bigBtn} onPress={fromLibrary}>
              <Ionicons name="images-outline" size={28} color={colors.accent} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.bigBtnTitle}>Pick from library</Text>
                <Text style={styles.bigBtnSub}>Choose an existing photo</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              testID="add-item-barcode-btn"
              style={[styles.bigBtn, { marginTop: 0, borderStyle: "dashed" }]}
              onPress={() => router.push("/barcode-scan")}
            >
              <Ionicons name="barcode-outline" size={28} color={colors.textSecondary} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={[styles.bigBtnTitle, { color: colors.textSecondary }]}>Scan a barcode</Text>
                <Text style={styles.bigBtnSub}>Auto-fill name and brand</Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Image
              source={{ uri: `data:image/jpeg;base64,${imageBase64}` }}
              style={styles.preview}
            />

            {busy === "tagging" ? (
              <View style={styles.tagging}>
                <ActivityIndicator color={colors.accent} />
                <Text style={[type.bodySm, { marginLeft: 12 }]}>AI is reading the garment…</Text>
              </View>
            ) : null}

            {tags ? (
              <View>
                <Text style={[type.overline, { marginTop: space.lg }]}>Detected</Text>

                <Text style={styles.label}>Name</Text>
                <TextInput
                  testID="add-item-name-input"
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Cream silk blouse"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.input}
                />

                <Text style={styles.label}>Brand (optional)</Text>
                <TextInput
                  testID="add-item-brand-input"
                  value={brand}
                  onChangeText={setBrand}
                  placeholder="e.g. Zara, H&M"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.input}
                />

                <View style={styles.tagGrid}>
                  <TagPill label="Category" value={tags.category} />
                  <TagPill label="Color" value={tags.color} />
                  <TagPill label="Pattern" value={tags.pattern} />
                  <TagPill label="Material" value={tags.material} />
                  <TagPill label="Formality" value={tags.formality} />
                  <TagPill label="Occasion" value={(tags.occasion || []).join(", ")} />
                  <TagPill label="Season" value={(tags.season || []).join(", ")} />
                </View>

                <TouchableOpacity
                  testID="add-item-save-btn"
                  style={[styles.primaryBtn, busy === "saving" && { opacity: 0.6 }]}
                  onPress={save}
                  disabled={busy === "saving"}
                >
                  {busy === "saving" ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Add to closet</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  testID="add-item-retake-btn"
                  style={styles.secondaryBtn}
                  onPress={() => {
                    setImageBase64(null);
                    setTags(null);
                  }}
                >
                  <Text style={styles.secondaryBtnText}>Use a different photo</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TagPill({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.tagPill}>
      <Text style={styles.tagPillLabel}>{label}</Text>
      <Text style={styles.tagPillValue} numberOfLines={1}>{value}</Text>
    </View>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  scroll: { padding: space.lg, paddingBottom: space.xxl },
  choose: { paddingTop: space.lg },
  bigBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
    marginBottom: 12,
  },
  bigBtnTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  bigBtnSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  preview: { width: "100%", aspectRatio: 0.85, backgroundColor: colors.bgSecondary },
  tagging: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    marginTop: space.md,
  },
  label: { ...type.overline, fontSize: 11, marginTop: space.md, marginBottom: 6 },
  input: {
    color: colors.text,
    fontSize: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tagGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: space.md },
  tagPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagPillLabel: { ...type.overline, fontSize: 9, color: colors.textSecondary },
  tagPillValue: { color: colors.text, fontSize: 13, marginTop: 2, textTransform: "capitalize" },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: space.xl,
  },
  primaryBtnText: { color: colors.textInverse, fontWeight: "700", letterSpacing: 1, fontSize: 14 },
  secondaryBtn: { paddingVertical: 14, alignItems: "center", marginTop: 8 },
  secondaryBtnText: { color: colors.text, fontSize: 13 },
});
