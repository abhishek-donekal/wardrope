import { ScrollView, Text, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, type, space } from "@/src/theme";

export default function PrivacyPolicy() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[type.overline, { color: colors.text }]}>Privacy Policy</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>Last updated: June 2026</Text>

        <Text style={styles.h2}>1. Information We Collect</Text>
        <Text style={styles.body}>
          We collect the information you provide when creating an account (name, email address, and optionally a phone number). When you add clothing items, we store photos you upload and AI-generated tags describing those items (color, type, material, etc.). We do not use your photos for any purpose other than powering your personal wardrobe.
        </Text>

        <Text style={styles.h2}>2. How We Use Your Information</Text>
        <Text style={styles.body}>
          Your information is used solely to operate and improve the Wardrobe service — to catalog your wardrobe, generate outfit suggestions, and provide account features. We do not sell your personal data to third parties.
        </Text>

        <Text style={styles.h2}>3. AI Processing</Text>
        <Text style={styles.body}>
          Photos you upload are sent to Anthropic's Claude API for clothing recognition and outfit suggestions. Anthropic's data handling is governed by their privacy policy at anthropic.com. Images are not stored by Anthropic beyond the processing of each individual request.
        </Text>

        <Text style={styles.h2}>4. Image Storage</Text>
        <Text style={styles.body}>
          Clothing photos are stored securely in Amazon S3 (AWS) with private access controls. Only you can view your wardrobe images through the Wardrobe app.
        </Text>

        <Text style={styles.h2}>5. Authentication</Text>
        <Text style={styles.body}>
          Email and phone verification is handled by Twilio Verify. If you sign in with Google, your Google profile email and name are used to create your account. We do not store your Google password.
        </Text>

        <Text style={styles.h2}>6. Data Retention</Text>
        <Text style={styles.body}>
          Your account and wardrobe data are retained as long as your account is active. You may request deletion of your account and all associated data by contacting us at privacy@Wardrobe.app. We will process deletion requests within 30 days.
        </Text>

        <Text style={styles.h2}>7. Security</Text>
        <Text style={styles.body}>
          Passwords are hashed using bcrypt. All data is transmitted over HTTPS. We take reasonable measures to protect your information but cannot guarantee absolute security.
        </Text>

        <Text style={styles.h2}>8. Children's Privacy</Text>
        <Text style={styles.body}>
          Wardrobe is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected such data, please contact us immediately.
        </Text>

        <Text style={styles.h2}>9. Changes to This Policy</Text>
        <Text style={styles.body}>
          We may update this privacy policy from time to time. We will notify you of significant changes via email or in-app notification. Continued use of the app after changes constitutes acceptance of the updated policy.
        </Text>

        <Text style={styles.h2}>10. Contact Us</Text>
        <Text style={styles.body}>
          For privacy-related questions or data deletion requests, contact us at:{"\n"}
          privacy@Wardrobe.app
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
  content: { padding: space.lg, paddingBottom: 60 },
  updated: { color: colors.textSecondary, fontSize: 12, marginBottom: space.xl },
  h2: { color: colors.text, fontSize: 15, fontWeight: "700", marginTop: space.xl, marginBottom: space.sm },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
});
