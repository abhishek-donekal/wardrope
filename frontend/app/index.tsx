import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/contexts/AuthContext";
import { colors } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/login");
    } else if (!user.onboarding_complete) {
      router.replace("/onboarding");
    } else {
      router.replace("/(tabs)/closet");
    }
  }, [loading, user, router]);

  return (
    <View style={styles.c} testID="splash-screen">
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
});
