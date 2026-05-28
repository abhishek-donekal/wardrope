import { storage } from "@/src/utils/storage";
import { DEMO_ITEMS, DEMO_OUTFITS, DEMO_CLOSET } from "@/src/demo/mockData";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "https://backend-lovat-rho-57.vercel.app";

let _demoMode = false;
export function setDemoMode(active: boolean) { _demoMode = active; }
const TOKEN_KEY = "wardrobe_auth_token";

export async function getToken(): Promise<string | null> {
  return (await storage.secureGet<string>(TOKEN_KEY, "")) || null;
}

export async function setToken(token: string): Promise<void> {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await storage.secureRemove(TOKEN_KEY);
}

export type ApiOpts = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: any;
  auth?: boolean;
};

export async function api<T = any>(path: string, opts: ApiOpts = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) {
    const t = await getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  if (_demoMode) {
    if ((!opts.method || opts.method === "GET") && path.startsWith("/items") && !path.includes("/wear")) {
      return { items: DEMO_ITEMS } as T;
    }
    if ((!opts.method || opts.method === "GET") && path.startsWith("/outfits")) {
      return { outfits: DEMO_OUTFITS } as T;
    }
    if ((!opts.method || opts.method === "GET") && path.startsWith("/closets")) {
      return { closets: [DEMO_CLOSET] } as T;
    }
    return {} as T;
  }

  const res = await fetch(`${BASE}/api${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    const msg = data?.detail || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

export async function uploadImageToS3(localUri: string, filename: string = "item.jpg"): Promise<string> {
  // 1. Get presigned URL from our backend
  const { presigned_url, public_url } = await api<{ presigned_url: string; public_url: string; key: string }>(
    "/upload/presign",
    { method: "POST", body: { filename, content_type: "image/jpeg" } }
  );

  // 2. Fetch the local image as a blob and PUT it to S3
  const imageRes = await fetch(localUri);
  const blob = await imageRes.blob();

  const uploadRes = await fetch(presigned_url, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: blob,
  });

  if (!uploadRes.ok) {
    throw new Error(`S3 upload failed with status ${uploadRes.status}`);
  }

  return public_url;
}
