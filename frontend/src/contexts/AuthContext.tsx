import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as AppleAuthentication from "expo-apple-authentication";

import { api, setToken, clearToken, getToken, setDemoMode } from "@/src/lib/api";
import { DEMO_USER } from "@/src/demo/mockData";

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
  email_verified: boolean;
  phone?: string | null;
  phone_verified: boolean;
  points: number;
  stylist_persona: string;
  theme_id: string;
  plan_type: string;
  plan_period: string;
  plan_addons: string[];
  subscription_status: string;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, phone?: string, referralCode?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
  isDemoMode: boolean;
  enterDemoMode: () => void;
  exitDemoMode: () => Promise<void>;
  googleAuthError: string | null;
  clearGoogleAuthError: () => void;
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
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);

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
    const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
    const searchParams = new URLSearchParams(search);
    sid = hashParams.get("session_id") || hashParams.get("session_token") ||
          searchParams.get("session_id") || searchParams.get("session_token");
    // If no session_id found, check what params ARE in the URL for debugging
    if (!sid) {
      if (search || hash) {
        setGoogleAuthError(`Sign-in redirect received but missing session token. URL params: ${search}${hash}`);
        window.history.replaceState(null, "", window.location.pathname);
      }
      return false;
    }
    try {
      const res = await api<{ token: string; user: User }>("/auth/google/session", {
        method: "POST",
        body: { session_token: sid },
        auth: false,
      });
      await setToken(res.token);
      setUserState(res.user);
      setGoogleAuthError(null);
      // Clean the URL so it's not re-processed
      window.history.replaceState(null, "", window.location.pathname);
      return true;
    } catch (e: any) {
      const msg = e?.message || "Google sign-in failed. Please try again.";
      console.warn("Google session exchange failed", e);
      setGoogleAuthError(msg);
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

  const register = useCallback(async (email: string, password: string, name: string, phone?: string, referralCode?: string) => {
    const res = await api<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: {
        email,
        password,
        name,
        ...(phone ? { phone } : {}),
        ...(referralCode ? { referral_code: referralCode } : {}),
      },
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

  const loginWithApple = useCallback(async () => {
    if (Platform.OS !== "ios") {
      throw new Error("Sign in with Apple is only available on iOS");
    }
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      throw new Error("Sign in with Apple is not available on this device");
    }
    let credential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") {
        throw new Error("Apple sign-in cancelled");
      }
      throw e;
    }
    if (!credential.identityToken) {
      throw new Error("Apple did not return an identity token");
    }
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(" ")
      .trim();
    const res = await api<{ token: string; user: User }>("/auth/apple", {
      method: "POST",
      body: {
        identity_token: credential.identityToken,
        full_name: fullName || undefined,
        email: credential.email || undefined,
      },
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

  const enterDemoMode = () => {
    setDemoMode(true);
    setUserState(DEMO_USER);
    setIsDemoMode(true);
  };

  const exitDemoMode = async () => {
    setDemoMode(false);
    setUserState(null);
    setIsDemoMode(false);
    await clearToken();
  };

  const clearGoogleAuthError = () => setGoogleAuthError(null);

  return (
    <Ctx.Provider
      value={{ user, loading, login, register, loginWithGoogle, loginWithApple, logout, refresh, setUser: setUserState, isDemoMode, enterDemoMode, exitDemoMode, googleAuthError, clearGoogleAuthError }}
    >
      {children}
    </Ctx.Provider>
  );
}
