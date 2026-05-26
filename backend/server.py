from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
import json
import uuid
import bcrypt
import jwt
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from openai import AsyncOpenAI

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev_secret")
JWT_EXPIRES_DAYS = int(os.environ.get("JWT_EXPIRES_DAYS", "30"))
AI_MODEL_NAME = "gpt-4o"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="What's In My Wardrobe API")
api = APIRouter(prefix="/api")

logger = logging.getLogger("wardrobe")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


# ---------------------- Models ----------------------
def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionIn(BaseModel):
    session_token: str  # token returned from Emergent google auth


class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    style_preferences: List[str] = []
    lifestyle: Optional[str] = None
    fidelity_mode: str = "descriptive"  # or "identified"
    onboarding_complete: bool = False
    auth_provider: str = "email"
    created_at: datetime


class ProfileUpdate(BaseModel):
    dob: Optional[str] = None
    gender: Optional[str] = None
    style_preferences: Optional[List[str]] = None
    lifestyle: Optional[str] = None
    fidelity_mode: Optional[str] = None
    onboarding_complete: Optional[bool] = None
    name: Optional[str] = None


class ItemTags(BaseModel):
    type: str = ""  # e.g. "blouse"
    category: str = ""  # tops, bottoms, dresses, shoes, outerwear, accessories
    color: str = ""
    pattern: str = ""
    material: str = ""
    season: List[str] = []  # spring/summer/fall/winter
    occasion: List[str] = []  # casual, formal, evening, work, sport
    formality: str = ""  # casual, smart-casual, formal
    description: str = ""


class CreateItemIn(BaseModel):
    image_base64: str
    name: Optional[str] = None
    tags: Optional[ItemTags] = None
    fidelity_mode: Optional[str] = "descriptive"


class UpdateItemIn(BaseModel):
    name: Optional[str] = None
    tags: Optional[ItemTags] = None
    favorite: Optional[bool] = None


class ItemOut(BaseModel):
    item_id: str
    user_id: str
    name: str
    image_base64: str
    tags: ItemTags
    fidelity_mode: str
    brand: Optional[str] = None
    product_name: Optional[str] = None
    product_url: Optional[str] = None
    favorite: bool = False
    created_at: datetime


class TagRequest(BaseModel):
    image_base64: str


class StylistRequest(BaseModel):
    prompt: str
    occasion: Optional[str] = None
    weather: Optional[str] = None
    num_outfits: int = 6


class StylistOutfit(BaseModel):
    title: str
    description: str
    item_ids: List[str]
    vibe: str = ""


class StylistResponse(BaseModel):
    message: str
    outfits: List[StylistOutfit]


class SaveOutfitIn(BaseModel):
    title: str
    item_ids: List[str]
    description: str = ""
    occasion: str = ""


class OutfitOut(BaseModel):
    outfit_id: str
    user_id: str
    title: str
    description: str
    item_ids: List[str]
    occasion: str
    favorite: bool = False
    created_at: datetime


class CameraRollScanIn(BaseModel):
    images_base64: List[str]


# ---------------------- Auth helpers ----------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def issue_jwt(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": int(utcnow().timestamp()),
        "exp": int((utcnow() + timedelta(days=JWT_EXPIRES_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_jwt(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload.get("sub")
    except Exception:
        return None


async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()

    # 1) Try JWT first
    user_id = decode_jwt(token)
    if user_id:
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if user:
            return user
        raise HTTPException(status_code=401, detail="User not found")

    # 2) Try Emergent session token
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid token")
    expires_at = session.get("expires_at")
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < utcnow():
            raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def user_to_out(u: Dict[str, Any]) -> UserOut:
    return UserOut(
        user_id=u["user_id"],
        email=u["email"],
        name=u.get("name", ""),
        picture=u.get("picture"),
        dob=u.get("dob"),
        gender=u.get("gender"),
        style_preferences=u.get("style_preferences", []) or [],
        lifestyle=u.get("lifestyle"),
        fidelity_mode=u.get("fidelity_mode", "descriptive"),
        onboarding_complete=u.get("onboarding_complete", False),
        auth_provider=u.get("auth_provider", "email"),
        created_at=u.get("created_at", utcnow()),
    )


# ---------------------- Auth Routes ----------------------
@api.post("/auth/register")
async def auth_register(body: RegisterIn):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = new_id("user")
    doc = {
        "user_id": user_id,
        "email": email,
        "name": body.name.strip(),
        "password_hash": hash_password(body.password),
        "auth_provider": "email",
        "onboarding_complete": False,
        "style_preferences": [],
        "fidelity_mode": "descriptive",
        "created_at": utcnow(),
    }
    await db.users.insert_one(doc)
    token = issue_jwt(user_id)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"token": token, "user": user_to_out(user_doc).model_dump()}


@api.post("/auth/login")
async def auth_login(body: LoginIn):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = issue_jwt(user["user_id"])
    return {"token": token, "user": user_to_out(user).model_dump()}


@api.post("/auth/google/session")
async def auth_google_session(body: GoogleSessionIn):
    """Receives a session_id from Emergent OAuth flow, verifies with Emergent backend,
    upserts user, stores session, returns session_token to use as Bearer token."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            r = await cli.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": body.session_token},
            )
            if r.status_code != 200:
                raise HTTPException(status_code=401, detail="Google auth failed")
            data = r.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"google_session error: {e}")
        raise HTTPException(status_code=500, detail="Google auth error")

    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email not returned from provider")
    session_token = data.get("session_token") or body.session_token

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user_id = new_id("user")
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name", email.split("@")[0]),
            "picture": data.get("picture"),
            "auth_provider": "google",
            "onboarding_complete": False,
            "style_preferences": [],
            "fidelity_mode": "descriptive",
            "created_at": utcnow(),
        })
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})

    # Store session
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "session_token": session_token,
            "user_id": user["user_id"],
            "expires_at": utcnow() + timedelta(days=7),
            "created_at": utcnow(),
        }},
        upsert=True,
    )
    return {"token": session_token, "user": user_to_out(user).model_dump()}


@api.get("/auth/me")
async def auth_me(current=Depends(get_current_user)):
    return {"user": user_to_out(current).model_dump()}


@api.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@api.put("/users/me/profile")
async def update_profile(body: ProfileUpdate, current=Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.users.update_one({"user_id": current["user_id"]}, {"$set": updates})
    user = await db.users.find_one({"user_id": current["user_id"]}, {"_id": 0})
    return {"user": user_to_out(user).model_dump()}


# ---------------------- AI helpers ----------------------
def _strip_data_url(b64: str) -> str:
    if "," in b64 and b64.strip().startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


def _safe_json_loads(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    # Strip code fences
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)
    # Find first { and matching last }
    try:
        return json.loads(cleaned)
    except Exception:
        pass
    m = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return None
    return None


async def ai_tag_item(image_base64: str) -> ItemTags:
    if not EMERGENT_LLM_KEY:
        return ItemTags(description="Untagged item")

    schema_hint = (
        "Schema: {"
        "\"type\": string (e.g. 'blouse','jeans','sneakers'),"
        "\"category\": one of ['tops','bottoms','dresses','outerwear','shoes','accessories','activewear','intimates','bags'],"
        "\"color\": dominant color name,"
        "\"pattern\": string (solid/striped/floral/etc),"
        "\"material\": best guess (cotton, denim, leather, etc),"
        "\"season\": list subset of ['spring','summer','fall','winter'],"
        "\"occasion\": list subset of ['casual','work','formal','evening','sport','beach','loungewear'],"
        "\"formality\": one of ['casual','smart-casual','formal'],"
        "\"description\": short human label like 'cream silk blouse'"
        "}"
    )
    try:
        client = AsyncOpenAI(api_key=EMERGENT_LLM_KEY)
        response = await client.chat.completions.create(
            model=AI_MODEL_NAME,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a meticulous fashion cataloger. Given a single garment photo, "
                        "return a strict JSON object describing the item. Output ONLY the JSON, "
                        "no prose, no markdown fences."
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": f"Catalog this clothing item. {schema_hint}"},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{_strip_data_url(image_base64)}"}},
                    ],
                },
            ],
            max_tokens=500,
        )
        resp = response.choices[0].message.content
        data = _safe_json_loads(resp if isinstance(resp, str) else str(resp))
        if not data:
            return ItemTags(description="Untagged item")
        return ItemTags(
            type=str(data.get("type", "") or ""),
            category=str(data.get("category", "") or ""),
            color=str(data.get("color", "") or ""),
            pattern=str(data.get("pattern", "") or ""),
            material=str(data.get("material", "") or ""),
            season=[str(s) for s in (data.get("season") or [])],
            occasion=[str(s) for s in (data.get("occasion") or [])],
            formality=str(data.get("formality", "") or ""),
            description=str(data.get("description", "") or ""),
        )
    except Exception as e:
        logger.error(f"ai_tag_item error: {e}")
        return ItemTags(description="Untagged item")


def item_doc_to_out(d: Dict[str, Any]) -> ItemOut:
    return ItemOut(
        item_id=d["item_id"],
        user_id=d["user_id"],
        name=d.get("name", "") or "",
        image_base64=d.get("image_base64", ""),
        tags=ItemTags(**(d.get("tags") or {})),
        fidelity_mode=d.get("fidelity_mode", "descriptive"),
        brand=d.get("brand"),
        product_name=d.get("product_name"),
        product_url=d.get("product_url"),
        favorite=d.get("favorite", False),
        created_at=d.get("created_at", utcnow()),
    )


# ---------------------- AI Endpoints ----------------------
@api.post("/ai/tag-item")
async def ai_tag_endpoint(body: TagRequest, current=Depends(get_current_user)):
    tags = await ai_tag_item(body.image_base64)
    return {"tags": tags.model_dump()}


@api.post("/ai/stylist", response_model=StylistResponse)
async def ai_stylist(body: StylistRequest, current=Depends(get_current_user)):
    cursor = db.items.find({"user_id": current["user_id"]}, {"_id": 0, "image_base64": 0})
    items: List[Dict[str, Any]] = await cursor.to_list(500)
    if not items:
        return StylistResponse(
            message=("Your closet is empty. Add a few items first so I can style "
                     "outfits from what you actually own."),
            outfits=[],
        )

    catalog_lines = []
    for it in items:
        t = it.get("tags") or {}
        catalog_lines.append(
            f"- id={it['item_id']} | {t.get('description') or it.get('name','item')} "
            f"| category={t.get('category','')} color={t.get('color','')} "
            f"formality={t.get('formality','')} occasion={','.join(t.get('occasion',[]) or [])}"
        )
    catalog = "\n".join(catalog_lines)

    sys_msg = (
        "You are an expert personal stylist. Compose complete outfits ONLY from the "
        "user's catalog (use the provided ids). Return strict JSON ONLY with shape: "
        "{\"message\": string, \"outfits\": ["
        "{\"title\": string, \"description\": string, \"item_ids\": [string], "
        "\"vibe\": string}]}"
        ". Each outfit should include 3-6 item_ids from the catalog. Never invent ids."
    )

    prompt = (
        f"User request: {body.prompt}\n"
        f"Occasion: {body.occasion or 'unspecified'}\n"
        f"Weather: {body.weather or 'unspecified'}\n"
        f"Number of outfits desired: {body.num_outfits}\n\n"
        f"Catalog:\n{catalog}\n\n"
        f"Compose {body.num_outfits} distinct outfit ideas. Return JSON only."
    )

    try:
        client = AsyncOpenAI(api_key=EMERGENT_LLM_KEY)
        response = await client.chat.completions.create(
            model=AI_MODEL_NAME,
            messages=[
                {"role": "system", "content": sys_msg},
                {"role": "user", "content": prompt},
            ],
            max_tokens=2000,
        )
        resp = response.choices[0].message.content
        data = _safe_json_loads(resp if isinstance(resp, str) else str(resp))
        if not data:
            return StylistResponse(message="Sorry, I couldn't generate looks right now.", outfits=[])
        valid_ids = {it["item_id"] for it in items}
        outfits = []
        for o in data.get("outfits", []) or []:
            ids = [i for i in (o.get("item_ids") or []) if i in valid_ids]
            if not ids:
                continue
            outfits.append(StylistOutfit(
                title=str(o.get("title", "Look"))[:80],
                description=str(o.get("description", ""))[:400],
                item_ids=ids,
                vibe=str(o.get("vibe", ""))[:60],
            ))
        return StylistResponse(message=str(data.get("message", "Here are some looks.")), outfits=outfits)
    except Exception as e:
        logger.error(f"ai_stylist error: {e}")
        return StylistResponse(
            message="Stylist is taking a quick break — try again in a moment.",
            outfits=[],
        )


# ---------------------- Items CRUD ----------------------
@api.post("/items")
async def create_item(body: CreateItemIn, current=Depends(get_current_user)):
    image_b64 = _strip_data_url(body.image_base64)
    if not image_b64:
        raise HTTPException(status_code=400, detail="image_base64 required")
    tags = body.tags or await ai_tag_item(image_b64)
    name = body.name or (tags.description or tags.type or "Item")
    doc = {
        "item_id": new_id("itm"),
        "user_id": current["user_id"],
        "name": name,
        "image_base64": image_b64,
        "tags": tags.model_dump(),
        "fidelity_mode": body.fidelity_mode or current.get("fidelity_mode", "descriptive"),
        "favorite": False,
        "created_at": utcnow(),
    }
    if doc["fidelity_mode"] == "identified":
        # MOCKED identified mode (Ximilar/Google Lens not integrated yet)
        doc["brand"] = None
        doc["product_name"] = None
        doc["product_url"] = None
    await db.items.insert_one(doc)
    return {"item": item_doc_to_out(doc).model_dump()}


@api.get("/items")
async def list_items(
    category: Optional[str] = None,
    color: Optional[str] = None,
    season: Optional[str] = None,
    occasion: Optional[str] = None,
    favorite: Optional[bool] = None,
    current=Depends(get_current_user),
):
    q: Dict[str, Any] = {"user_id": current["user_id"]}
    if category:
        q["tags.category"] = category
    if color:
        q["tags.color"] = {"$regex": f"^{re.escape(color)}$", "$options": "i"}
    if season:
        q["tags.season"] = season
    if occasion:
        q["tags.occasion"] = occasion
    if favorite is not None:
        q["favorite"] = favorite
    cursor = db.items.find(q, {"_id": 0}).sort("created_at", -1)
    docs = await cursor.to_list(500)
    return {"items": [item_doc_to_out(d).model_dump() for d in docs]}


@api.get("/items/{item_id}")
async def get_item(item_id: str, current=Depends(get_current_user)):
    d = await db.items.find_one({"item_id": item_id, "user_id": current["user_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"item": item_doc_to_out(d).model_dump()}


@api.put("/items/{item_id}")
async def update_item(item_id: str, body: UpdateItemIn, current=Depends(get_current_user)):
    updates: Dict[str, Any] = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.tags is not None:
        updates["tags"] = body.tags.model_dump()
    if body.favorite is not None:
        updates["favorite"] = body.favorite
    if not updates:
        d = await db.items.find_one({"item_id": item_id, "user_id": current["user_id"]}, {"_id": 0})
        if not d:
            raise HTTPException(status_code=404, detail="Item not found")
        return {"item": item_doc_to_out(d).model_dump()}
    res = await db.items.update_one(
        {"item_id": item_id, "user_id": current["user_id"]},
        {"$set": updates},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    d = await db.items.find_one({"item_id": item_id, "user_id": current["user_id"]}, {"_id": 0})
    return {"item": item_doc_to_out(d).model_dump()}


@api.delete("/items/{item_id}")
async def delete_item(item_id: str, current=Depends(get_current_user)):
    res = await db.items.delete_one({"item_id": item_id, "user_id": current["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


# ---------------------- Outfits ----------------------
@api.post("/outfits")
async def save_outfit(body: SaveOutfitIn, current=Depends(get_current_user)):
    doc = {
        "outfit_id": new_id("ofit"),
        "user_id": current["user_id"],
        "title": body.title,
        "description": body.description,
        "item_ids": body.item_ids,
        "occasion": body.occasion,
        "favorite": False,
        "created_at": utcnow(),
    }
    await db.outfits.insert_one(doc)
    return {"outfit": OutfitOut(**doc).model_dump()}


@api.get("/outfits")
async def list_outfits(current=Depends(get_current_user)):
    cursor = db.outfits.find({"user_id": current["user_id"]}, {"_id": 0}).sort("created_at", -1)
    docs = await cursor.to_list(200)
    return {"outfits": [OutfitOut(**d).model_dump() for d in docs]}


@api.put("/outfits/{outfit_id}/favorite")
async def toggle_outfit_favorite(outfit_id: str, current=Depends(get_current_user)):
    d = await db.outfits.find_one({"outfit_id": outfit_id, "user_id": current["user_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Outfit not found")
    new_fav = not d.get("favorite", False)
    await db.outfits.update_one(
        {"outfit_id": outfit_id, "user_id": current["user_id"]},
        {"$set": {"favorite": new_fav}},
    )
    d["favorite"] = new_fav
    return {"outfit": OutfitOut(**d).model_dump()}


@api.delete("/outfits/{outfit_id}")
async def delete_outfit(outfit_id: str, current=Depends(get_current_user)):
    res = await db.outfits.delete_one({"outfit_id": outfit_id, "user_id": current["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Outfit not found")
    return {"ok": True}


# ---------------------- Lookbooks (curated mock data) ----------------------
LOOKBOOKS = [
    {
        "lookbook_id": "lb_editorial_noir",
        "title": "Editorial Noir",
        "subtitle": "Monochrome, sharp tailoring",
        "cover": "https://images.unsplash.com/photo-1632469188022-b5db09a70fbc",
        "vibe": "minimalist evening",
        "tags": ["formal", "evening", "monochrome"],
        "credit": "Trend report · Editorial",
    },
    {
        "lookbook_id": "lb_quiet_luxury",
        "title": "Quiet Luxury",
        "subtitle": "Neutral palettes, refined silhouettes",
        "cover": "https://images.pexels.com/photos/5405607/pexels-photo-5405607.jpeg",
        "vibe": "smart casual",
        "tags": ["smart-casual", "neutral", "work"],
        "credit": "Celebrity look · Weekly",
    },
    {
        "lookbook_id": "lb_rooftop_dinner",
        "title": "Rooftop Dinner",
        "subtitle": "Warm evening, dressed-up casual",
        "cover": "https://images.pexels.com/photos/28263000/pexels-photo-28263000.jpeg",
        "vibe": "evening",
        "tags": ["evening", "dinner", "summer"],
        "credit": "Trend · This week",
    },
    {
        "lookbook_id": "lb_offduty_chic",
        "title": "Off-duty Chic",
        "subtitle": "Weekend errands, elevated",
        "cover": "https://images.unsplash.com/photo-1649361811423-a55616f7ab11",
        "vibe": "casual",
        "tags": ["casual", "weekend"],
        "credit": "Trend report",
    },
]


@api.get("/lookbooks")
async def list_lookbooks(current=Depends(get_current_user)):
    return {"lookbooks": LOOKBOOKS}


@api.get("/lookbooks/{lookbook_id}")
async def get_lookbook(lookbook_id: str, current=Depends(get_current_user)):
    lb = next((x for x in LOOKBOOKS if x["lookbook_id"] == lookbook_id), None)
    if not lb:
        raise HTTPException(status_code=404, detail="Lookbook not found")
    return {"lookbook": lb}


@api.post("/lookbooks/{lookbook_id}/recreate")
async def recreate_lookbook(lookbook_id: str, current=Depends(get_current_user)):
    """Asks GPT-5.2 to choose items from the user's closet that best match the lookbook vibe."""
    lb = next((x for x in LOOKBOOKS if x["lookbook_id"] == lookbook_id), None)
    if not lb:
        raise HTTPException(status_code=404, detail="Lookbook not found")
    items = await db.items.find({"user_id": current["user_id"]}, {"_id": 0, "image_base64": 0}).to_list(500)
    if not items:
        return {"message": "Your closet is empty — add items to recreate this look.", "outfit": None}
    catalog = "\n".join(
        f"- id={it['item_id']} | {(it.get('tags') or {}).get('description') or it.get('name','item')} "
        f"| {(it.get('tags') or {}).get('category','')} {(it.get('tags') or {}).get('color','')} "
        f"{(it.get('tags') or {}).get('formality','')}"
        for it in items
    )
    sys_msg = (
        "You are a stylist. Pick 3-6 items from the user's catalog to recreate the look. "
        "Return strict JSON: {\"title\": string, \"description\": string, \"item_ids\": [string]}"
    )
    prompt = (
        f"Lookbook: {lb['title']} — {lb['subtitle']}. Vibe: {lb['vibe']}. "
        f"Tags: {', '.join(lb['tags'])}.\n\nCatalog:\n{catalog}\n\nReturn JSON only."
    )
    try:
        client = AsyncOpenAI(api_key=EMERGENT_LLM_KEY)
        response = await client.chat.completions.create(
            model=AI_MODEL_NAME,
            messages=[
                {"role": "system", "content": sys_msg},
                {"role": "user", "content": prompt},
            ],
            max_tokens=500,
        )
        resp = response.choices[0].message.content
        data = _safe_json_loads(resp if isinstance(resp, str) else str(resp))
        if not data:
            return {"message": "Couldn't recreate this look right now.", "outfit": None}
        valid_ids = {it["item_id"] for it in items}
        ids = [i for i in (data.get("item_ids") or []) if i in valid_ids][:6]
        if not ids:
            return {"message": "No matching items in your closet for this vibe.", "outfit": None}
        return {
            "message": "Recreated from your closet.",
            "outfit": {
                "title": str(data.get("title", lb["title"]))[:80],
                "description": str(data.get("description", ""))[:400],
                "item_ids": ids,
            },
        }
    except Exception as e:
        logger.error(f"recreate_lookbook error: {e}")
        return {"message": "Couldn't recreate this look right now — please try again.", "outfit": None}


# ---------------------- Camera Roll Scan ----------------------
@api.post("/scan/camera-roll")
async def scan_camera_roll(body: CameraRollScanIn, current=Depends(get_current_user)):
    """Processes a list of photos — for each one, asks GPT to extract the main garment and adds it to the closet."""
    created: List[Dict[str, Any]] = []
    errors = 0
    for raw in body.images_base64[:10]:  # cap at 10 per batch
        b64 = _strip_data_url(raw)
        try:
            tags = await ai_tag_item(b64)
            doc = {
                "item_id": new_id("itm"),
                "user_id": current["user_id"],
                "name": tags.description or tags.type or "Item from photos",
                "image_base64": b64,
                "tags": tags.model_dump(),
                "fidelity_mode": current.get("fidelity_mode", "descriptive"),
                "favorite": False,
                "created_at": utcnow(),
                "source": "camera_roll",
            }
            await db.items.insert_one(doc)
            created.append(item_doc_to_out(doc).model_dump())
        except Exception as e:
            logger.error(f"camera roll scan error: {e}")
            errors += 1
    return {"added": len(created), "errors": errors, "items": created}


# ---------------------- Health ----------------------
@api.get("/")
async def root():
    return {"ok": True, "app": "wardrobe", "model": f"{AI_MODEL_PROVIDER}/{AI_MODEL_NAME}"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.items.create_index([("user_id", 1), ("created_at", -1)])
    await db.outfits.create_index([("user_id", 1), ("created_at", -1)])
    logger.info("Wardrobe API ready")


@app.on_event("shutdown")
async def shutdown():
    client.close()
