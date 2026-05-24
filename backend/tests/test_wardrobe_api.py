"""
Wardrobe API backend tests
Covers: auth (register/login/me/profile), AI tag-item, items CRUD + filters,
AI stylist, outfits CRUD, lookbooks (list/detail/recreate), camera roll scan,
auth scoping between two users.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


# -------------------- Health --------------------
class TestHealth:
    def test_root(self, http_session):
        r = http_session.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert "model" in data


# -------------------- Auth --------------------
class TestAuth:
    def test_register_returns_token_and_user(self, user_a):
        assert user_a["token"]
        u = user_a["user"]
        assert u["email"] == user_a["email"]
        assert u["auth_provider"] == "email"
        assert u["onboarding_complete"] is False
        assert "user_id" in u and u["user_id"].startswith("user_")

    def test_register_duplicate_email_fails(self, http_session, user_a):
        r = http_session.post(
            f"{API}/auth/register",
            json={"email": user_a["email"], "password": "x" * 8, "name": "dup"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_login_success_returns_token(self, http_session, user_a):
        r = http_session.post(
            f"{API}/auth/login",
            json={"email": user_a["email"], "password": user_a["password"]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and data["token"]
        assert data["user"]["email"] == user_a["email"]

    def test_login_wrong_password(self, http_session, user_a):
        r = http_session.post(
            f"{API}/auth/login",
            json={"email": user_a["email"], "password": "wrongpassword"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_me_with_valid_token(self, http_session, user_a):
        r = http_session.get(f"{API}/auth/me", headers=user_a["headers"], timeout=15)
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["email"] == user_a["email"]
        assert u["user_id"] == user_a["user"]["user_id"]

    def test_me_without_token_401(self, http_session):
        r = http_session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_with_invalid_token_401(self, http_session):
        r = http_session.get(
            f"{API}/auth/me",
            headers={"Authorization": "Bearer not-a-real-token"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_update_profile(self, http_session, user_a):
        payload = {
            "dob": "1990-04-21",
            "gender": "female",
            "lifestyle": "urban professional",
            "style_preferences": ["minimal", "monochrome", "tailored"],
            "fidelity_mode": "descriptive",
            "onboarding_complete": True,
        }
        r = http_session.put(
            f"{API}/users/me/profile", json=payload,
            headers=user_a["headers"], timeout=15,
        )
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["dob"] == "1990-04-21"
        assert u["gender"] == "female"
        assert u["lifestyle"] == "urban professional"
        assert u["style_preferences"] == ["minimal", "monochrome", "tailored"]
        assert u["onboarding_complete"] is True

        # Verify persisted via /auth/me
        r2 = http_session.get(f"{API}/auth/me", headers=user_a["headers"], timeout=15)
        assert r2.status_code == 200
        u2 = r2.json()["user"]
        assert u2["onboarding_complete"] is True
        assert u2["style_preferences"] == ["minimal", "monochrome", "tailored"]


# -------------------- AI tag-item --------------------
class TestAITagItem:
    def test_tag_real_image(self, http_session, user_a, fashion_image_b64):
        r = http_session.post(
            f"{API}/ai/tag-item",
            json={"image_base64": fashion_image_b64},
            headers=user_a["headers"],
            timeout=90,  # GPT-5.2 latency
        )
        assert r.status_code == 200, r.text
        tags = r.json().get("tags")
        assert tags is not None
        assert isinstance(tags.get("category"), str)
        # At least one of the meaningful fields should be populated by GPT
        assert any([
            tags.get("category"),
            tags.get("type"),
            tags.get("color"),
            (tags.get("description") and tags["description"] != "Untagged item"),
        ]), f"Tags came back empty: {tags}"

    def test_tag_requires_auth(self, http_session, fashion_image_b64):
        r = http_session.post(
            f"{API}/ai/tag-item",
            json={"image_base64": fashion_image_b64},
            timeout=30,
        )
        assert r.status_code == 401


# -------------------- Items CRUD --------------------
class TestItemsCRUD:
    def test_create_item_auto_tags(self, http_session, user_a, fashion_image_b64):
        r = http_session.post(
            f"{API}/items",
            json={"image_base64": fashion_image_b64},
            headers=user_a["headers"],
            timeout=120,
        )
        assert r.status_code == 200, r.text
        item = r.json()["item"]
        assert item["item_id"].startswith("itm_")
        assert item["user_id"] == user_a["user"]["user_id"]
        assert item["image_base64"]
        assert "tags" in item
        # Save for later tests
        pytest.item_a_1 = item["item_id"]

    def test_create_item_with_provided_tags(self, http_session, user_a, fashion_image_b64_2):
        tags = {
            "type": "sneakers", "category": "shoes", "color": "black",
            "pattern": "solid", "material": "leather",
            "season": ["spring", "fall"], "occasion": ["casual"],
            "formality": "casual", "description": "black leather sneakers",
        }
        r = http_session.post(
            f"{API}/items",
            json={"image_base64": fashion_image_b64_2, "name": "Black Sneakers", "tags": tags},
            headers=user_a["headers"],
            timeout=30,
        )
        assert r.status_code == 200, r.text
        item = r.json()["item"]
        assert item["name"] == "Black Sneakers"
        assert item["tags"]["category"] == "shoes"
        assert item["tags"]["color"] == "black"
        pytest.item_a_2 = item["item_id"]

    def test_create_item_third(self, http_session, user_a, fashion_image_b64_3):
        tags = {
            "type": "jacket", "category": "outerwear", "color": "beige",
            "pattern": "solid", "material": "wool",
            "season": ["fall", "winter"], "occasion": ["casual", "work"],
            "formality": "smart-casual", "description": "beige wool overcoat",
        }
        r = http_session.post(
            f"{API}/items",
            json={"image_base64": fashion_image_b64_3, "name": "Beige Coat", "tags": tags},
            headers=user_a["headers"],
            timeout=30,
        )
        assert r.status_code == 200, r.text
        pytest.item_a_3 = r.json()["item"]["item_id"]

    def test_list_items(self, http_session, user_a):
        r = http_session.get(f"{API}/items", headers=user_a["headers"], timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 3
        ids = {i["item_id"] for i in items}
        assert pytest.item_a_1 in ids
        assert pytest.item_a_2 in ids
        assert pytest.item_a_3 in ids

    def test_list_items_filter_category(self, http_session, user_a):
        r = http_session.get(
            f"{API}/items", params={"category": "shoes"},
            headers=user_a["headers"], timeout=15,
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(i["tags"]["category"] == "shoes" for i in items)
        assert any(i["item_id"] == pytest.item_a_2 for i in items)

    def test_list_items_filter_color(self, http_session, user_a):
        r = http_session.get(
            f"{API}/items", params={"color": "black"},
            headers=user_a["headers"], timeout=15,
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(i["item_id"] == pytest.item_a_2 for i in items)

    def test_get_item_by_id(self, http_session, user_a):
        r = http_session.get(
            f"{API}/items/{pytest.item_a_2}",
            headers=user_a["headers"], timeout=15,
        )
        assert r.status_code == 200
        item = r.json()["item"]
        assert item["item_id"] == pytest.item_a_2
        assert item["name"] == "Black Sneakers"

    def test_get_item_not_found(self, http_session, user_a):
        r = http_session.get(
            f"{API}/items/itm_doesnotexist",
            headers=user_a["headers"], timeout=15,
        )
        assert r.status_code == 404

    def test_update_item(self, http_session, user_a):
        r = http_session.put(
            f"{API}/items/{pytest.item_a_2}",
            json={"name": "Updated Sneakers", "favorite": True},
            headers=user_a["headers"], timeout=15,
        )
        assert r.status_code == 200, r.text
        item = r.json()["item"]
        assert item["name"] == "Updated Sneakers"
        assert item["favorite"] is True

        # Verify via GET
        r2 = http_session.get(
            f"{API}/items/{pytest.item_a_2}",
            headers=user_a["headers"], timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json()["item"]["favorite"] is True

    def test_list_items_filter_favorite(self, http_session, user_a):
        r = http_session.get(
            f"{API}/items", params={"favorite": "true"},
            headers=user_a["headers"], timeout=15,
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(i["item_id"] == pytest.item_a_2 for i in items)
        assert all(i["favorite"] for i in items)

    def test_items_require_auth(self, http_session):
        r = http_session.get(f"{API}/items", timeout=15)
        assert r.status_code == 401


# -------------------- Auth Scoping --------------------
class TestAuthScoping:
    def test_user_b_cannot_see_user_a_items(self, http_session, user_b):
        r = http_session.get(f"{API}/items", headers=user_b["headers"], timeout=15)
        assert r.status_code == 200
        assert r.json()["items"] == []

    def test_user_b_cannot_get_user_a_item(self, http_session, user_b):
        r = http_session.get(
            f"{API}/items/{pytest.item_a_1}",
            headers=user_b["headers"], timeout=15,
        )
        assert r.status_code == 404

    def test_user_b_cannot_update_user_a_item(self, http_session, user_b):
        r = http_session.put(
            f"{API}/items/{pytest.item_a_1}",
            json={"name": "hacked"},
            headers=user_b["headers"], timeout=15,
        )
        assert r.status_code == 404

    def test_user_b_cannot_delete_user_a_item(self, http_session, user_b):
        r = http_session.delete(
            f"{API}/items/{pytest.item_a_1}",
            headers=user_b["headers"], timeout=15,
        )
        assert r.status_code == 404


# -------------------- AI Stylist --------------------
class TestAIStylist:
    def test_stylist_returns_outfits_with_user_ids(self, http_session, user_a):
        r = http_session.post(
            f"{API}/ai/stylist",
            json={"prompt": "rooftop dinner tonight", "num_outfits": 3},
            headers=user_a["headers"],
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "message" in data
        assert isinstance(data["outfits"], list)
        # Must contain at least 1 outfit since user_a has 3 items
        assert len(data["outfits"]) >= 1, f"No outfits returned: {data}"
        valid_ids = {pytest.item_a_1, pytest.item_a_2, pytest.item_a_3}
        for outfit in data["outfits"]:
            assert outfit["item_ids"], "outfit has no item_ids"
            for iid in outfit["item_ids"]:
                assert iid in valid_ids, f"stylist invented id {iid}"

    def test_stylist_empty_closet_for_user_b(self, http_session, user_b):
        r = http_session.post(
            f"{API}/ai/stylist",
            json={"prompt": "anything", "num_outfits": 2},
            headers=user_b["headers"],
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["outfits"] == []
        assert "empty" in data["message"].lower()


# -------------------- Outfits --------------------
class TestOutfits:
    def test_save_and_list_outfit(self, http_session, user_a):
        item_ids = [pytest.item_a_1, pytest.item_a_2, pytest.item_a_3]
        r = http_session.post(
            f"{API}/outfits",
            json={
                "title": "TEST Rooftop Look",
                "item_ids": item_ids,
                "description": "test outfit",
                "occasion": "dinner",
            },
            headers=user_a["headers"], timeout=15,
        )
        assert r.status_code == 200, r.text
        outfit = r.json()["outfit"]
        assert outfit["outfit_id"].startswith("ofit_")
        assert outfit["item_ids"] == item_ids
        pytest.outfit_a = outfit["outfit_id"]

        r2 = http_session.get(f"{API}/outfits", headers=user_a["headers"], timeout=15)
        assert r2.status_code == 200
        assert any(o["outfit_id"] == pytest.outfit_a for o in r2.json()["outfits"])

    def test_favorite_outfit_toggle(self, http_session, user_a):
        r = http_session.put(
            f"{API}/outfits/{pytest.outfit_a}/favorite",
            headers=user_a["headers"], timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["outfit"]["favorite"] is True

        # Toggle again to false
        r2 = http_session.put(
            f"{API}/outfits/{pytest.outfit_a}/favorite",
            headers=user_a["headers"], timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json()["outfit"]["favorite"] is False

    def test_delete_outfit_and_verify_gone(self, http_session, user_a):
        r = http_session.delete(
            f"{API}/outfits/{pytest.outfit_a}",
            headers=user_a["headers"], timeout=15,
        )
        assert r.status_code == 200
        r2 = http_session.get(f"{API}/outfits", headers=user_a["headers"], timeout=15)
        assert r2.status_code == 200
        assert not any(o["outfit_id"] == pytest.outfit_a for o in r2.json()["outfits"])

    def test_delete_outfit_not_found(self, http_session, user_a):
        r = http_session.delete(
            f"{API}/outfits/ofit_doesnotexist",
            headers=user_a["headers"], timeout=15,
        )
        assert r.status_code == 404


# -------------------- Lookbooks --------------------
class TestLookbooks:
    def test_list_lookbooks(self, http_session, user_a):
        r = http_session.get(f"{API}/lookbooks", headers=user_a["headers"], timeout=15)
        assert r.status_code == 200
        lbs = r.json()["lookbooks"]
        assert isinstance(lbs, list) and len(lbs) >= 1
        assert all("lookbook_id" in lb and "title" in lb and "cover" in lb for lb in lbs)
        pytest.lookbook_id = lbs[0]["lookbook_id"]

    def test_get_lookbook_detail(self, http_session, user_a):
        r = http_session.get(
            f"{API}/lookbooks/{pytest.lookbook_id}",
            headers=user_a["headers"], timeout=15,
        )
        assert r.status_code == 200
        lb = r.json()["lookbook"]
        assert lb["lookbook_id"] == pytest.lookbook_id

    def test_get_lookbook_not_found(self, http_session, user_a):
        r = http_session.get(
            f"{API}/lookbooks/lb_doesnotexist",
            headers=user_a["headers"], timeout=15,
        )
        assert r.status_code == 404

    def test_recreate_lookbook_for_user_with_items(self, http_session, user_a):
        r = http_session.post(
            f"{API}/lookbooks/{pytest.lookbook_id}/recreate",
            headers=user_a["headers"], timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "message" in data
        # outfit may be None if vibe doesn't match — but item_ids if present must be valid
        if data.get("outfit"):
            valid_ids = {pytest.item_a_1, pytest.item_a_2, pytest.item_a_3}
            for iid in data["outfit"]["item_ids"]:
                assert iid in valid_ids

    def test_recreate_lookbook_empty_closet(self, http_session, user_b):
        r = http_session.post(
            f"{API}/lookbooks/{pytest.lookbook_id}/recreate",
            headers=user_b["headers"], timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("outfit") is None
        assert "empty" in data["message"].lower()


# -------------------- Camera Roll Scan --------------------
class TestCameraRollScan:
    def test_scan_camera_roll(self, http_session, user_b, fashion_image_b64, fashion_image_b64_2):
        # Use user_b so we can assert exact counts
        r = http_session.post(
            f"{API}/scan/camera-roll",
            json={"images_base64": [fashion_image_b64, fashion_image_b64_2]},
            headers=user_b["headers"], timeout=180,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["added"] == 2, f"Expected 2 added, got {data}"
        assert len(data["items"]) == 2
        for item in data["items"]:
            assert item["item_id"].startswith("itm_")
            assert item["user_id"] == user_b["user"]["user_id"]
        # Verify items are listed for user_b
        r2 = http_session.get(f"{API}/items", headers=user_b["headers"], timeout=15)
        assert r2.status_code == 200
        assert len(r2.json()["items"]) >= 2


# -------------------- Item delete (last so it doesn't affect stylist tests) --------------------
class TestItemDelete:
    def test_delete_item_and_verify_gone(self, http_session, user_a):
        r = http_session.delete(
            f"{API}/items/{pytest.item_a_3}",
            headers=user_a["headers"], timeout=15,
        )
        assert r.status_code == 200
        r2 = http_session.get(
            f"{API}/items/{pytest.item_a_3}",
            headers=user_a["headers"], timeout=15,
        )
        assert r2.status_code == 404

    def test_delete_item_not_found(self, http_session, user_a):
        r = http_session.delete(
            f"{API}/items/itm_doesnotexist",
            headers=user_a["headers"], timeout=15,
        )
        assert r.status_code == 404
