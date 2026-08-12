"""Remove QA leftovers a reviewer can see: test listings in the Community feed and
throwaway QC accounts.

App Review browses Profile -> Donate & Swap -> Community, which lists every other
user's donate/swap items. Records named like "Aud Coat" / "Donate Coat" owned by
"Aud" / "Shop" read as leftover test data (guideline 2.1), so they are un-listed —
the items stay in their owner's closet, they just leave the public feed. QC's
throwaway sign-ups (qc-*@qcwardrobecheck.com) are deleted with the same sweep the
in-app "Delete account" uses.

Needs MONGO_URL (and optionally DB_NAME) in the environment — the same values the
backend runs with. They live in Vercel (project "backend", Production) and are not
committed anywhere.

Usage:
    MONGO_URL='...' python cleanup_review_data.py            # report only
    MONGO_URL='...' python cleanup_review_data.py --apply    # make the changes
"""
import os
import re
import sys

from pymongo import MongoClient

UNLIST_ITEM_IDS = ["itm_ebb3ed0f2815", "itm_8fbda26a9569"]  # "Aud Coat", "Donate Coat"
QC_EMAIL_RE = r"^qc-.*@qcwardrobecheck\.com$"
KEEP_EMAILS = {"applereview@wardrobe-demo.com"}

USER_DATA_COLLECTIONS = [
    "items", "outfits", "closets", "user_sessions", "feedback",
    "swap_box", "service_bookings", "activity_feed", "apple_transactions",
]


def main() -> int:
    uri = os.environ.get("MONGO_URL", "")
    if not uri:
        print("Set MONGO_URL to the production connection string first.", file=sys.stderr)
        return 2
    apply_changes = "--apply" in sys.argv

    db = MongoClient(uri)[os.environ.get("DB_NAME", "wardrobe")]

    print("Community-visible listings:")
    for it in db.items.find({"listing_status": {"$in": ["donate", "swap"]}},
                            {"_id": 0, "item_id": 1, "name": 1, "user_id": 1, "listing_status": 1}):
        owner = db.users.find_one({"user_id": it.get("user_id")}, {"_id": 0, "name": 1}) or {}
        mark = "  <- un-list" if it.get("item_id") in UNLIST_ITEM_IDS else ""
        print(f"  {it.get('item_id')} | {it.get('name')} | {it.get('listing_status')} | "
              f"owner {owner.get('name')}{mark}")

    qc_users = [u for u in db.users.find({"email": {"$regex": QC_EMAIL_RE, "$options": "i"}},
                                         {"_id": 0, "user_id": 1, "email": 1})
                if u["email"].lower() not in KEEP_EMAILS]
    print(f"\nThrowaway QC accounts: {len(qc_users)}")
    for u in qc_users:
        print(f"  {u['email']}")

    if not apply_changes:
        print("\nReport only — re-run with --apply to make these changes.")
        return 0

    unlisted = db.items.update_many({"item_id": {"$in": UNLIST_ITEM_IDS}},
                                    {"$set": {"listing_status": None}})
    print(f"\nUn-listed {unlisted.modified_count} item(s).")

    for u in qc_users:
        assert re.match(QC_EMAIL_RE, u["email"], re.I) and u["email"].lower() not in KEEP_EMAILS
        for coll in USER_DATA_COLLECTIONS:
            db[coll].delete_many({"user_id": u["user_id"]})
        db.friends.delete_many({"$or": [{"from_user_id": u["user_id"]}, {"to_user_id": u["user_id"]}]})
        db.verification_codes.delete_many({"target": u["email"]})
        db.users.delete_one({"user_id": u["user_id"]})
        print(f"Deleted {u['email']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
