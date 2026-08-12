"""Unit tests for the Swap Box response shape.

Regression guard: `/swapbox` returned raw Mongo documents whose title field is
`item_name`, while every client (and every other item endpoint) reads `name` —
so every card rendered a placeholder title and the claim dialog said "undefined".
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import swap_listing_to_out  # noqa: E402


def _doc(**overrides):
    doc = {
        "swap_box_id": "swb_1",
        "user_id": "user_owner",
        "owner_name": "Sam",
        "item_id": "itm_1",
        "item_name": "Blue Denim Jacket",
        "image_url": "https://example.com/jacket.jpg",
        "tags": {"category": "outerwear"},
        "description": "Barely worn",
        "points_cost": 200,
        "status": "available",
        "claimed_by": "user_claimer",
        "claimed_at": None,
        "created_at": "2026-06-04T05:19:48",
    }
    doc.update(overrides)
    return doc


def test_name_comes_from_item_name():
    out = swap_listing_to_out(_doc())
    assert out["name"] == "Blue Denim Jacket"


def test_missing_item_name_is_an_empty_string_not_none():
    out = swap_listing_to_out(_doc(item_name=None))
    assert out["name"] == ""


def test_claimer_identity_is_not_exposed():
    assert "claimed_by" not in swap_listing_to_out(_doc())


def test_optional_fields_never_serialize_as_none():
    out = swap_listing_to_out(_doc(image_url=None, description=None, tags=None, owner_name=None))
    assert out["image_url"] == ""
    assert out["description"] == ""
    assert out["owner_name"] == ""
    assert out["tags"] == {}
