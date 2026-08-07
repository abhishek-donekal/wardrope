import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as IAP from "expo-iap";

import { api } from "@/src/lib/api";
import { IAP_ENABLED } from "@/src/lib/featureFlags";
import { useAuth } from "@/src/contexts/AuthContext";
import { useResponsive } from "@/src/hooks/use-responsive";
import { colors, type as type_, space } from "@/src/theme";

type PackId = "points_starter" | "points_popular" | "points_best";

type Pack = {
  id: PackId;
  label: string;
  points: number;
  price: string;
  badge?: string;
};

// Product IDs exactly as created in App Store Connect (no bundle-id prefix).
const APPLE_PRODUCT_IDS: Record<PackId, string> = {
  points_starter: "points_starter",
  points_popular: "points_popular",
  points_best: "points_best",
};

const PACKS: Pack[] = [
  { id: "points_starter", label: "Starter", points: 500, price: "$0.99" },
  { id: "points_popular", label: "Popular", points: 1200, price: "$1.99", badge: "Most Popular" },
  { id: "points_best", label: "Best Value", points: 2800, price: "$3.99", badge: "Best Value" },
];

export default function BuyPoints() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const { isTablet } = useResponsive();
  const params = useLocalSearchParams<{ success?: string }>();

  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(
    params.success === "1" ? "Points added to your account!" : null
  );
  const [balance, setBalance] = useState<number>(user?.points ?? 0);

  const pendingResolveRef = useRef<((res: { added: number; balance: number }) => void) | null>(null);
  const pendingRejectRef = useRef<((err: Error) => void) | null>(null);
  const productsReadyRef = useRef<boolean>(false);

  // Purchases disabled on this platform — never render the store.
  useEffect(() => {
    if (!IAP_ENABLED) router.replace("/(tabs)/profile");
  }, [router]);

  const [webModalOpen, setWebModalOpen] = useState(false);
  const [webModalPack, setWebModalPack] = useState<Pack | null>(null);
  const [webSdkReady, setWebSdkReady] = useState(false);
  const [webPaying, setWebPaying] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const squareCardRef = useRef<any>(null);
  const squarePaymentsRef = useRef<any>(null);

  // ----- Apple StoreKit setup (iOS only) -----
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let purchaseSub: { remove: () => void } | undefined;
    let errorSub: { remove: () => void } | undefined;
    (async () => {
      try {
        await IAP.initConnection();
        try {
          const fetched: any = await (IAP as any).fetchProducts({
            skus: Object.values(APPLE_PRODUCT_IDS),
            type: "in-app",
          });
          const list = Array.isArray(fetched) ? fetched : fetched?.products || [];
          productsReadyRef.current = list.length > 0;
        } catch (err) {
          productsReadyRef.current = false;
        }
        purchaseSub = IAP.purchaseUpdatedListener(async (purchase: any) => {
          try {
            const jws = purchase.jwsRepresentationIOS;
            if (!jws) {
              throw new Error("Missing signed transaction from StoreKit");
            }
            const res = await api<{ points_added: number; new_balance: number }>(
              "/billing/apple-verify-purchase",
              {
                method: "POST",
                body: {
                  signed_transaction: jws,
                  product_id: purchase.productId || purchase.id,
                },
              }
            );
            await IAP.finishTransaction({ purchase, isConsumable: true } as any);
            pendingResolveRef.current?.({ added: res.points_added, balance: res.new_balance });
          } catch (e: any) {
            pendingRejectRef.current?.(new Error(e?.message || "Could not verify purchase"));
          } finally {
            pendingResolveRef.current = null;
            pendingRejectRef.current = null;
          }
        });
        errorSub = IAP.purchaseErrorListener((error: any) => {
          const msg = error?.message || "Purchase failed";
          if (!/cancel/i.test(msg)) {
            pendingRejectRef.current?.(new Error(msg));
          } else {
            pendingRejectRef.current?.(new Error("cancelled"));
          }
          pendingResolveRef.current = null;
          pendingRejectRef.current = null;
        });
      } catch (e) {
        // initConnection can fail on simulator or when App Store is unreachable
      }
    })();
    return () => {
      purchaseSub?.remove();
      errorSub?.remove();
      IAP.endConnection().catch(() => {});
    };
  }, []);

  const loadBalance = useCallback(async () => {
    try {
      const res = await api<{ user: { points: number } }>("/auth/me");
      if (res?.user?.points != null) {
        setBalance(res.user.points);
        if (user) setUser({ ...user, points: res.user.points });
      }
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    loadBalance();
    if (params.success === "1") {
      setSuccessMsg("Points added to your account!");
      loadBalance();
    }
  }, [params.success]));

  const handleBuy = async (pack: Pack) => {
    setSelectedPack(pack.id);
    setBuying(true);
    try {
      if (Platform.OS === "ios") {
        // Apple StoreKit path — required for digital goods on iOS
        if (!productsReadyRef.current) {
          // Retry fetch once before failing — handles transient App Store outages
          try {
            const fetched: any = await (IAP as any).fetchProducts({
              skus: Object.values(APPLE_PRODUCT_IDS),
              type: "in-app",
            });
            const list = Array.isArray(fetched) ? fetched : fetched?.products || [];
            productsReadyRef.current = list.length > 0;
          } catch {}
          if (!productsReadyRef.current) {
            throw new Error(
              "In-App Purchases are temporarily unavailable. Please check your internet connection and try again in a moment."
            );
          }
        }
        const purchasePromise = new Promise<{ added: number; balance: number }>((resolve, reject) => {
          pendingResolveRef.current = resolve;
          pendingRejectRef.current = reject;
        });
        try {
          await IAP.requestPurchase({
            request: { ios: { sku: APPLE_PRODUCT_IDS[pack.id] } },
            type: "in-app",
          } as any);
        } catch (e: any) {
          pendingResolveRef.current = null;
          pendingRejectRef.current = null;
          throw e;
        }
        const result = await purchasePromise;
        setBalance(result.balance);
        if (user) setUser({ ...user, points: result.balance });
        setSuccessMsg(`${result.added} points added to your account!`);
      } else {
        // Web — open Square Web Payments SDK modal inline.
        setWebError(null);
        setWebModalPack(pack);
        setWebModalOpen(true);
      }
    } catch (e: any) {
      const msg = e?.message || "Could not process purchase.";
      if (msg === "cancelled") {
        // user dismissed Apple sheet — silent
      } else if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setBuying(false);
      setSelectedPack(null);
    }
  };

  // ----- Square Web Payments SDK (web only) -----
  const initSquareCard = useCallback(async () => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    try {
      const cfg = await api<{ app_id: string; location_id: string; environment: string }>(
        "/billing/square-config"
      );
      if (!cfg.app_id || !cfg.location_id) {
        setWebError("Payments not configured");
        return;
      }
      const scriptUrl =
        cfg.environment === "production"
          ? "https://web.squarecdn.com/v1/square.js"
          : "https://sandbox.web.squarecdn.com/v1/square.js";
      const w: any = window as any;
      if (!w.Square) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector(`script[src="${scriptUrl}"]`);
          if (existing) {
            existing.addEventListener("load", () => resolve());
            existing.addEventListener("error", () => reject(new Error("Failed to load Square SDK")));
            return;
          }
          const s = document.createElement("script");
          s.src = scriptUrl;
          s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load Square SDK"));
          document.head.appendChild(s);
        });
      }
      const payments = w.Square.payments(cfg.app_id, cfg.location_id);
      squarePaymentsRef.current = payments;
      const card = await payments.card();
      await card.attach("#sq-card-container");
      squareCardRef.current = card;
      setWebSdkReady(true);
    } catch (e: any) {
      setWebError(e?.message || "Could not load card form");
    }
  }, []);

  useEffect(() => {
    if (!webModalOpen) {
      // teardown on close
      if (squareCardRef.current?.destroy) {
        squareCardRef.current.destroy().catch(() => {});
      }
      squareCardRef.current = null;
      setWebSdkReady(false);
      return;
    }
    // Defer init until DOM mount of #sq-card-container.
    const t = setTimeout(() => {
      initSquareCard();
    }, 0);
    return () => clearTimeout(t);
  }, [webModalOpen, initSquareCard]);

  const handleWebPay = async () => {
    if (!webModalPack || !squareCardRef.current) return;
    setWebPaying(true);
    setWebError(null);
    try {
      const tokenResult = await squareCardRef.current.tokenize();
      if (tokenResult.status !== "OK" || !tokenResult.token) {
        const msg =
          tokenResult.errors?.[0]?.message ||
          `Card tokenization failed (${tokenResult.status})`;
        throw new Error(msg);
      }
      const res = await api<{
        ok: boolean;
        points_added: number;
        new_balance: number;
        receipt_url?: string;
      }>("/billing/buy-points-tokenized", {
        method: "POST",
        body: { pack: webModalPack.id, source_id: tokenResult.token },
      });
      setBalance(res.new_balance);
      if (user) setUser({ ...user, points: res.new_balance });
      setSuccessMsg(`${res.points_added} points added to your account!`);
      setWebModalOpen(false);
      setWebModalPack(null);
    } catch (e: any) {
      setWebError(e?.message || "Payment failed");
    } finally {
      setWebPaying(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type_.overline, { color: colors.text }]}>Buy Points</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, isTablet && styles.scrollTablet]}>
        {/* Balance */}
        <View style={styles.balanceCard}>
          <Ionicons name="trophy-outline" size={28} color={colors.accent} />
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.balanceLabel}>Current Balance</Text>
            <Text style={styles.balanceAmount}>{balance} pts</Text>
          </View>
        </View>

        {/* Success banner */}
        {successMsg && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.accent} />
            <Text style={styles.successText}>{successMsg}</Text>
          </View>
        )}

        <Text style={[type_.overline, { marginBottom: space.md, marginTop: space.xl }]}>Choose a Pack</Text>

        {PACKS.map((pack) => (
          <TouchableOpacity
            key={pack.id}
            style={[styles.packCard, pack.badge === "Most Popular" && styles.packCardHighlight]}
            onPress={() => handleBuy(pack)}
            disabled={buying}
          >
            {pack.badge && (
              <View style={[styles.packBadge, pack.badge === "Best Value" && styles.packBadgeGold]}>
                <Text style={styles.packBadgeText}>{pack.badge}</Text>
              </View>
            )}
            <View style={styles.packLeft}>
              <Text style={styles.packPoints}>{pack.points.toLocaleString()}</Text>
              <Text style={styles.packPtsLabel}>pts</Text>
            </View>
            <View style={styles.packRight}>
              <Text style={styles.packLabel}>{pack.label}</Text>
              <View style={styles.packPriceBtn}>
                {buying && selectedPack === pack.id ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Text style={styles.packPrice}>{pack.price}</Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ))}

        <Text style={styles.note}>
          Points are used to claim items in the Swap Box and unlock premium features.
          {Platform.OS === "ios"
            ? " Purchases are processed securely through the App Store."
            : " Purchases are processed securely."}
        </Text>
      </ScrollView>

      {Platform.OS === "web" && (
        <Modal
          visible={webModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => !webPaying && setWebModalOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {webModalPack ? `${webModalPack.label} — ${webModalPack.price}` : "Buy Points"}
                </Text>
                <TouchableOpacity
                  onPress={() => !webPaying && setWebModalOpen(false)}
                  disabled={webPaying}
                >
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              {!webSdkReady && !webError && (
                <View style={styles.modalLoader}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={styles.modalLoaderText}>Loading secure card form…</Text>
                </View>
              )}

              {/* Square Web SDK mounts its iframe here. Must be a real DOM div. */}
              <View
                // @ts-ignore — RN Web passes id through to DOM
                nativeID="sq-card-container"
                id="sq-card-container"
                style={styles.cardContainer}
              />

              {webError && (
                <Text style={styles.modalError}>{webError}</Text>
              )}

              <TouchableOpacity
                style={[styles.payBtn, (!webSdkReady || webPaying) && styles.payBtnDisabled]}
                onPress={handleWebPay}
                disabled={!webSdkReady || webPaying}
              >
                {webPaying ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Text style={styles.payBtnText}>
                    Pay {webModalPack?.price ?? ""}
                  </Text>
                )}
              </TouchableOpacity>

              <Text style={styles.modalFootnote}>
                Card processed by Square. Test card: 4111 1111 1111 1111, any CVV/exp, ZIP 94103.
              </Text>
            </View>
          </View>
        </Modal>
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
  scroll: { padding: space.lg, paddingBottom: 80 },
  scrollTablet: { width: "100%", maxWidth: 560, alignSelf: "center" },
  balanceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  balanceLabel: { color: colors.textSecondary, fontSize: 12, letterSpacing: 0.5 },
  balanceAmount: { color: colors.accent, fontSize: 28, fontWeight: "700", marginTop: 2 },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(197,160,89,0.15)",
    borderWidth: 1,
    borderColor: colors.accent,
    padding: space.md,
    marginTop: space.md,
  },
  successText: { color: colors.accent, fontSize: 14, fontWeight: "600", flex: 1 },
  packCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: 12,
    position: "relative",
  },
  packCardHighlight: {
    borderColor: colors.accent,
  },
  packBadge: {
    position: "absolute",
    top: -1,
    right: -1,
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  packBadgeGold: { backgroundColor: "#DEB76E" },
  packBadgeText: { color: colors.textInverse, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  packLeft: { flex: 1, alignItems: "flex-start" },
  packPoints: { color: colors.text, fontSize: 40, fontWeight: "800", lineHeight: 44 },
  packPtsLabel: { color: colors.textSecondary, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginTop: -4 },
  packRight: { alignItems: "flex-end", gap: 8 },
  packLabel: { color: colors.textSecondary, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 },
  packPriceBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minWidth: 80,
    alignItems: "center",
  },
  packPrice: { color: colors.textInverse, fontSize: 18, fontWeight: "700" },
  note: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: space.xl,
    paddingHorizontal: space.md,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.lg,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  modalLoader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: space.md,
  },
  modalLoaderText: { color: colors.textSecondary, fontSize: 13 },
  cardContainer: {
    minHeight: 90,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  modalError: {
    color: "#D9534F",
    fontSize: 13,
    marginBottom: space.sm,
  },
  payBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: space.sm,
  },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  modalFootnote: {
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: "center",
    marginTop: space.md,
    lineHeight: 16,
  },
});
