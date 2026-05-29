import { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";

import { api } from "@/src/lib/api";
import { colors, type, space } from "@/src/theme";

type LookupResult = {
  found: boolean;
  name?: string;
  brand?: string;
  description?: string;
  image_url?: string;
};

type AddState = "idle" | "adding" | "done" | "error";

export default function BarcodeScanner() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [addState, setAddState] = useState<AddState>("idle");
  const lastScanned = useRef<string>("");

  const handleBarcode = async ({ data }: { data: string }) => {
    if (!scanning || looking || data === lastScanned.current) return;
    lastScanned.current = data;
    setScanning(false);
    setLooking(true);
    try {
      const res = await api<LookupResult>("/items/barcode-lookup", {
        method: "POST",
        body: { barcode: data },
      });
      setResult(res);
    } catch {
      setResult({ found: false });
    } finally {
      setLooking(false);
    }
  };

  const addToWardrobe = async () => {
    if (!result?.found) return;
    setAddState("adding");
    try {
      await api("/items/barcode-add", {
        method: "POST",
        body: { barcode: lastScanned.current },
      });
      setAddState("done");
    } catch {
      setAddState("error");
    }
  };

  const addManually = () => {
    router.replace({
      pathname: "/add-item",
      params: {
        prefill_name: result?.name || "",
        prefill_brand: result?.brand || "",
      },
    });
  };

  const scanAgain = () => {
    setResult(null);
    setAddState("idle");
    lastScanned.current = "";
    setScanning(true);
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[type.overline, { color: colors.text }]}>Scan Barcode</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={48} color={colors.textSecondary} />
          <Text style={[type.body, { marginTop: space.md, textAlign: "center" }]}>
            Camera access is required to scan barcodes.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
            <Text style={styles.primaryBtnText}>Grant Camera Access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      {Platform.OS !== "web" ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          onBarcodeScanned={scanning ? handleBarcode : undefined}
          barcodeScannerSettings={{ barcodeTypes: ["upc_a", "upc_e", "ean13", "ean8", "code128", "code39", "qr"] }}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111", alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="barcode-outline" size={64} color={colors.textSecondary} />
          <Text style={[type.bodySm, { marginTop: space.md, color: colors.textSecondary }]}>
            Barcode scanning requires the mobile app
          </Text>
        </View>
      )}

      {/* Top bar overlay */}
      <SafeAreaView style={styles.overlay} edges={["top"]}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.overlayTitle}>Scan Barcode</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {/* Scanning frame */}
      {!result && !looking && (
        <View style={styles.frameWrap} pointerEvents="none">
          <View style={styles.frame} />
          <Text style={styles.hint}>Point at a clothing barcode or tag</Text>
        </View>
      )}

      {/* Looking up */}
      {looking && (
        <View style={styles.resultSheet}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[type.bodySm, { marginTop: space.md }]}>Looking up product…</Text>
        </View>
      )}

      {/* Result */}
      {result && !looking && (
        <View style={styles.resultSheet}>
          {/* Adding in progress */}
          {addState === "adding" && (
            <>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={[type.bodySm, { marginTop: space.md }]}>AI is tagging your item…</Text>
            </>
          )}

          {/* Successfully added */}
          {addState === "done" && (
            <>
              <Ionicons name="checkmark-circle" size={44} color={colors.accent} />
              <Text style={[type.h3, { marginTop: space.md }]}>Added to wardrobe!</Text>
              <Text style={[type.bodySm, { marginTop: 6, color: colors.textSecondary, textAlign: "center" }]}>
                {result.name}
              </Text>
              <TouchableOpacity style={[styles.primaryBtn, { marginTop: space.xl }]} onPress={() => router.replace("/(tabs)/closet")}>
                <Text style={styles.primaryBtnText}>View Closet</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={scanAgain}>
                <Text style={styles.secondaryBtnText}>Scan another</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Add error */}
          {addState === "error" && (
            <>
              <Ionicons name="alert-circle-outline" size={44} color={colors.textSecondary} />
              <Text style={[type.h3, { marginTop: space.md }]}>Couldn't add item</Text>
              <TouchableOpacity style={[styles.primaryBtn, { marginTop: space.xl }]} onPress={addManually}>
                <Text style={styles.primaryBtnText}>Add manually instead</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={scanAgain}>
                <Text style={styles.secondaryBtnText}>Try again</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Found — ready to add */}
          {addState === "idle" && result.found && (
            <>
              <Ionicons name="barcode-outline" size={36} color={colors.accent} />
              <Text style={[type.h3, { marginTop: space.md, textAlign: "center" }]}>{result.name || "Product found"}</Text>
              {result.brand ? (
                <Text style={[type.bodySm, { color: colors.accent, marginTop: 4 }]}>{result.brand}</Text>
              ) : null}
              {result.description && result.description !== result.name ? (
                <Text style={[type.bodySm, { marginTop: 6, textAlign: "center", color: colors.textSecondary, maxWidth: 280 }]} numberOfLines={2}>
                  {result.description}
                </Text>
              ) : null}
              <TouchableOpacity style={[styles.primaryBtn, { marginTop: space.xl }]} onPress={addToWardrobe}>
                <Text style={styles.primaryBtnText}>Add to Wardrobe</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={addManually}>
                <Text style={styles.secondaryBtnText}>Edit details first</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={scanAgain}>
                <Text style={styles.secondaryBtnText}>Scan again</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Not found */}
          {addState === "idle" && !result.found && (
            <>
              <Ionicons name="help-circle-outline" size={44} color={colors.textSecondary} />
              <Text style={[type.h3, { marginTop: space.md }]}>Product not found</Text>
              <Text style={[type.bodySm, { marginTop: 8, textAlign: "center", maxWidth: 280 }]}>
                This barcode isn't in our database. Add the item manually instead.
              </Text>
              <TouchableOpacity style={[styles.primaryBtn, { marginTop: space.xl }]} onPress={() => router.replace("/add-item")}>
                <Text style={styles.primaryBtnText}>Add manually</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={scanAgain}>
                <Text style={styles.secondaryBtnText}>Scan again</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: space.lg },
  overlay: { position: "absolute", top: 0, left: 0, right: 0 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  iconBtn: {
    width: 40, height: 40,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 999,
    alignItems: "center", justifyContent: "center",
  },
  overlayTitle: { color: "#fff", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", fontWeight: "600" },
  frameWrap: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
  frame: { width: 260, height: 160, borderWidth: 2, borderColor: colors.accent, borderRadius: 4 },
  hint: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 16, letterSpacing: 0.5 },
  resultSheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: 60,
    alignItems: "center",
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 14, paddingHorizontal: 40,
    borderRadius: 2, alignItems: "center", width: "100%",
  },
  primaryBtnText: { color: colors.textInverse, fontWeight: "700", letterSpacing: 1, fontSize: 14 },
  secondaryBtn: { marginTop: space.md, paddingVertical: 10 },
  secondaryBtnText: { color: colors.textSecondary, fontSize: 13 },
});
