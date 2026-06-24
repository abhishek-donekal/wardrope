import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/lib/api";
import { useResponsive } from "@/src/hooks/use-responsive";
import { colors, type, space } from "@/src/theme";

type Outfit = {
  title: string;
  description: string;
  item_ids: string[];
  vibe?: string;
};

type Item = {
  item_id: string;
  name: string;
  image_base64: string;
  image_url?: string;
  tags: any;
};

type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; outfits: Outfit[] };

const PROMPTS = [
  "Rooftop dinner tonight, 72°F",
  "Sunday brunch, comfy but chic",
  "Job interview, formal",
  "Beach vacation, 5 days",
];

export default function Stylist() {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "intro",
      role: "assistant",
      text: "Tell me where you're going and I'll style looks from your closet.",
      outfits: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Record<string, Item>>({});
  const scrollRef = useRef<ScrollView>(null);

  const loadItems = useCallback(async () => {
    try {
      const res = await api<{ items: Item[] }>("/items");
      const map: Record<string, Item> = {};
      res.items.forEach((i) => (map[i.item_id] = i));
      setItems(map);
    } catch {}
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const res = await api<{ message: string; outfits: Outfit[] }>("/ai/stylist", {
        method: "POST",
        body: { prompt: text, num_outfits: 4 },
      });
      const assistant: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: res.message,
        outfits: res.outfits || [],
      };
      setMessages((m) => [...m, assistant]);
    } catch (e: any) {
      const errMsg = e?.message || "";
      const friendlyMsg = errMsg.includes("429") || errMsg.toLowerCase().includes("rate")
        ? "You've been styling a lot! Give me a moment — try again in a minute."
        : errMsg.includes("closet") || errMsg.includes("empty")
        ? "Your closet is empty. Add some items first and I'll style them for you."
        : "The stylist is taking a short break. Please try again in a moment.";
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: "assistant", text: friendlyMsg, outfits: [] },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const saveOutfit = async (o: Outfit) => {
    try {
      await api("/outfits", {
        method: "POST",
        body: {
          title: o.title,
          description: o.description,
          item_ids: o.item_ids,
          occasion: o.vibe || "",
        },
      });
    } catch {}
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]} testID="stylist-screen">
      <View style={styles.header}>
        <Text style={type.overline}>AI Stylist</Text>
        <Text style={[type.h2, { marginTop: 4 }]}>Tonight, you'll wear...</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, isTablet && styles.scrollContentTablet]}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((m) => (
          <View key={m.id} style={{ marginBottom: space.lg }}>
            {m.role === "user" ? (
              <View style={styles.userBubble}>
                <Text style={styles.userText}>{m.text}</Text>
              </View>
            ) : (
              <View>
                <Text style={styles.assistantText}>{m.text}</Text>
                {m.outfits.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 12, paddingVertical: space.md }}
                  >
                    {m.outfits.map((o, idx) => (
                      <OutfitCard
                        key={`${m.id}-${idx}`}
                        outfit={o}
                        items={items}
                        onSave={() => saveOutfit(o)}
                      />
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            )}
          </View>
        ))}

        {busy ? (
          <View style={styles.thinking}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={[type.bodySm, { marginLeft: 10 }]}>Composing looks…</Text>
          </View>
        ) : null}

        {messages.length <= 1 ? (
          <View style={styles.prompts}>
            <Text style={[type.overline, { marginBottom: 12 }]}>Try saying</Text>
            {PROMPTS.map((p) => (
              <TouchableOpacity
                key={p}
                testID={`stylist-suggest-${p.slice(0, 8).replace(/\s/g, "-")}`}
                style={styles.prompt}
                onPress={() => send(p)}
              >
                <Ionicons name="sparkles" size={14} color={colors.accent} />
                <Text style={styles.promptText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === "android" ? undefined : "padding"} keyboardVerticalOffset={88}>
        <View style={styles.inputRow}>
          <TextInput
            testID="stylist-input"
            value={input}
            onChangeText={setInput}
            placeholder="Where are you going?"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
            editable={!busy}
          />
          <TouchableOpacity
            testID="stylist-send-btn"
            style={[styles.sendBtn, (!input.trim() || busy) && { opacity: 0.4 }]}
            onPress={() => send(input)}
            disabled={!input.trim() || busy}
          >
            <Ionicons name="arrow-up" size={20} color={colors.textInverse} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function OutfitCard({
  outfit,
  items,
  onSave,
}: {
  outfit: Outfit;
  items: Record<string, Item>;
  onSave: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const pieces = outfit.item_ids.map((id) => items[id]).filter(Boolean);
  return (
    <View style={styles.outfitCard} testID="stylist-outfit-card">
      <View style={styles.outfitImages}>
        {pieces.slice(0, 4).map((p, idx) => (
          <Image
            key={p.item_id}
            source={{ uri: (p as any).image_url || (p.image_base64 ? `data:image/jpeg;base64,${p.image_base64}` : undefined) }}
            style={[
              styles.outfitThumb,
              { left: (idx % 2) * 92, top: Math.floor(idx / 2) * 92 },
            ]}
          />
        ))}
        {pieces.length === 0 ? (
          <View style={styles.outfitEmpty}>
            <Text style={type.bodySm}>{outfit.item_ids.length} items</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.outfitTitle} numberOfLines={2}>{outfit.title}</Text>
      <Text style={styles.outfitDesc} numberOfLines={3}>{outfit.description}</Text>
      <TouchableOpacity
        testID="stylist-save-outfit"
        style={styles.saveBtn}
        onPress={() => {
          if (saved) return;
          onSave();
          setSaved(true);
        }}
      >
        <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={14} color={saved ? colors.accent : colors.text} />
        <Text style={[styles.saveBtnText, saved && { color: colors.accent }]}>{saved ? "Saved" : "Save look"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md },
  scrollContent: { paddingHorizontal: space.lg, paddingBottom: 140 },
  scrollContentTablet: { width: "100%", maxWidth: 760, alignSelf: "center" },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "85%",
    borderRadius: 2,
  },
  userText: { color: colors.textInverse, fontSize: 15 },
  assistantText: { color: colors.text, fontSize: 16, lineHeight: 24 },
  thinking: { flexDirection: "row", alignItems: "center", paddingVertical: space.sm },
  prompts: { marginTop: space.lg },
  prompt: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    borderRadius: 2,
  },
  promptText: { color: colors.text, fontSize: 14 },
  inputRow: {
    flexDirection: "row",
    paddingHorizontal: space.lg,
    paddingTop: 10,
    paddingBottom: 90,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 8,
    alignItems: "center",
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.bgSecondary,
    borderRadius: 2,
  },
  sendBtn: { width: 44, height: 44, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", borderRadius: 2 },
  outfitCard: {
    width: 220,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  outfitImages: {
    width: 196, height: 196, position: "relative", marginBottom: 10, backgroundColor: colors.bgTertiary,
  },
  outfitThumb: { width: 88, height: 88, position: "absolute", margin: 4 },
  outfitEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
  outfitTitle: { color: colors.text, fontSize: 15, fontWeight: "700", marginBottom: 4 },
  outfitDesc: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  saveBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saveBtnText: { color: colors.text, fontSize: 12, letterSpacing: 0.5 },
});
