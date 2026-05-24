import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

import { api, setToken, clearToken, getToken } from "@/src/lib/api";

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  dob?: string | null;
  gender?: string | null;
  style_preferences: string[];
  lifestyle?: string | null;
  fidelity_mode: string;
  onboarding_complete: boolean;
  auth_provider: string;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
};

const Ctx = createContext<AuthState | null>(null);

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const t = await getToken();
      if (!t) {
        setUserState(null);
        return;
      }
      const res = await api<{ user: User }>("/auth/me");
      setUserState(res.user);
    } catch {
      await clearToken();
      setUserState(null);
    }
  }, []);

  // On web, after Google redirect we land back here with #session_id=... or ?session_id=...
  // Process it BEFORE checking existing session.
  const consumeWebSessionId = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "web" || typeof window === "undefined") return false;
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    let sid: string | null = null;
    if (hash.includes("session_id=")) {
      sid = new URLSearchParams(hash.replace(/^#/, "")).get("session_id");
    } else if (search.includes("session_id=")) {
      sid = new URLSearchParams(search).get("session_id");
    }
    if (!sid) return false;
    try {
      const res = await api<{ token: string; user: User }>("/auth/google/session", {
        method: "POST",
        body: { session_token: sid },
        auth: false,
      });
      await setToken(res.token);
      setUserState(res.user);
      // Clean the URL so it's not re-processed
      window.history.replaceState(null, "", window.location.pathname);
      return true;
    } catch (e) {
      console.warn("Google session exchange failed", e);
      window.history.replaceState(null, "", window.location.pathname);
      return false;
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const consumed = await consumeWebSessionId();
      if (!consumed) {
        await refresh();
      }
      setLoading(false);
    })();
  }, [refresh, consumeWebSessionId]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    await setToken(res.token);
    setUserState(res.user);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const res = await api<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: { email, password, name },
      auth: false,
    });
    await setToken(res.token);
    setUserState(res.user);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    // Mobile redirect URI: exp://... in Expo Go, scheme://auth in builds
    const redirectUrl =
      Platform.OS === "web"
        ? (typeof window !== "undefined" ? window.location.origin + "/" : "")
        : Linking.createURL("auth");

    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.location.href = authUrl;
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type !== "success" || !result.url) {
      throw new Error("Google sign-in cancelled");
    }
    // Extract session_id from URL (hash or query)
    const url = result.url;
    let sessionId: string | null = null;
    const hashIdx = url.indexOf("#");
    if (hashIdx >= 0) {
      const hash = url.slice(hashIdx + 1);
      const params = new URLSearchParams(hash);
      sessionId = params.get("session_id");
    }
    if (!sessionId) {
      const qIdx = url.indexOf("?");
      if (qIdx >= 0) {
        const params = new URLSearchParams(url.slice(qIdx + 1));
        sessionId = params.get("session_id");
      }
    }
    if (!sessionId) throw new Error("No session_id returned from Google");

    const res = await api<{ token: string; user: User }>("/auth/google/session", {
      method: "POST",
      body: { session_token: sessionId },
      auth: false,
    });
    await setToken(res.token);
    setUserState(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await clearToken();
    setUserState(null);
  }, []);

  return (
    <Ctx.Provider
      value={{ user, loading, login, register, loginWithGoogle, logout, refresh, setUser: setUserState }}
    >
      {children}
    </Ctx.Provider>
  );
}
