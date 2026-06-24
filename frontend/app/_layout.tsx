import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";

import { AuthProvider } from "@/src/contexts/AuthContext";
import { bootThemeFromStorage, ThemeProvider, useTheme } from "@/src/contexts/ThemeContext";
import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { colors } from "@/src/theme";

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { statusBarStyle } = useTheme();

  return (
    <>
      <StatusBar style={statusBarStyle} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [themeReady, setThemeReady] = useState(Platform.OS === "web");

  useEffect(() => {
    if (Platform.OS === "web") return;
    bootThemeFromStorage().then((ready) => {
      if (ready) setThemeReady(true);
    });
  }, []);

  useEffect(() => {
    if ((loaded || error) && themeReady) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error, themeReady]);

  if ((!loaded && !error) || !themeReady) return null;

  return (
    <AuthProvider>
      <ThemeProvider>
        <RootNavigator />
      </ThemeProvider>
    </AuthProvider>
  );
}
