import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as IAP from "expo-iap";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { colors, type, space } from "@/src/theme";

type Period = "monthly" | "annual";
type PlanKey = "single" | "couples" | "family";

const BUNDLE_ID = "com.wardrope.app";

// Apple auto-renewable subscription product IDs (must match App Store Connect).
const APPLE_SUB_IDS: Record<string, string> = {
  "single|monthly": `${BUNDLE_ID}.sub_single_monthly`,
  "single|annual": `${BUNDLE_ID}.sub_single_annual`,
  "couples|monthly": `${BUNDLE_ID}.sub_couples_monthly`,
  "couples|annual": `${BUNDLE_ID}.sub_couples_annual`,
  "family|monthly": `${BUNDLE_ID}.sub_family_monthly`,
  "family|annual": `${BUNDLE_ID}.sub_family_annual`,
};

const PLANS: { key: PlanKey; name: string; monthly: number; annual: number; description: string; features: string[] }[] = [
  {
    key: "single",
    name: "Single Closet",
    monthly: 1.99,
    annual: 17.99,
    description: "Perfect for one person",
    features: ["Unlimited items", "AI tagging", "Outfit builder", "Lookbook"],
  },
  {
    key: "couples",
    name: "Couples Closet",
    monthly: 2.99,
    annual: 26.99,
    description: "Two wardrobes, one app",
    features: ["Everything in Single", "2 user accounts", "Shared outfit ideas"],
  },
  {
    key: "family",
    name: "Family Closet",
    monthly: 4.99,
    annual: 44.99,
    description: "The whole household",
    features: ["Everything in Couples", "Up to 5 users", "Family style profiles"],
  },
];

const ADDONS = [
  { key: "share", label: "Share Closet", price: 9.99, description: "Share your closet or select items with others", icon: "share-outline" as const },
  { key: "stylist", label: "Stylist AI", price: 3.99, description: "Unlimited AI outfit critiques & styling advice", icon: "sparkles-outline" as const },
];

function planLabel(plan_type: string, plan_period: string): string {
  if (plan_type === "free") return "Free";
  const names: Record<string, string> = { single: "Single", couples: "Couples", family: "Family" };
  const period = plan_period === "annual" ? "/yr" : "/mo";
  return `${names[plan_type] ?? plan_type}${period}`;
}

export default function Subscription() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [period, setPeriod] = useState<Period>("monthly");
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("single");
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);

  const currentPlan = user?.plan_type ?? "free";
  const isActive = user?.subscription_status === "active";
  const isIOS = Platform.OS === "ios";

  const pendingResolveRef = useRef<(() => void) | null>(null);
  const pendingRejectRef = useRef<((e: Error) => void) | null>(null);
  const productsReadyRef = useRef(false);

  // ----- Apple StoreKit auto-renewable subscriptions (iOS only) -----
  useEffect(() => {
    if (!isIOS) return;
    let purchaseSub: { remove: () => void } | undefined;
    let errorSub: { remove: () => void } | undefined;
    (async () => {
      try {
        await IAP.initConnection();
        try {
          const fetched: any = await (IAP as any).fetchProducts({
            skus: Object.values(APPLE_SUB_IDS),
            type: "subs",
          });
          const list = Array.isArray(fetched) ? fetched : fetched?.products || [];
          productsReadyRef.current = list.length > 0;
        } catch {
          productsReadyRef.current = false;
        }
        purchaseSub = IAP.purchaseUpdatedListener(async (purchase: any) => {
          try {
            const jws = purchase.jwsRepresentationIOS;
            if (!jws) throw new Error("Missing signed transaction from StoreKit");
            const res = await api<{ user: any }>("/billing/apple-verify-subscription", {
              method: "POST",
              body: { signed_transaction: jws, product_id: purchase.productId || purchase.id },
            });
            await IAP.finishTransaction({ purchase, isConsumable: false } as any);
            if (res.user) setUser(res.user);
            pendingResolveRef.current?.();
          } catch (e: any) {
            pendingRejectRef.current?.(new Error(e?.message || "Could not verify subscription"));
          } finally {
            pendingResolveRef.current = null;
            pendingRejectRef.current = null;
          }
        });
        errorSub = IAP.purchaseErrorListener((error: any) => {
          const msg = error?.message || "Purchase failed";
          pendingRejectRef.current?.(new Error(/cancel/i.test(msg) ? "cancelled" : msg));
          pendingResolveRef.current = null;
          pendingRejectRef.current = null;
        });
      } catch {
        // initConnection fails on simulator / when App Store is unreachable
      }
    })();
    return () => {
      purchaseSub?.remove();
      errorSub?.remove();
      IAP.endConnection().catch(() => {});
    };
  }, [isIOS]);

  const toggleAddon = (key: string) => {
    setSelectedAddons((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]
    );
  };

  const checkout = async () => {
    setBusy(true);
    try {
      if (isIOS) {
        // Apple In-App Purchase — required for digital subscriptions on iOS.
        const sku = APPLE_SUB_IDS[`${selectedPlan}|${period}`];
        if (!productsReadyRef.current) {
          try {
            const fetched: any = await (IAP as any).fetchProducts({ skus: Object.values(APPLE_SUB_IDS), type: "subs" });
            const list = Array.isArray(fetched) ? fetched : fetched?.products || [];
            productsReadyRef.current = list.length > 0;
          } catch {}
          if (!productsReadyRef.current) {
            throw new Error("Subscriptions are temporarily unavailable. Check your connection and try again.");
          }
        }
        const done = new Promise<void>((resolve, reject) => {
          pendingResolveRef.current = resolve;
          pendingRejectRef.current = reject;
        });
        try {
          await IAP.requestPurchase({ request: { ios: { sku } }, type: "subs" } as any);
        } catch (e: any) {
          pendingResolveRef.current = null;
          pendingRejectRef.current = null;
          throw e;
        }
        await done;
        Alert.alert("Subscribed", "Your plan is now active.");
        router.back();
      } else {
        // Web / Android — Square hosted checkout.
        const res = await api<{ checkout_url: string }>("/billing/checkout", {
          method: "POST",
          body: { plan: selectedPlan, period, addons: selectedAddons },
        });
        await Linking.openURL(res.checkout_url);
      }
    } catch (e: any) {
      const msg = e?.message || "Billing is not yet configured.";
      if (msg === "cancelled") {
        // user dismissed the Apple sheet — silent
      } else if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const manageSubscription = async () => {
    setPortalBusy(true);
    try {
      if (isIOS) {
        // Apple-managed subscriptions are cancelled/changed in App Store settings.
        await Linking.openURL("https://apps.apple.com/account/subscriptions");
      } else {
        const res = await api<{ portal_url: string }>("/billing/portal", { method: "POST" });
        await Linking.openURL(res.portal_url);
      }
    } catch (e: any) {
      const msg = e?.message || "Could not open billing portal.";
      if (typeof window !== "undefined") window.alert(msg);
    } finally {
      setPortalBusy(false);
    }
  };

  const totalMonthly = ADDONS.filter((a) => selectedAddons.includes(a.key)).reduce(
    (sum, a) => sum + a.price, 0
  );
  const basePlan = PLANS.find((p) => p.key === selectedPlan)!;
  const basePrice = period === "monthly" ? basePlan.monthly : basePlan.annual;
  const totalPrice = period === "monthly" ? basePrice + totalMonthly : basePrice + totalMonthly * 12;

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]} testID="subscription-screen">
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} testID="subscription-back-btn">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type.overline, { color: colors.text }]}>Plan &amp; Billing</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Current plan status */}
        {isActive && (
          <View style={styles.currentPlanBadge}>
            <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
            <Text style={styles.currentPlanText}>
              Active: {planLabel(currentPlan, user?.plan_period ?? "monthly")}
              {(user?.plan_addons ?? []).length > 0 ? ` + ${(user?.plan_addons ?? []).join(", ")}` : ""}
            </Text>
            <TouchableOpacity onPress={manageSubscription} disabled={portalBusy}>
              {portalBusy ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={styles.manageLink}>Manage →</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <Text style={[type.h2, { marginBottom: 8 }]}>Choose your plan</Text>
        <Text style={[type.bodySm, { color: colors.textSecondary, marginBottom: space.lg }]}>
          Sign up for a year and get 3 months free.
        </Text>

        {/* Period toggle */}
        <View style={styles.periodToggle}>
          {(["monthly", "annual"] as Period[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => setPeriod(p)}
              testID={`subscription-period-${p}`}
            >
              <Text style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}>
                {p === "monthly" ? "Monthly" : "Annual"}
              </Text>
              {p === "annual" && (
                <View style={styles.saveBadge}>
                  <Text style={styles.saveBadgeText}>3 months free</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Plan cards */}
        <View style={{ gap: 10, marginBottom: space.lg }}>
          {PLANS.map((plan) => {
            const price = period === "monthly" ? plan.monthly : plan.annual;
            const suffix = period === "monthly" ? "/mo" : "/yr";
            const isSelected = selectedPlan === plan.key;
            return (
              <TouchableOpacity
                key={plan.key}
                testID={`subscription-plan-${plan.key}`}
                style={[styles.planCard, isSelected && styles.planCardActive]}
                onPress={() => setSelectedPlan(plan.key)}
              >
                <View style={styles.planCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planName, isSelected && { color: colors.accent }]}>{plan.name}</Text>
                    <Text style={styles.planDesc}>{plan.description}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.planPrice, isSelected && { color: colors.accent }]}>
                      ${price.toFixed(2)}
                    </Text>
                    <Text style={styles.planSuffix}>{suffix}</Text>
                  </View>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.accent} style={{ marginLeft: 10 }} />
                  ) : (
                    <View style={[styles.radioEmpty, { marginLeft: 10 }]} />
                  )}
                </View>
                <View style={{ gap: 4, marginTop: 8 }}>
                  {plan.features.map((f) => (
                    <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="checkmark-outline" size={13} color={colors.textSecondary} />
                      <Text style={styles.featureText}>{f}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Add-ons — web/Android only (iOS would require separate IAP products) */}
        {!isIOS && <Text style={[type.overline, { marginBottom: space.sm }]}>Add-ons</Text>}
        <View style={{ gap: 10, marginBottom: space.xl, display: isIOS ? "none" : "flex" }}>
          {ADDONS.map((addon) => {
            const active = selectedAddons.includes(addon.key);
            return (
              <TouchableOpacity
                key={addon.key}
                testID={`subscription-addon-${addon.key}`}
                style={[styles.addonCard, active && styles.addonCardActive]}
                onPress={() => toggleAddon(addon.key)}
              >
                <Ionicons name={addon.icon} size={20} color={active ? colors.accent : colors.textSecondary} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.addonLabel, active && { color: colors.accent }]}>{addon.label}</Text>
                  <Text style={styles.addonDesc}>{addon.description}</Text>
                </View>
                <Text style={[styles.addonPrice, active && { color: colors.accent }]}>+${addon.price}/mo</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Total + checkout */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalPrice}>
            ${totalPrice.toFixed(2)}{period === "monthly" ? "/mo" : "/yr"}
          </Text>
        </View>

        <TouchableOpacity
          testID="subscription-checkout-btn"
          style={[styles.checkoutBtn, busy && { opacity: 0.6 }]}
          onPress={checkout}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.checkoutBtnText}>Continue to payment</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Every $1 spent earns 50 points. Cancel anytime from billing settings.
        </Text>
      </ScrollView>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  scroll: { padding: space.lg, paddingBottom: 120 },
  currentPlanBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(197,160,89,0.08)",
    borderWidth: 1,
    borderColor: colors.accent,
    padding: 12,
    marginBottom: space.lg,
    borderRadius: 2,
  },
  currentPlanText: { flex: 1, color: colors.accent, fontSize: 13, fontWeight: "600" },
  manageLink: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  periodToggle: { flexDirection: "row", gap: 8, marginBottom: space.lg },
  periodBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    gap: 4,
  },
  periodBtnActive: { borderColor: colors.accent, backgroundColor: "rgba(197,160,89,0.08)" },
  periodBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  periodBtnTextActive: { color: colors.accent },
  saveBadge: { backgroundColor: colors.accent, borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2 },
  saveBadgeText: { color: colors.textInverse, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  planCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
    padding: space.md,
    borderRadius: 2,
  },
  planCardActive: { borderColor: colors.accent, backgroundColor: "rgba(197,160,89,0.06)" },
  planCardHeader: { flexDirection: "row", alignItems: "center" },
  planName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  planDesc: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  planPrice: { color: colors.text, fontSize: 18, fontWeight: "800" },
  planSuffix: { color: colors.textSecondary, fontSize: 11 },
  featureText: { color: colors.textSecondary, fontSize: 12 },
  radioEmpty: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border },
  addonCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
    padding: space.md,
    borderRadius: 2,
  },
  addonCardActive: { borderColor: colors.accent, backgroundColor: "rgba(197,160,89,0.06)" },
  addonLabel: { color: colors.text, fontSize: 14, fontWeight: "600" },
  addonDesc: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  addonPrice: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginBottom: space.md },
  totalLabel: { color: colors.text, fontSize: 14, fontWeight: "600" },
  totalPrice: { color: colors.accent, fontSize: 20, fontWeight: "800" },
  checkoutBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 2,
  },
  checkoutBtnText: { color: colors.textInverse, fontWeight: "700", letterSpacing: 1, fontSize: 14 },
  disclaimer: { color: colors.textSecondary, fontSize: 11, textAlign: "center", marginTop: space.md, lineHeight: 16 },
});
