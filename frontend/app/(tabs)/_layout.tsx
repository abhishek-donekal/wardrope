import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: Platform.OS === "android" ? "rgba(5,5,5,0.95)" : "transparent",
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          position: "absolute",
          height: 78,
          paddingTop: 8,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView tint="dark" intensity={60} style={StyleSheet.absoluteFill} />
          ) : null,
        tabBarLabelStyle: { fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="closet"
        options={{
          title: "Closet",
          tabBarIcon: ({ color }) => <Ionicons name="grid-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stylist"
        options={{
          title: "Stylist",
          tabBarIcon: ({ color }) => <Ionicons name="sparkles-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="looks"
        options={{
          title: "Looks",
          tabBarIcon: ({ color }) => <Ionicons name="book-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
