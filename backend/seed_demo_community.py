"""Populate the App Review demo account with the community content Apple asked for.

App Review rejected build 17 with: "make sure the demo accounts you provide include
pre-populated content so that we can verify all the features in the app, such as
friends, items to swap, community features and activity feed."

This creates three realistic member accounts, gives each a small coherent wardrobe,
makes them friends of the demo account, and has them list items to the Swap Box and
the Donate & Swap community feed. Their listing activity is what fills the demo
account's activity feed (the backend records an activity row per listing).

Everything goes through the public API with each member's own token — no direct DB
access, so it runs anywhere. Re-running is safe: members that already exist are
reused and steps that are already done are skipped.

    python seed_demo_community.py            # report what it would do
    python seed_demo_community.py --apply    # make the changes
"""
import sys
import time
import urllib.error
import urllib.request
import json

BASE = "https://backend-gamma-gules-79.vercel.app/api"
DEMO_EMAIL = "applereview@wardrobe-demo.com"
DEMO_PASSWORD = "Review2026!Wardrobe"
MEMBER_PASSWORD = "Wardrobe2026!Demo"

# Real members a reviewer would expect to see, each with a coherent wardrobe:
# the photo, the name and the tags describe the same garment.
MEMBERS = [
    {
        "name": "Maya Chen",
        "email": "maya.chen@wardrobe-demo.com",
        "items": [
            {
                "name": "Camel Wool Overcoat",
                "image_url": "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=900&q=80",
                "tags": {"type": "coat", "category": "outerwear", "color": "camel", "material": "wool",
                         "pattern": "solid", "season": ["fall", "winter"], "occasion": ["work", "everyday"],
                         "formality": "smart casual", "description": "a camel wool overcoat"},
                "swap": {"points_cost": 250, "description": "Warm and barely worn — sized a little long on me."},
            },
            {
                "name": "Cream Cable Knit Sweater",
                "image_url": "https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=900&q=80",
                "tags": {"type": "sweater", "category": "tops", "color": "cream", "material": "wool",
                         "pattern": "cable knit", "season": ["fall", "winter"], "occasion": ["everyday"],
                         "formality": "casual", "description": "a cream cable knit sweater"},
                "donate": True,
            },
        ],
    },
    {
        "name": "Daniel Ruiz",
        "email": "daniel.ruiz@wardrobe-demo.com",
        "items": [
            {
                "name": "Indigo Selvedge Jeans",
                "image_url": "https://images.unsplash.com/photo-1542272604-787c3835535d?w=900&q=80",
                "tags": {"type": "jeans", "category": "bottoms", "color": "indigo", "material": "denim",
                         "pattern": "solid", "season": ["all"], "occasion": ["everyday", "weekend"],
                         "formality": "casual", "description": "indigo selvedge denim jeans"},
                "swap": {"points_cost": 180, "description": "Great denim, just never broke them in properly."},
            },
            {
                "name": "White Leather Sneakers",
                "image_url": "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=900&q=80",
                "tags": {"type": "sneakers", "category": "shoes", "color": "white", "material": "leather",
                         "pattern": "solid", "season": ["spring", "summer"], "occasion": ["everyday"],
                         "formality": "casual", "description": "white leather sneakers"},
                "donate": True,
            },
        ],
    },
    {
        "name": "Priya Nair",
        "email": "priya.nair@wardrobe-demo.com",
        "items": [
            {
                "name": "Emerald Silk Midi Dress",
                "image_url": "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=900&q=80",
                "tags": {"type": "dress", "category": "dresses", "color": "emerald", "material": "silk",
                         "pattern": "solid", "season": ["spring", "summer"], "occasion": ["dinner", "party"],
                         "formality": "formal", "description": "an emerald green silk midi dress"},
                "swap": {"points_cost": 300, "description": "Worn once to a wedding. Looking for something to swap."},
            },
            {
                "name": "Tan Leather Tote",
                "image_url": "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=900&q=80",
                "tags": {"type": "bag", "category": "accessories", "color": "tan", "material": "leather",
                         "pattern": "solid", "season": ["all"], "occasion": ["work"],
                         "formality": "smart casual", "description": "a tan leather tote bag"},
                "donate": True,
            },
        ],
    },
]

APPLY = "--apply" in sys.argv


def call(method, path, token=None, body=None, quiet=False):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=90) as r:
            return json.loads(r.read().decode() or "{}"), None
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:200]
        if not quiet:
            print(f"      HTTP {e.code} {method} {path}: {detail}")
        return None, e.code
    except Exception as e:  # network hiccup
        if not quiet:
            print(f"      ERROR {method} {path}: {e}")
        return None, -1


def login(email, password):
    res, _ = call("POST", "/auth/login", body={"email": email, "password": password}, quiet=True)
    return res.get("token") if res else None


def ensure_member(m):
    """Log the member in, registering them first if they do not exist yet."""
    token = login(m["email"], MEMBER_PASSWORD)
    if token:
        return token, False
    if not APPLY:
        return None, True
    res, _ = call("POST", "/auth/register",
                  body={"email": m["email"], "password": MEMBER_PASSWORD, "name": m["name"]})
    return (res.get("token") if res else None), True


def main():
    print(f"{'APPLY' if APPLY else 'DRY RUN'} — seeding demo community content\n")

    demo_token = login(DEMO_EMAIL, DEMO_PASSWORD)
    if not demo_token:
        print("Could not log in as the demo account. Aborting.")
        return 1
    print(f"demo account OK ({DEMO_EMAIL})")

    for m in MEMBERS:
        print(f"\n{m['name']} <{m['email']}>")
        token, created = ensure_member(m)
        if not token:
            print("   would create account" if not APPLY else "   FAILED to create account")
            continue
        print("   account created" if created else "   account exists")

        # 1. Wardrobe items (explicit tags, so no AI call is needed)
        existing, _ = call("GET", "/items", token=token)
        have = {i.get("name") for i in (existing or {}).get("items", [])}
        for spec in m["items"]:
            if spec["name"] in have:
                print(f"   item exists: {spec['name']}")
                continue
            if not APPLY:
                print(f"   would add item: {spec['name']}")
                continue
            res, _ = call("POST", "/items", token=token, body={
                "image_url": spec["image_url"], "name": spec["name"], "tags": spec["tags"],
            })
            item_id = (res or {}).get("item", {}).get("item_id")
            print(f"   added item: {spec['name']} -> {item_id}")
            spec["_item_id"] = item_id
            time.sleep(0.3)

        # re-read so we have ids whether or not we just created them
        after, _ = call("GET", "/items", token=token)
        by_name = {i.get("name"): i.get("item_id") for i in (after or {}).get("items", [])}

        # 2. Swap Box listing
        mine, _ = call("GET", "/swapbox/mine", token=token)
        listed = {s.get("item_id") for s in (mine or {}).get("items", (mine or {}).get("listings", []))}
        for spec in m["items"]:
            if "swap" not in spec:
                continue
            item_id = by_name.get(spec["name"])
            if not item_id or item_id in listed:
                print(f"   swap already listed: {spec['name']}")
                continue
            if not APPLY:
                print(f"   would list to Swap Box: {spec['name']} ({spec['swap']['points_cost']} pts)")
                continue
            res, _ = call("POST", "/swapbox", token=token, body={
                "item_id": item_id,
                "description": spec["swap"]["description"],
                "points_cost": spec["swap"]["points_cost"],
            })
            print(f"   listed to Swap Box: {spec['name']} -> {(res or {}).get('swap_box_id')}")

        # 3. Community (Donate & Swap) listing
        for spec in m["items"]:
            if not spec.get("donate"):
                continue
            item_id = by_name.get(spec["name"])
            if not item_id:
                continue
            if not APPLY:
                print(f"   would list to Community (donate): {spec['name']}")
                continue
            call("PATCH", f"/items/{item_id}/listing", token=token, body={"status": "donate"})
            print(f"   listed to Community (donate): {spec['name']}")

        # 4. Friend request -> demo account accepts
        if not APPLY:
            print("   would send friend request to the demo account")
        else:
            _, code = call("POST", "/friends/request", token=token, body={"email": DEMO_EMAIL}, quiet=True)
            if code == 400:
                print("   already friends / request pending")
            elif code is None:
                print("   friend request sent")
            else:
                print(f"   friend request failed (HTTP {code})")

    # 5. Demo account accepts everything pending
    if APPLY:
        reqs, _ = call("GET", "/friends/requests", token=demo_token)
        pending = [r for r in (reqs or {}).get("requests", []) if r.get("to_user_id")]
        for r in (reqs or {}).get("requests", []):
            rid = r.get("request_id")
            if not rid:
                continue
            _, code = call("POST", f"/friends/request/{rid}/respond", token=demo_token,
                           body={"action": "accept"}, quiet=True)
            if code is None:
                print(f"\naccepted friend request from {r.get('from_name')}")

        print("\n=== what the reviewer now sees on the demo account ===")
        for label, path, key in (("friends", "/friends", "friends"),
                                 ("swap box", "/swapbox", "items"),
                                 ("community", "/items/listings/community", "items"),
                                 ("activity feed", "/activity-feed", "events")):
            res, _ = call("GET", path, token=demo_token)
            rows = (res or {}).get(key) or (res or {}).get("listings") or []
            print(f"   {label:14s}: {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
