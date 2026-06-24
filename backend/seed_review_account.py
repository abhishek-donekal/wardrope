"""Seed the App Review demo account with wardrobe items + outfits.

Run against the live backend. Idempotent-ish: skips items if closet already has 10+.
"""
import os
import sys
import time
import httpx

API = os.environ.get("WARDROPE_API", "https://backend-gamma-gules-79.vercel.app")
EMAIL = "appreview@wardrope.com"
PASSWORD = "AppReview2026!"

ITEMS = [
    {"name": "Cream Silk Blouse", "image_url": "https://images.unsplash.com/photo-1564257577-2d3ee8740b15?w=800&q=80",
     "tags": {"type": "blouse", "category": "tops", "color": "cream", "pattern": "solid", "material": "silk",
              "season": ["spring", "fall"], "occasion": ["work", "evening"], "formality": "smart-casual",
              "description": "Cream silk button-down blouse"}},
    {"name": "Black Slim Jeans", "image_url": "https://images.unsplash.com/photo-1542272604-787c3835535d?w=800&q=80",
     "tags": {"type": "jeans", "category": "bottoms", "color": "black", "pattern": "solid", "material": "denim",
              "season": ["fall", "winter", "spring"], "occasion": ["casual", "work"], "formality": "smart-casual",
              "description": "Washed black slim-fit jeans"}},
    {"name": "Camel Wool Trench", "image_url": "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&q=80",
     "tags": {"type": "trench coat", "category": "outerwear", "color": "camel", "pattern": "solid", "material": "wool",
              "season": ["fall", "winter"], "occasion": ["work", "evening"], "formality": "smart-casual",
              "description": "Classic camel wool trench coat"}},
    {"name": "White Cotton Tee", "image_url": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80",
     "tags": {"type": "t-shirt", "category": "tops", "color": "white", "pattern": "solid", "material": "cotton",
              "season": ["spring", "summer"], "occasion": ["casual"], "formality": "casual",
              "description": "White crew-neck cotton tee"}},
    {"name": "Indigo Selvedge Denim", "image_url": "https://images.unsplash.com/photo-1602293589930-45aad59ba3ab?w=800&q=80",
     "tags": {"type": "jeans", "category": "bottoms", "color": "indigo", "pattern": "solid", "material": "denim",
              "season": ["fall", "winter", "spring"], "occasion": ["casual"], "formality": "casual",
              "description": "Raw indigo selvedge denim"}},
    {"name": "Charcoal Wool Blazer", "image_url": "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800&q=80",
     "tags": {"type": "blazer", "category": "outerwear", "color": "charcoal", "pattern": "solid", "material": "wool",
              "season": ["fall", "winter", "spring"], "occasion": ["work", "formal"], "formality": "formal",
              "description": "Tailored charcoal wool blazer"}},
    {"name": "Little Black Dress", "image_url": "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&q=80",
     "tags": {"type": "dress", "category": "dresses", "color": "black", "pattern": "solid", "material": "crepe",
              "season": ["fall", "winter", "spring", "summer"], "occasion": ["evening", "formal"], "formality": "formal",
              "description": "Classic little black cocktail dress"}},
    {"name": "White Leather Sneakers", "image_url": "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&q=80",
     "tags": {"type": "sneakers", "category": "shoes", "color": "white", "pattern": "solid", "material": "leather",
              "season": ["spring", "summer", "fall"], "occasion": ["casual"], "formality": "casual",
              "description": "Minimalist white leather sneakers"}},
    {"name": "Black Leather Loafers", "image_url": "https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=800&q=80",
     "tags": {"type": "loafers", "category": "shoes", "color": "black", "pattern": "solid", "material": "leather",
              "season": ["fall", "winter", "spring"], "occasion": ["work", "formal"], "formality": "smart-casual",
              "description": "Polished black leather loafers"}},
    {"name": "Beige Cashmere Sweater", "image_url": "https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=800&q=80",
     "tags": {"type": "sweater", "category": "tops", "color": "beige", "pattern": "solid", "material": "cashmere",
              "season": ["fall", "winter"], "occasion": ["casual", "work"], "formality": "smart-casual",
              "description": "Soft beige cashmere crewneck"}},
    {"name": "Navy Tailored Trousers", "image_url": "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800&q=80",
     "tags": {"type": "trousers", "category": "bottoms", "color": "navy", "pattern": "solid", "material": "wool",
              "season": ["fall", "winter", "spring"], "occasion": ["work", "formal"], "formality": "formal",
              "description": "Navy wool tailored trousers"}},
    {"name": "Silk Scarf - Floral", "image_url": "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=800&q=80",
     "tags": {"type": "scarf", "category": "accessories", "color": "multicolor", "pattern": "floral", "material": "silk",
              "season": ["spring", "fall"], "occasion": ["work", "evening"], "formality": "smart-casual",
              "description": "Floral printed silk scarf"}},
]

OUTFITS = [
    {"title": "Editor at Work", "occasion": "work",
     "description": "Cream silk blouse tucked into navy trousers with the camel trench layered over — quiet authority.",
     "match_names": ["Cream Silk Blouse", "Navy Tailored Trousers", "Camel Wool Trench", "Black Leather Loafers"]},
    {"title": "Off-Duty Minimal", "occasion": "casual",
     "description": "White tee, indigo denim, white sneakers. The kind of look that whispers rather than shouts.",
     "match_names": ["White Cotton Tee", "Indigo Selvedge Denim", "White Leather Sneakers"]},
    {"title": "Evening Power", "occasion": "evening",
     "description": "Little black dress with the charcoal blazer for sharpness. Loafers keep it grounded.",
     "match_names": ["Little Black Dress", "Charcoal Wool Blazer", "Black Leather Loafers"]},
]


def login() -> str:
    r = httpx.post(f"{API}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    r.raise_for_status()
    return r.json()["token"]


def complete_onboarding(token: str) -> None:
    body = {
        "dob": "1995-06-15",
        "gender": "non-binary",
        "style_preferences": ["minimalist", "classic", "smart-casual"],
        "lifestyle": "Office + weekend outings, occasional formal events.",
        "fidelity_mode": "descriptive",
        "onboarding_complete": True,
        "name": "App Reviewer",
        "stylist_persona": "editor",
        "theme_id": "editorial",
    }
    r = httpx.put(f"{API}/api/users/me/profile", json=body, headers={"Authorization": f"Bearer {token}"}, timeout=20)
    print(f"profile: HTTP {r.status_code}")
    r.raise_for_status()


def existing_items(token: str) -> list:
    r = httpx.get(f"{API}/api/items", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    r.raise_for_status()
    return r.json().get("items", [])


def seed_items(token: str) -> dict:
    name_to_id = {}
    for spec in ITEMS:
        body = {
            "image_url": spec["image_url"],
            "name": spec["name"],
            "tags": spec["tags"],
            "fidelity_mode": "descriptive",
        }
        r = httpx.post(f"{API}/api/items", json=body, headers={"Authorization": f"Bearer {token}"}, timeout=30)
        if r.status_code != 200:
            print(f"  FAIL [{r.status_code}] {spec['name']}: {r.text[:200]}")
            continue
        item = r.json()["item"]
        name_to_id[spec["name"]] = item["item_id"]
        print(f"  OK item: {spec['name']} -> {item['item_id']}")
        time.sleep(0.4)
    return name_to_id


def seed_outfits(token: str, name_to_id: dict) -> None:
    for o in OUTFITS:
        ids = [name_to_id[n] for n in o["match_names"] if n in name_to_id]
        if len(ids) < 2:
            print(f"  SKIP outfit {o['title']} - missing items")
            continue
        body = {
            "title": o["title"],
            "item_ids": ids,
            "description": o["description"],
            "occasion": o["occasion"],
            "rating": 5,
        }
        r = httpx.post(f"{API}/api/outfits", json=body, headers={"Authorization": f"Bearer {token}"}, timeout=30)
        print(f"  outfit {o['title']}: HTTP {r.status_code}")


def main() -> int:
    print(f"Logging in as {EMAIL}")
    token = login()
    print("OK logged in")

    print("Completing onboarding")
    complete_onboarding(token)

    existing = existing_items(token)
    if len(existing) >= len(ITEMS):
        print(f"closet already has {len(existing)} items — skipping item seed")
        existing_by_name = {it["name"]: it["item_id"] for it in existing}
        name_to_id = existing_by_name
    else:
        print(f"closet has {len(existing)} items, seeding {len(ITEMS)}")
        name_to_id = seed_items(token)
        if existing:
            for it in existing:
                name_to_id.setdefault(it["name"], it["item_id"])

    print(f"Seeding {len(OUTFITS)} outfits")
    seed_outfits(token, name_to_id)

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
