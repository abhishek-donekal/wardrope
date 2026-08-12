"""Seed the App Review demo account so a reviewer sees a real, lived-in wardrobe.

Targets the account handed to Apple in the App Review notes:
    applereview@wardrobe-demo.com / "Apple Review"

What it does, idempotently:
  1. logs in and normalises the profile (display name, persona, onboarding);
  2. deletes placeholder items (placehold.co and other non-photo images);
  3. downloads each garment photo, checks it really is a photo (image/*, >20 KB),
     uploads it to our own S3 via /upload/presign, and creates the item with
     hand-written tags — so the closet never depends on a third-party host staying up;
  4. saves a few outfits so the Looks > Saved tab is not empty.

Every source photo below was opened and visually confirmed to show the garment it
claims (2026-08-12). If a source rots the script fails loudly instead of seeding a
grey box — that is exactly how the closet ended up full of placehold.co images.

Usage:
    python seed_review_account.py            # seed / repair
    python seed_review_account.py --verify   # report only, change nothing
"""
import os
import sys
import time
import httpx

API = os.environ.get("WARDROPE_API", "https://backend-gamma-gules-79.vercel.app").rstrip("/")
EMAIL = os.environ.get("WARDROBE_DEMO_EMAIL", "applereview@wardrobe-demo.com")
PASSWORD = os.environ.get("WARDROBE_DEMO_PASSWORD", "Review2026!Wardrobe")
DISPLAY_NAME = "Apple Review"

MIN_PHOTO_BYTES = 20_000
PLACEHOLDER_HOSTS = ("placehold.co", "placeholder.com", "via.placeholder", "dummyimage.com")

ITEMS = [
    {
        "name": "White Cotton Tee",
        "source": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=1000&q=80&fm=jpg",
        "tags": {"type": "t-shirt", "category": "tops", "color": "white", "pattern": "solid",
                 "material": "cotton", "season": ["spring", "summer"], "occasion": ["casual"],
                 "formality": "casual", "description": "White crew-neck cotton tee"},
    },
    {
        "name": "Sand Graphic Tee",
        "source": "https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=1000&q=80&fm=jpg",
        "tags": {"type": "t-shirt", "category": "tops", "color": "sand", "pattern": "graphic print",
                 "material": "cotton", "season": ["spring", "summer"], "occasion": ["casual"],
                 "formality": "casual", "description": "Sand cotton tee with blue graphic print"},
    },
    {
        "name": "Light Wash Straight Jeans",
        "source": "https://images.unsplash.com/photo-1602293589930-45aad59ba3ab?w=1000&q=80&fm=jpg",
        "tags": {"type": "jeans", "category": "bottoms", "color": "light blue", "pattern": "solid",
                 "material": "denim", "season": ["spring", "summer", "fall"], "occasion": ["casual"],
                 "formality": "casual", "description": "Light wash straight-leg denim jeans"},
    },
    {
        "name": "Black Slim Jeans",
        "source": "https://images.unsplash.com/photo-1542272604-787c3835535d?w=1000&q=80&fm=jpg",
        "tags": {"type": "jeans", "category": "bottoms", "color": "black", "pattern": "solid",
                 "material": "denim", "season": ["fall", "winter", "spring"], "occasion": ["casual", "evening"],
                 "formality": "smart-casual", "description": "Washed black slim-fit jeans"},
    },
    {
        "name": "Khaki Chinos",
        "source": "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=1000&q=80&fm=jpg",
        "tags": {"type": "chinos", "category": "bottoms", "color": "khaki", "pattern": "solid",
                 "material": "cotton twill", "season": ["spring", "summer", "fall"], "occasion": ["casual", "work"],
                 "formality": "smart-casual", "description": "Khaki cotton chinos, tapered"},
    },
    {
        "name": "Rust Bomber Jacket",
        "source": "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=1000&q=80&fm=jpg",
        "tags": {"type": "bomber jacket", "category": "outerwear", "color": "rust", "pattern": "solid",
                 "material": "nylon", "season": ["spring", "fall"], "occasion": ["casual", "evening"],
                 "formality": "casual", "description": "Rust nylon bomber jacket with ribbed collar"},
    },
    {
        "name": "Blue Windowpane Suit Jacket",
        "source": "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=1000&q=80&fm=jpg",
        "tags": {"type": "suit jacket", "category": "outerwear", "color": "blue", "pattern": "windowpane check",
                 "material": "wool", "season": ["fall", "winter", "spring"], "occasion": ["work", "formal"],
                 "formality": "formal", "description": "Blue windowpane wool suit jacket"},
    },
    {
        "name": "Red Silk Evening Gown",
        "source": "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=1000&q=80&fm=jpg",
        "tags": {"type": "gown", "category": "dresses", "color": "red", "pattern": "solid",
                 "material": "silk", "season": ["spring", "summer", "fall"], "occasion": ["evening", "formal"],
                 "formality": "formal", "description": "Full-length red silk evening gown"},
    },
    {
        "name": "Tan Leather Sneakers",
        "source": "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=1000&q=80&fm=jpg",
        "tags": {"type": "sneakers", "category": "shoes", "color": "tan", "pattern": "solid",
                 "material": "canvas", "season": ["spring", "summer", "fall"], "occasion": ["casual"],
                 "formality": "casual", "description": "Tan low-top sneakers with white sole"},
    },
    {
        "name": "Brown Monk Strap Shoes",
        "source": "https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=1000&q=80&fm=jpg",
        "tags": {"type": "monk strap shoes", "category": "shoes", "color": "brown", "pattern": "solid",
                 "material": "leather", "season": ["fall", "winter", "spring"], "occasion": ["work", "formal"],
                 "formality": "formal", "description": "Brown leather double monk strap shoes"},
    },
    {
        "name": "Blue Running Trainers",
        "source": "https://images.pexels.com/photos/1456706/pexels-photo-1456706.jpeg?auto=compress&cs=tinysrgb&w=1000",
        "tags": {"type": "running shoes", "category": "shoes", "color": "blue", "pattern": "solid",
                 "material": "mesh", "season": ["spring", "summer", "fall"], "occasion": ["sport", "casual"],
                 "formality": "casual", "description": "Blue and volt mesh running trainers"},
    },
]

OUTFITS = [
    {"title": "Editor at Work", "occasion": "work", "rating": 5,
     "description": "The windowpane suit softened with a plain white tee, grounded by brown monks. Tailoring without the stiffness.",
     "match_names": ["Blue Windowpane Suit Jacket", "White Cotton Tee", "Brown Monk Strap Shoes"]},
    {"title": "Off-Duty Denim", "occasion": "casual", "rating": 4,
     "description": "White tee, light wash denim, tan sneakers. The uniform you reach for without thinking.",
     "match_names": ["White Cotton Tee", "Light Wash Straight Jeans", "Tan Leather Sneakers"]},
    {"title": "Gallery Opening", "occasion": "evening", "rating": 5,
     "description": "Rust bomber over black slim jeans with the monk straps — colour where it counts, restraint everywhere else.",
     "match_names": ["Rust Bomber Jacket", "Black Slim Jeans", "Brown Monk Strap Shoes"]},
]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def login() -> str:
    r = httpx.post(f"{API}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


def normalise_profile(token: str) -> None:
    body = {
        "name": DISPLAY_NAME,
        "style_preferences": ["minimalist", "classic", "smart-casual"],
        "lifestyle": "Office weekdays, weekend outings, the occasional black-tie evening.",
        "fidelity_mode": "descriptive",
        "onboarding_complete": True,
        "stylist_persona": "editor",
        "theme_id": "editorial",
    }
    r = httpx.put(f"{API}/api/users/me/profile", json=body, headers=_auth(token), timeout=30)
    print(f"profile: HTTP {r.status_code}")
    r.raise_for_status()


def list_items(token: str) -> list:
    r = httpx.get(f"{API}/api/items", headers=_auth(token), timeout=60)
    r.raise_for_status()
    return r.json().get("items", [])


def is_placeholder(item: dict) -> bool:
    url = item.get("image_url") or ""
    if any(h in url for h in PLACEHOLDER_HOSTS):
        return True
    return not url and not (item.get("image_base64") or "")


def download_photo(url: str) -> bytes:
    r = httpx.get(url, timeout=60, follow_redirects=True)
    if r.status_code != 200:
        raise RuntimeError(f"source photo returned HTTP {r.status_code}: {url}")
    ctype = r.headers.get("content-type", "")
    if not ctype.startswith("image/"):
        raise RuntimeError(f"source is not an image ({ctype}): {url}")
    if len(r.content) < MIN_PHOTO_BYTES:
        raise RuntimeError(f"source photo is only {len(r.content)} bytes — likely a placeholder: {url}")
    return r.content


def upload_to_s3(token: str, filename: str, data: bytes) -> str:
    r = httpx.post(
        f"{API}/api/upload/presign",
        json={"filename": filename, "content_type": "image/jpeg"},
        headers=_auth(token),
        timeout=30,
    )
    r.raise_for_status()
    presigned = r.json()
    put = httpx.put(presigned["presigned_url"], content=data, headers={"Content-Type": "image/jpeg"}, timeout=120)
    if put.status_code not in (200, 204):
        raise RuntimeError(f"S3 upload failed: HTTP {put.status_code} {put.text[:200]}")
    return presigned["public_url"]


def create_item(token: str, spec: dict, image_url: str) -> str:
    r = httpx.post(
        f"{API}/api/items",
        json={"image_url": image_url, "name": spec["name"], "tags": spec["tags"], "fidelity_mode": "descriptive"},
        headers=_auth(token),
        timeout=60,
    )
    r.raise_for_status()
    return r.json()["item"]["item_id"]


def delete_item(token: str, item_id: str) -> int:
    r = httpx.delete(f"{API}/api/items/{item_id}", headers=_auth(token), timeout=30)
    return r.status_code


def seed_outfits(token: str, name_to_id: dict) -> None:
    r = httpx.get(f"{API}/api/outfits", headers=_auth(token), timeout=30)
    r.raise_for_status()
    existing = {o["title"] for o in r.json().get("outfits", [])}
    for o in OUTFITS:
        if o["title"] in existing:
            print(f"  outfit already saved: {o['title']}")
            continue
        ids = [name_to_id[n] for n in o["match_names"] if n in name_to_id]
        if len(ids) < 2:
            print(f"  SKIP outfit {o['title']} — items missing")
            continue
        resp = httpx.post(
            f"{API}/api/outfits",
            json={"title": o["title"], "item_ids": ids, "description": o["description"],
                  "occasion": o["occasion"], "rating": o["rating"]},
            headers=_auth(token),
            timeout=30,
        )
        print(f"  outfit {o['title']}: HTTP {resp.status_code}")


def verify(token: str) -> int:
    items = list_items(token)
    print(f"\n{len(items)} items in the demo closet")
    bad = 0
    for it in items:
        url = it.get("image_url") or ""
        if not url:
            print(f"  NO URL   {it['name']} (base64 len {len(it.get('image_base64') or '')})")
            bad += 1
            continue
        try:
            head = httpx.head(url, timeout=30, follow_redirects=True)
            ctype = head.headers.get("content-type", "")
            size = int(head.headers.get("content-length", "0"))
        except Exception as e:
            print(f"  ERROR    {it['name']}: {e}")
            bad += 1
            continue
        ok = head.status_code == 200 and ctype.startswith("image/") and size >= MIN_PHOTO_BYTES
        print(f"  {'OK ' if ok else 'BAD'}  {it['name']:<32} {head.status_code} {ctype} {size}B  {url}")
        if not ok:
            bad += 1
    outfits = httpx.get(f"{API}/api/outfits", headers=_auth(token), timeout=30).json().get("outfits", [])
    print(f"{len(outfits)} saved outfits: {', '.join(o['title'] for o in outfits) or '(none)'}")
    if bad:
        print(f"FAIL: {bad} item(s) without a real photo")
    return bad


def main() -> int:
    verify_only = "--verify" in sys.argv
    print(f"API {API}")
    print(f"Logging in as {EMAIL}")
    token = login()
    print("OK logged in")

    if verify_only:
        return 1 if verify(token) else 0

    normalise_profile(token)

    items = list_items(token)
    for it in items:
        if is_placeholder(it):
            code = delete_item(token, it["item_id"])
            print(f"  removed placeholder item {it['name']} -> HTTP {code}")
    items = [it for it in list_items(token)]
    name_to_id = {it["name"]: it["item_id"] for it in items}

    for spec in ITEMS:
        if spec["name"] in name_to_id:
            print(f"  keeping existing: {spec['name']}")
            continue
        data = download_photo(spec["source"])
        public_url = upload_to_s3(token, spec["name"].lower().replace(" ", "-") + ".jpg", data)
        item_id = create_item(token, spec, public_url)
        name_to_id[spec["name"]] = item_id
        print(f"  OK item: {spec['name']:<32} {len(data)}B -> {public_url}")
        time.sleep(0.3)

    print("Seeding outfits")
    seed_outfits(token, name_to_id)

    return 1 if verify(token) else 0


if __name__ == "__main__":
    sys.exit(main())
