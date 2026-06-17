from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, Request, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
import os
import logging
import re
import json
import uuid
import bcrypt
import jwt
import httpx
import random
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from anthropic import AsyncAnthropic
import math
import time
from collections import defaultdict

# ---------------------- In-memory rate limiter ----------------------
# Keyed by (user_id, endpoint). Stores list of timestamps.
# Limits: stylist = 10/hour, tag = 30/hour, suggestions = 5/hour
_rate_store: Dict[str, list] = defaultdict(list)

def _check_rate(user_id: str, endpoint: str, max_calls: int, window_seconds: int = 3600) -> bool:
    """Returns True if allowed, False if rate limited."""
    key = f"{user_id}:{endpoint}"
    now = time.time()
    calls = [t for t in _rate_store[key] if now - t < window_seconds]
    if len(calls) >= max_calls:
        return False
    calls.append(now)
    _rate_store[key] = calls
    return True

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "wardrobe")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev_secret")
JWT_EXPIRES_DAYS = int(os.environ.get("JWT_EXPIRES_DAYS", "30"))
AI_FAST_MODEL = "claude-3-5-haiku-20241022"   # vision + fast tagging
AI_SMART_MODEL = "claude-3-5-sonnet-20241022"  # stylist, suggestions, lookbook

# App URL
APP_URL = os.environ.get("APP_URL", "https://wardrope-red.vercel.app")

# Twilio Verify (email + SMS OTP)
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_VERIFY_SID = os.environ.get("TWILIO_VERIFY_SID", "")

# AWS S3 config
# Keep only printable ASCII — strips BOM (U+FEFF), whitespace, newlines, and control
# chars that some env-setting tools prepend/append (e.g. piping a value into the Vercel
# CLI on Windows adds a UTF-8 BOM). A stray BOM in a bucket name or key makes S3 reject
# every request. AWS keys, bucket names, and regions are all pure printable ASCII.
def _clean_env(name: str, default: str = "") -> str:
    return "".join(c for c in os.environ.get(name, default) if 0x21 <= ord(c) <= 0x7E)

AWS_ACCESS_KEY_ID = _clean_env("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = _clean_env("AWS_SECRET_ACCESS_KEY")
S3_BUCKET = _clean_env("S3_BUCKET")
S3_REGION = _clean_env("S3_REGION", "us-east-1")
GOOGLE_PLACES_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")

# Plan amounts in cents
PLAN_AMOUNTS_CENTS: Dict[str, int] = {
    "single_monthly": 199, "single_annual": 1791,
    "couples_monthly": 299, "couples_annual": 2691,
    "family_monthly": 499, "family_annual": 4491,
    "addon_share": 999, "addon_stylist": 399,
}

# Square billing config
SQUARE_ACCESS_TOKEN = os.environ.get("SQUARE_ACCESS_TOKEN", "")
SQUARE_ENVIRONMENT = os.environ.get("SQUARE_ENVIRONMENT", "sandbox")
SQUARE_LOCATION_ID = os.environ.get("SQUARE_LOCATION_ID", "")
SQUARE_WEBHOOK_SIGNATURE_KEY = os.environ.get("SQUARE_WEBHOOK_SIGNATURE_KEY", "")
SQUARE_WEBHOOK_URL = os.environ.get("SQUARE_WEBHOOK_URL", "")

PLAN_LABELS: Dict[str, str] = {
    "single_monthly": "Single Closet - Monthly",
    "single_annual": "Single Closet - Annual",
    "couples_monthly": "Couples Closet - Monthly",
    "couples_annual": "Couples Closet - Annual",
    "family_monthly": "Family Closet - Monthly",
    "family_annual": "Family Closet - Annual",
    "addon_share": "Share Closet Add-on",
    "addon_stylist": "Stylist AI Add-on",
}

ADDON_LABELS: Dict[str, str] = {
    "share": "Share Closet Add-on",
    "stylist": "Stylist AI Add-on",
}

# Compact codes for Square reference_id (max 40 chars)
_PLAN_CODE = {"single": "si", "couples": "co", "family": "fa"}
_PLAN_CODE_REV = {v: k for k, v in _PLAN_CODE.items()}
_PERIOD_CODE = {"monthly": "m", "annual": "a"}
_PERIOD_CODE_REV = {v: k for k, v in _PERIOD_CODE.items()}
_ADDON_CODE = {"share": "sh", "stylist": "st"}
_ADDON_CODE_REV = {v: k for k, v in _ADDON_CODE.items()}
_PACK_CODE = {"points_starter": "ps", "points_popular": "pp", "points_best": "pb"}
_PACK_CODE_REV = {v: k for k, v in _PACK_CODE.items()}


def _sq_sub_ref(user_id: str, plan: str, period: str, addons: list) -> str:
    uid = user_id.replace("user_", "")[:12]
    ac = ".".join(_ADDON_CODE.get(a, a[:2]) for a in addons) if addons else ""
    return f"{uid}|{_PLAN_CODE.get(plan,'?')}|{_PERIOD_CODE.get(period,'?')}|{ac}|s"


def _sq_pts_ref(user_id: str, pack: str, points: int) -> str:
    uid = user_id.replace("user_", "")[:12]
    return f"{uid}|{_PACK_CODE.get(pack,'?')}|{points}|p"


def _sq_decode_ref(ref_id: str) -> dict:
    parts = ref_id.split("|")
    if len(parts) < 4:
        return {}
    uid_hex = parts[0]
    user_id = f"user_{uid_hex}"
    ptype = parts[-1]
    if ptype == "s":
        plan = _PLAN_CODE_REV.get(parts[1], parts[1])
        period = _PERIOD_CODE_REV.get(parts[2], parts[2])
        addons = [_ADDON_CODE_REV.get(c, c) for c in parts[3].split(".") if c]
        return {"type": "subscription", "user_id": user_id, "plan": plan, "period": period, "addons": addons}
    elif ptype == "p":
        pack = _PACK_CODE_REV.get(parts[1], parts[1])
        points = int(parts[2]) if parts[2].isdigit() else 0
        return {"type": "points_purchase", "user_id": user_id, "pack": pack, "points": points}
    return {}

client = AsyncIOMotorClient(
    MONGO_URL,
    tlsCAFile=certifi.where(),
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    socketTimeoutMS=10000,
) if MONGO_URL else None
db = client[DB_NAME] if client else None

# Always-allowed production origins (cannot be broken by an empty env var)
_DEFAULT_ORIGINS = [
    "https://whatsinmywardrobe.com",
    "https://www.whatsinmywardrobe.com",
    "https://wardrope-red.vercel.app",
]
# Local development origins (expo-web / Next dev / Metro). Safe to allow even in
# production: a browser's Origin is set by where the page is actually served, so a
# remote attacker cannot present "http://localhost:*" — only a dev client running on
# the user's own machine matches. The API is Bearer-token based (no cookies), so this
# does not expose credentials via CORS.
_DEV_ORIGINS = [
    "http://localhost:8090",
    "http://localhost:3000",
    "http://localhost:8081",
    "http://localhost:19006",
]
_ENV_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
# Merge env-provided origins with the defaults, de-duplicated
CORS_ORIGINS = list(dict.fromkeys(_DEFAULT_ORIGINS + _DEV_ORIGINS + _ENV_ORIGINS))

app = FastAPI(title="What's In My Wardrobe API", docs_url="/api/docs", redoc_url="/api/redoc")
api = APIRouter(prefix="/api")

logger = logging.getLogger("wardrobe")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception on {request.method} {request.url}: {type(exc).__name__}: {exc}")
    return JSONResponse(status_code=500, content={"detail": f"Internal error: {type(exc).__name__}: {str(exc)}"})

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


# ---------------------- Models ----------------------
def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def generate_presigned_url(key: str, content_type: str = "image/jpeg", expires: int = 3600) -> str:
    import aioboto3
    session = aioboto3.Session(
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=S3_REGION,
    )
    # Pin the regional endpoint so the presigned host matches the bucket's region
    # (the legacy global "s3.amazonaws.com" host signs as us-east-1 and rejects buckets
    # in other regions with AuthorizationQueryParametersError).
    async with session.client("s3", endpoint_url=f"https://s3.{S3_REGION}.amazonaws.com") as s3:
        url = await s3.generate_presigned_url(
            "put_object",
            Params={"Bucket": S3_BUCKET, "Key": key, "ContentType": content_type},
            ExpiresIn=expires,
        )
    return url


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: Optional[str] = None
    referral_code: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class VerifyEmailIn(BaseModel):
    email: EmailStr
    code: str


class SendPhoneCodeIn(BaseModel):
    phone: str


class VerifyPhoneIn(BaseModel):
    phone: str
    code: str


class GoogleSessionIn(BaseModel):
    session_token: str  # token returned from Emergent google auth


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    email: EmailStr
    code: str
    new_password: str


DEFAULT_PERSONA = "editor"
DEFAULT_THEME = "editorial"


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
    email_verified: bool = False
    phone: Optional[str] = None
    phone_verified: bool = False
    points: int = 0
    stylist_persona: str = DEFAULT_PERSONA
    theme_id: str = DEFAULT_THEME
    plan_type: str = "free"
    plan_period: str = "monthly"
    plan_addons: List[str] = []
    subscription_status: str = "none"
    created_at: datetime


class ProfileUpdate(BaseModel):
    dob: Optional[str] = None
    gender: Optional[str] = None
    style_preferences: Optional[List[str]] = None
    lifestyle: Optional[str] = None
    fidelity_mode: Optional[str] = None
    onboarding_complete: Optional[bool] = None
    name: Optional[str] = None
    stylist_persona: Optional[str] = None
    theme_id: Optional[str] = None


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


class BarcodeIn(BaseModel):
    barcode: str


class CreateItemIn(BaseModel):
    image_base64: Optional[str] = None
    image_url: Optional[str] = None
    name: Optional[str] = None
    tags: Optional[ItemTags] = None
    fidelity_mode: Optional[str] = "descriptive"
    brand: Optional[str] = None
    price: Optional[float] = None
    purchased_at: Optional[str] = None
    closet_id: Optional[str] = None
    person_tag: Optional[str] = None


class AddCategoryIn(BaseModel):
    name: str


class ListingUpdateIn(BaseModel):
    status: Optional[str] = None  # "donate" | "swap" | null


class FeedbackIn(BaseModel):
    message: str
    category: Optional[str] = "General"  # "Bug" | "Suggestion" | "General"


class CheckoutIn(BaseModel):
    plan: str       # "single" | "couples" | "family"
    period: str     # "monthly" | "annual"
    addons: List[str] = []  # e.g. ["share", "stylist"]


class PointsRedeemIn(BaseModel):
    amount: int
    reason: str = ""


class UpdateItemIn(BaseModel):
    name: Optional[str] = None
    tags: Optional[ItemTags] = None
    favorite: Optional[bool] = None
    price: Optional[float] = None
    purchased_at: Optional[str] = None
    person_tag: Optional[str] = None


class ItemOut(BaseModel):
    item_id: str
    user_id: str
    name: str
    image_base64: str
    image_url: Optional[str] = None
    tags: ItemTags
    fidelity_mode: str
    brand: Optional[str] = None
    product_name: Optional[str] = None
    product_url: Optional[str] = None
    favorite: bool = False
    listing_status: Optional[str] = None
    times_worn: int = 0
    last_worn_at: Optional[datetime] = None
    price: Optional[float] = None
    purchased_at: Optional[str] = None
    created_at: datetime


class TagRequest(BaseModel):
    image_base64: Optional[str] = None
    image_url: Optional[str] = None


class PresignIn(BaseModel):
    filename: str
    content_type: str = "image/jpeg"


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
    rating: Optional[int] = None


class OutfitOut(BaseModel):
    outfit_id: str
    user_id: str
    title: str
    description: str
    item_ids: List[str]
    occasion: str
    favorite: bool = False
    rating: Optional[int] = None
    created_at: datetime


class OutfitRatingIn(BaseModel):
    rating: int


class CameraRollScanIn(BaseModel):
    images_base64: List[str]


class CreateClosetIn(BaseModel):
    name: str
    description: Optional[str] = None
    closet_type: str = "wardrobe"


class UpdateClosetIn(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ClosetOut(BaseModel):
    closet_id: str
    user_id: str
    name: str
    description: Optional[str] = None
    is_default: bool = False
    item_count: int = 0
    closet_type: str = "wardrobe"
    created_at: datetime


# ---------------------- Twilio Verify helpers ----------------------
async def twilio_send_verification(to: str, channel: str) -> bool:
    """Send OTP via Twilio Verify. channel: 'sms' | 'email'"""
    if not TWILIO_ACCOUNT_SID or not TWILIO_VERIFY_SID:
        logger.warning("Twilio Verify not configured — OTP skipped")
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                f"https://verify.twilio.com/v2/Services/{TWILIO_VERIFY_SID}/Verifications",
                auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
                data={"To": to, "Channel": channel},
            )
        if r.status_code == 201:
            logger.info(f"Twilio Verify sent ({channel}) to {to}")
            return True
        logger.error(f"Twilio Verify send failed ({r.status_code}): {r.text}")
        return False
    except Exception as e:
        logger.error(f"Twilio Verify send error: {e}")
        return False


async def twilio_check_verification(to: str, code: str) -> bool:
    """Check OTP via Twilio Verify. Returns True if approved."""
    if not TWILIO_ACCOUNT_SID or not TWILIO_VERIFY_SID:
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                f"https://verify.twilio.com/v2/Services/{TWILIO_VERIFY_SID}/VerificationChecks",
                auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
                data={"To": to, "Code": code},
            )
        if r.status_code == 200:
            return r.json().get("status") == "approved"
        logger.error(f"Twilio Verify check failed ({r.status_code}): {r.text}")
        return False
    except Exception as e:
        logger.error(f"Twilio Verify check error: {e}")
        return False


async def send_email_verification_code(email: str, name: str) -> None:
    """Send email OTP via Twilio Verify."""
    await twilio_send_verification(email, "email")


async def send_welcome_email(email: str, name: str) -> None:
    """Welcome email — send via Twilio Verify email channel (no-code welcome)."""
    # Just log for now; welcome messaging handled in onboarding screen
    logger.info(f"Welcome email skipped (no template channel) for {email}")


async def award_points(user_id: str, amount: int, reason: str = "") -> int:
    """Award points to a user and return the new total."""
    if db is None:
        return 0
    result = await db.users.find_one_and_update(
        {"user_id": user_id},
        {"$inc": {"points": amount}},
        return_document=True,
        projection={"points": 1},
    )
    pts = result.get("points", 0) if result else 0
    logger.info(f"Points awarded: user={user_id} +{amount} ({reason}) -> total={pts}")
    return pts


POINTS_LEVELS = [
    (1000, "Platinum"),
    (500, "Gold"),
    (100, "Silver"),
    (0, "Bronze"),
]


def points_level(pts: int) -> str:
    for threshold, label in POINTS_LEVELS:
        if pts >= threshold:
            return label
    return "Bronze"


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
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
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
        email_verified=u.get("email_verified", False),
        phone=u.get("phone"),
        phone_verified=u.get("phone_verified", False),
        points=u.get("points", 0),
        stylist_persona=u.get("stylist_persona", DEFAULT_PERSONA),
        theme_id=u.get("theme_id", DEFAULT_THEME),
        plan_type=u.get("plan_type", "free"),
        plan_period=u.get("plan_period", "monthly"),
        plan_addons=u.get("plan_addons", []) or [],
        subscription_status=u.get("subscription_status", "none"),
        created_at=u.get("created_at", utcnow()),
    )


async def _check_login_reward(user_id: str) -> dict:
    user = await db.users.find_one({"user_id": user_id}, {"last_login_reward_at": 1, "login_streak": 1, "_id": 0})
    now = utcnow()
    last = user.get("last_login_reward_at") if user else None
    streak = (user.get("login_streak") or 0) if user else 0
    if last:
        if isinstance(last, datetime) and last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        hours = (now - last).total_seconds() / 3600
        if hours < 24:
            return {"rewarded": False, "streak": streak}
        if hours > 48:
            streak = 0
    streak += 1
    bonus = 100 if streak % 7 == 0 else 0
    await db.users.update_one({"user_id": user_id}, {"$set": {"last_login_reward_at": now, "login_streak": streak}})
    new_pts = await award_points(user_id, 10 + bonus, f"daily_login_s{streak}")
    return {"rewarded": True, "points_awarded": 10 + bonus, "streak": streak, "streak_bonus": bonus > 0, "total_points": new_pts}


# ---------------------- Auth Routes ----------------------
@api.post("/auth/register")
async def auth_register(body: RegisterIn):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = new_id("user")
    name = body.name.strip()
    doc = {
        "user_id": user_id,
        "email": email,
        "name": name,
        "password_hash": hash_password(body.password),
        "auth_provider": "email",
        "email_verified": False,
        "phone": body.phone or None,
        "phone_verified": False,
        "onboarding_complete": False,
        "style_preferences": [],
        "fidelity_mode": "descriptive",
        "created_at": utcnow(),
    }
    # Handle referral code
    if body.referral_code:
        code = body.referral_code.strip().upper()
        referrer = await db.users.find_one({"referral_code": code}, {"user_id": 1})
        if referrer and referrer["user_id"] != user_id:
            doc["referred_by"] = referrer["user_id"]
    await db.users.insert_one(doc)
    token = issue_jwt(user_id)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    # Fire-and-forget: send email verification code
    asyncio.create_task(send_email_verification_code(email, name))
    return {"token": token, "user": user_to_out(user_doc).model_dump()}


@api.post("/auth/login")
async def auth_login(body: LoginIn):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        email = body.email.lower().strip()
        user = await db.users.find_one({"email": email}, {"_id": 0})
    except Exception as e:
        logger.error(f"auth_login DB error: {e}")
        raise HTTPException(status_code=503, detail=f"Database error: {str(e)}")
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = issue_jwt(user["user_id"])
    # Daily-login reward is non-essential — it must NEVER block authentication.
    try:
        login_reward = await _check_login_reward(user["user_id"])
    except Exception as e:
        logger.error(f"login_reward failed for {user['user_id']}: {e}")
        login_reward = {"rewarded": False}
    return {"token": token, "user": user_to_out(user).model_dump(), "login_reward": login_reward}


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
    is_new_user = not user
    if not user:
        user_id = new_id("user")
        gname = data.get("name", email.split("@")[0])
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": gname,
            "picture": data.get("picture"),
            "auth_provider": "google",
            "email_verified": True,   # Google already verified the email
            "phone": None,
            "phone_verified": False,
            "onboarding_complete": False,
            "style_preferences": [],
            "fidelity_mode": "descriptive",
            "created_at": utcnow(),
        })
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        # Send welcome email to new Google users
        asyncio.create_task(send_welcome_email(email, gname))

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
    login_reward = await _check_login_reward(user["user_id"])
    return {"token": session_token, "user": user_to_out(user).model_dump(), "login_reward": login_reward}


@api.get("/auth/me")
async def auth_me(current=Depends(get_current_user)):
    return {"user": user_to_out(current).model_dump()}


@api.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@api.post("/auth/resend-email-code")
async def resend_email_code(current=Depends(get_current_user)):
    """Resend email verification code to the current user."""
    if current.get("email_verified"):
        return {"ok": True, "already_verified": True}
    asyncio.create_task(send_email_verification_code(current["email"], current.get("name", "")))
    return {"ok": True}


@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordIn):
    """Send a 6-digit password reset code. Always returns ok to prevent email enumeration."""
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0, "name": 1, "auth_provider": 1})
    if user and user.get("auth_provider", "email") == "email":
        await twilio_send_verification(email, "email")
    return {"ok": True}


@api.post("/auth/reset-password")
async def reset_password(body: ResetPasswordIn):
    """Verify the reset OTP via Twilio Verify and set a new password."""
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    email = body.email.lower().strip()
    ok = await twilio_check_verification(email, body.code.strip())
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    await db.users.update_one(
        {"email": email},
        {"$set": {"password_hash": hash_password(body.new_password)}},
    )
    return {"ok": True}


@api.post("/auth/verify-email")
async def verify_email_endpoint(body: VerifyEmailIn, current=Depends(get_current_user)):
    """Verify the 6-digit code sent to the user's email via Twilio Verify."""
    if current.get("email_verified"):
        return {"ok": True, "user": user_to_out(current).model_dump()}
    email = body.email.lower().strip()
    if email != current["email"]:
        raise HTTPException(status_code=400, detail="Email mismatch")
    ok = await twilio_check_verification(email, body.code.strip())
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    await db.users.update_one({"user_id": current["user_id"]}, {"$set": {"email_verified": True}})
    await award_points(current["user_id"], 25, "email_verified")
    user_doc = await db.users.find_one({"user_id": current["user_id"]}, {"_id": 0})
    # Award referral bonus to referrer (only once)
    referred_by = user_doc.get("referred_by")
    if referred_by and not user_doc.get("referral_bonus_awarded"):
        await award_points(referred_by, 200, "referral")
        await db.users.update_one(
            {"user_id": current["user_id"]},
            {"$set": {"referral_bonus_awarded": True}},
        )
    return {"ok": True, "user": user_to_out(user_doc).model_dump()}


@api.post("/auth/send-phone-code")
async def send_phone_code(body: SendPhoneCodeIn, current=Depends(get_current_user)):
    """Send SMS OTP via Twilio Verify."""
    phone = body.phone.strip()
    await db.users.update_one({"user_id": current["user_id"]}, {"$set": {"phone": phone}})
    sent = await twilio_send_verification(phone, "sms")
    if not sent:
        raise HTTPException(status_code=503, detail="Could not send SMS — check phone number or try again")
    return {"ok": True}


@api.post("/auth/verify-phone")
async def verify_phone_endpoint(body: VerifyPhoneIn, current=Depends(get_current_user)):
    """Verify SMS OTP via Twilio Verify."""
    phone = body.phone.strip()
    ok = await twilio_check_verification(phone, body.code.strip())
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    await db.users.update_one(
        {"user_id": current["user_id"]},
        {"$set": {"phone": phone, "phone_verified": True}},
    )
    await award_points(current["user_id"], 25, "phone_verified")
    user_doc = await db.users.find_one({"user_id": current["user_id"]}, {"_id": 0})
    return {"ok": True, "user": user_to_out(user_doc).model_dump()}


@api.put("/users/me/profile")
async def update_profile(body: ProfileUpdate, current=Depends(get_current_user)):
    updates = body.model_dump(exclude_unset=True)
    if "theme_id" in updates:
        allowed_themes = {"editorial", "ivory", "midnight", "rose", "emerald"}
        if updates["theme_id"] not in allowed_themes:
            raise HTTPException(status_code=400, detail="Invalid theme_id")
    if updates:
        await db.users.update_one({"user_id": current["user_id"]}, {"$set": updates})
    # Award points when onboarding completes for the first time
    if body.onboarding_complete and not current.get("onboarding_complete"):
        await award_points(current["user_id"], 50, "onboarding_complete")
    user = await db.users.find_one({"user_id": current["user_id"]}, {"_id": 0})
    return {"user": user_to_out(user).model_dump()}


# ---------------------- Fashion Personas ----------------------
FASHION_PERSONAS: Dict[str, Dict[str, str]] = {
    "editor": {
        "name": "The Editor",
        "tagline": "Sharp eye, impeccable taste",
        "description": "A Vogue-grade fashion director. Authoritative, discerning, always ahead of the curve.",
        "emoji": "👁",
        "system_intro": (
            "You are The Editor — a legendary fashion director with three decades at the world's most prestigious "
            "fashion houses and magazines. Your eye is absolute. You spot potential where others see chaos and "
            "weakness where others see success. You speak with authority, brevity, and wit. You reference "
            "designers, art movements, and cultural moments effortlessly. Your feedback is direct — you never "
            "soften criticism, but you always elevate. Think Anna Wintour meets Grace Coddington. "
            "You champion timelessness and know that true style transcends trend."
        ),
    },
    "architect": {
        "name": "The Architect",
        "tagline": "Minimalism as philosophy",
        "description": "Armani, Jil Sander, Phoebe Philo — structure, restraint, and quiet luxury.",
        "emoji": "□",
        "system_intro": (
            "You are The Architect — a minimalist fashion philosopher who believes true luxury whispers. "
            "Trained in the traditions of Giorgio Armani, Jil Sander, and Phoebe Philo, you see clothing "
            "as architecture: every line purposeful, every detail intentional, every excess eliminated. "
            "You celebrate neutral palettes — ecru, slate, sand, ivory — impeccable tailoring, and the "
            "profound power of restraint. You find beauty in what is removed, not what is added. "
            "You champion investment pieces over trends. Your advice is precise, considered, and principled."
        ),
    },
    "rebel": {
        "name": "The Rebel",
        "tagline": "Fashion is never just clothes",
        "description": "McQueen, Westwood, Galliano — avant-garde, subversive, historically rich.",
        "emoji": "⚡",
        "system_intro": (
            "You are The Rebel — a visionary whose creative DNA runs through punk, haute couture, and cultural "
            "revolt. Inspired by Alexander McQueen's raw darkness, Vivienne Westwood's anarchic tailoring, and "
            "John Galliano's theatrical genius, you see fashion as art, protest, and identity simultaneously. "
            "You celebrate the unexpected combination, the vintage piece in a modern context, the subversive "
            "lurking beneath the polished. You challenge every convention and inspire genuine courage. "
            "Your advice is theatrical, provocative, and rich with historical and subcultural references."
        ),
    },
    "hype": {
        "name": "The Hype Maven",
        "tagline": "Where street meets suite",
        "description": "Virgil Abloh, Kim Jones, Jerry Lorenzo — streetwear meets luxury.",
        "emoji": "◈",
        "system_intro": (
            "You are The Hype Maven — a cultural curator who bridges streetwear and luxury with effortless "
            "fluency. Your creative vocabulary was shaped by Virgil Abloh's deconstruction, Kim Jones's "
            "archival obsession, and Jerry Lorenzo's spiritual minimalism. You speak in references: "
            "music drops, gallery openings, rare sneaker releases, architectural moments. You understand "
            "how a technical jacket and tailored trousers can be the most powerful statement in a room. "
            "You value authenticity, cultural context, and provenance. "
            "Your advice is sharp, energetic, forward-thinking, and always culturally aware."
        ),
    },
    "goddess": {
        "name": "The Goddess",
        "tagline": "More is always more",
        "description": "Versace, Valentino, Cavalli — bold, glamorous, unapologetically maximalist.",
        "emoji": "✦",
        "system_intro": (
            "You are The Goddess — the living embodiment of maximalist glamour, channeling the bold visions of "
            "Gianni Versace, Valentino Garavani, and Roberto Cavalli. You believe clothing is the ultimate "
            "form of self-expression, and that restraint is for those who haven't yet discovered their power. "
            "You celebrate color — gold, crimson, electric blue, leopard print. You celebrate drama, pattern, "
            "and the visceral joy of being seen. You know that confidence is always the best accessory. "
            "Your advice is bold, celebratory, sensual, and utterly unforgettable."
        ),
    },
}


async def _claude_text(system: str, user: str, model: str = None, max_tokens: int = 2000) -> str:
    """Call Claude text API. Returns empty string on any error."""
    if not ANTHROPIC_API_KEY:
        return ""
    try:
        cli = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        msg = await cli.messages.create(
            model=model or AI_SMART_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return msg.content[0].text if msg.content else ""
    except Exception as e:
        logger.error(f"Claude text error: {e}")
        return ""


async def _claude_vision(system: str, image_b64: str, text: str, max_tokens: int = 600) -> str:
    """Call Claude with base64 image + text. Returns empty string on error."""
    if not ANTHROPIC_API_KEY:
        return ""
    try:
        cli = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        msg = await cli.messages.create(
            model=AI_FAST_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": image_b64,
                        },
                    },
                    {"type": "text", "text": text},
                ],
            }],
        )
        return msg.content[0].text if msg.content else ""
    except Exception as e:
        logger.error(f"Claude vision error: {e}")
        return ""


async def _claude_vision_url(system: str, image_url: str, text: str, max_tokens: int = 600) -> str:
    """Call Claude with an image URL + text. Returns empty string on error."""
    if not ANTHROPIC_API_KEY:
        return ""
    try:
        cli = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        msg = await cli.messages.create(
            model=AI_FAST_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "url",
                            "url": image_url,
                        },
                    },
                    {"type": "text", "text": text},
                ],
            }],
        )
        return msg.content[0].text if msg.content else ""
    except Exception as e:
        logger.error(f"Claude vision URL error: {e}")
        return ""


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


_TAG_SCHEMA_HINT = (
    'Return ONLY a JSON object with these exact keys:\n'
    '{"type": "e.g. blouse / jeans / trench coat",\n'
    ' "category": one of [tops, bottoms, dresses, outerwear, shoes, accessories, activewear, intimates, bags],\n'
    ' "color": "dominant color",\n'
    ' "pattern": "solid / striped / floral / plaid / animal print / etc",\n'
    ' "material": "cotton / denim / silk / leather / etc",\n'
    ' "season": ["spring","summer","fall","winter"] (any that apply),\n'
    ' "occasion": ["casual","work","formal","evening","sport","beach","loungewear"] (any that apply),\n'
    ' "formality": "casual / smart-casual / formal",\n'
    ' "description": "concise label, e.g. cream silk blouse or washed black slim jeans"}'
)
_TAG_SYS_PROMPT = (
    "You are an expert fashion cataloger with an eye trained at top fashion houses. "
    "Given a garment photo, produce a precise JSON description. "
    "Output ONLY the JSON object — no prose, no markdown fences, no commentary."
)


def _parse_tag_data(data: Optional[Dict[str, Any]]) -> ItemTags:
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


async def ai_tag_item(image_base64: str) -> ItemTags:
    if not ANTHROPIC_API_KEY:
        return ItemTags(description="Untagged item")
    raw = await _claude_vision(_TAG_SYS_PROMPT, _strip_data_url(image_base64), _TAG_SCHEMA_HINT, max_tokens=600)
    return _parse_tag_data(_safe_json_loads(raw) if raw else None)


async def _tag_item_from_url(image_url: str) -> Dict[str, Any]:
    """Tag a garment from an image URL. Returns a dict (not ItemTags) for camera roll usage."""
    if not ANTHROPIC_API_KEY:
        return {"category": "Item", "description": "Untagged item"}
    raw = await _claude_vision_url(_TAG_SYS_PROMPT, image_url, _TAG_SCHEMA_HINT, max_tokens=600)
    data = _safe_json_loads(raw) if raw else None
    return data or {"category": "Item", "description": "Untagged item"}


def closet_doc_to_out(doc: dict, item_count: int = 0) -> ClosetOut:
    return ClosetOut(
        closet_id=doc["closet_id"],
        user_id=doc["user_id"],
        name=doc["name"],
        description=doc.get("description"),
        is_default=doc.get("is_default", False),
        item_count=item_count,
        closet_type=doc.get("closet_type", "wardrobe"),
        created_at=doc["created_at"],
    )


def item_doc_to_out(d: Dict[str, Any]) -> ItemOut:
    return ItemOut(
        item_id=d["item_id"],
        user_id=d["user_id"],
        name=d.get("name", "") or "",
        image_base64=d.get("image_base64", "") or "",
        image_url=d.get("image_url"),
        tags=ItemTags(**(d.get("tags") or {})),
        fidelity_mode=d.get("fidelity_mode", "descriptive"),
        brand=d.get("brand"),
        product_name=d.get("product_name"),
        product_url=d.get("product_url"),
        favorite=d.get("favorite", False),
        listing_status=d.get("listing_status"),
        times_worn=d.get("times_worn", 0),
        last_worn_at=d.get("last_worn_at"),
        price=d.get("price"),
        purchased_at=d.get("purchased_at"),
        created_at=d.get("created_at", utcnow()),
    )


# ---------------------- AI Endpoints ----------------------
@api.post("/ai/tag-item")
async def ai_tag_endpoint(body: TagRequest, current=Depends(get_current_user)):
    if not _check_rate(current["user_id"], "tag", max_calls=30):
        raise HTTPException(status_code=429, detail="Too many tagging requests. Try again in an hour.")
    if body.image_url:
        raw = await _claude_vision_url(_TAG_SYS_PROMPT, body.image_url, _TAG_SCHEMA_HINT, max_tokens=600)
        tags = _parse_tag_data(_safe_json_loads(raw) if raw else None)
    elif body.image_base64:
        tags = await ai_tag_item(body.image_base64)
    else:
        raise HTTPException(status_code=400, detail="Either image_base64 or image_url is required")
    return {"tags": tags.model_dump()}


@api.post("/upload/presign")
async def presign_upload(body: PresignIn, current=Depends(get_current_user)):
    if not S3_BUCKET or not AWS_ACCESS_KEY_ID:
        raise HTTPException(status_code=503, detail="S3 not configured")
    safe_name = re.sub(r"[^\w.\-]", "_", body.filename)
    key = f"users/{current['user_id']}/items/{utcnow().strftime('%Y%m%d%H%M%S')}_{safe_name}"
    presigned_url = await generate_presigned_url(key, body.content_type)
    public_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{key}"
    return {"presigned_url": presigned_url, "public_url": public_url, "key": key}


@api.post("/ai/stylist", response_model=StylistResponse)
async def ai_stylist(body: StylistRequest, current=Depends(get_current_user)):
    if not _check_rate(current["user_id"], "stylist", max_calls=10):
        raise HTTPException(status_code=429, detail="Too many stylist requests. Try again in an hour.")
    cursor = db.items.find({"user_id": current["user_id"]}, {"_id": 0, "image_base64": 0})
    items: List[Dict[str, Any]] = await cursor.to_list(500)
    if not items:
        return StylistResponse(
            message="Your closet is empty. Add a few items first so I can style outfits from what you actually own.",
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

    persona_key = current.get("stylist_persona", DEFAULT_PERSONA)
    persona = FASHION_PERSONAS.get(persona_key, FASHION_PERSONAS[DEFAULT_PERSONA])

    sys_msg = (
        f"{persona['system_intro']}\n\n"
        "Your task: compose complete outfits ONLY from the user's wardrobe catalog below. "
        "Each outfit must use item IDs exactly as listed — never invent IDs. "
        "Return ONLY a strict JSON object, no prose before or after:\n"
        '{"message": "your opening remark as this persona (1-2 sentences, in character)", '
        '"outfits": [{"title": string, "description": string (2-3 sentences, fully in character), '
        '"item_ids": [string], "vibe": string}]}'
    )

    prompt = (
        f"User request: {body.prompt}\n"
        f"Occasion: {body.occasion or 'unspecified'}\n"
        f"Weather/season: {body.weather or 'unspecified'}\n"
        f"Number of outfits desired: {body.num_outfits}\n\n"
        f"Wardrobe catalog:\n{catalog}\n\n"
        f"Compose {body.num_outfits} distinct, inspired outfit ideas. Respond in character. Return JSON only."
    )

    raw = await _claude_text(sys_msg, prompt, max_tokens=2500)
    if not raw:
        return StylistResponse(message="Stylist is taking a break — try again in a moment.", outfits=[])

    data = _safe_json_loads(raw)
    if not data:
        return StylistResponse(message="Couldn't generate looks right now.", outfits=[])

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
    return StylistResponse(message=str(data.get("message", "Here are your looks.")), outfits=outfits)


# ---------------------- Items CRUD ----------------------
@api.post("/items/barcode-lookup")
async def barcode_lookup(body: BarcodeIn, current=Depends(get_current_user)):
    """Look up a product by UPC/EAN barcode using the free UPCitemdb trial API."""
    barcode = body.barcode.strip()
    if not barcode:
        raise HTTPException(status_code=400, detail="barcode required")
    try:
        async with httpx.AsyncClient(timeout=8.0) as cli:
            r = await cli.get(
                f"https://api.upcitemdb.com/prod/trial/lookup",
                params={"upc": barcode},
                headers={"Accept": "application/json"},
            )
        if r.status_code == 429:
            return {"found": False, "reason": "rate_limited"}
        if r.status_code == 200:
            data = r.json()
            items_list = data.get("items") or []
            if items_list:
                first = items_list[0]
                images = first.get("images") or []
                return {
                    "found": True,
                    "name": first.get("title") or first.get("description") or "",
                    "brand": first.get("brand") or "",
                    "description": first.get("description") or "",
                    "image_url": images[0] if images else None,
                }
        return {"found": False}
    except Exception as e:
        logger.error(f"barcode_lookup error: {e}")
        return {"found": False}


@api.post("/items/barcode-add")
async def barcode_add(body: BarcodeIn, current=Depends(get_current_user)):
    """Look up barcode, AI-tag the garment, and create it in the user's default closet."""
    barcode = body.barcode.strip()
    if not barcode:
        raise HTTPException(status_code=400, detail="barcode required")

    # 1. Look up product
    product = {"found": False}
    try:
        async with httpx.AsyncClient(timeout=8.0) as cli:
            r = await cli.get(
                "https://api.upcitemdb.com/prod/trial/lookup",
                params={"upc": barcode},
                headers={"Accept": "application/json"},
            )
        if r.status_code == 429:
            return {"added": False, "reason": "Barcode lookup rate limit reached. Try again later."}
        if r.status_code == 200:
            items_list = r.json().get("items") or []
            if items_list:
                first = items_list[0]
                images = first.get("images") or []
                product = {
                    "found": True,
                    "name": first.get("title") or first.get("description") or "",
                    "brand": first.get("brand") or "",
                    "description": first.get("description") or "",
                    "image_url": images[0] if images else None,
                }
    except Exception as e:
        logger.error(f"barcode_add lookup error: {e}")

    if not product["found"]:
        return {"added": False, "reason": "Product not found in database"}

    # 2. AI-tag the garment
    tags = None
    image_url = product.get("image_url")
    if image_url:
        raw = await _claude_vision_url(_TAG_SYS_PROMPT, image_url, _TAG_SCHEMA_HINT, max_tokens=600)
        tags = _parse_tag_data(_safe_json_loads(raw) if raw else None)
    else:
        # Tag from text description when no image
        text_prompt = (
            f"Product: {product['name']}\nBrand: {product['brand']}\n"
            f"Description: {product['description']}\n\n"
            "Extract clothing tags as JSON matching the schema. "
            "If this is not a clothing item, set type to 'other'.\n"
            f"{_TAG_SCHEMA_HINT}"
        )
        try:
            cli = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
            msg = await cli.messages.create(
                model=AI_FAST_MODEL,
                max_tokens=400,
                messages=[{"role": "user", "content": text_prompt}],
            )
            raw = msg.content[0].text if msg.content else None
            tags = _parse_tag_data(_safe_json_loads(raw) if raw else None)
        except Exception as e:
            logger.error(f"barcode_add AI tag error: {e}")

    if tags is None:
        tags = ItemTags()

    # 3. Resolve default closet — create one if it doesn't exist yet
    user_id = current["user_id"]
    closet = await db.closets.find_one({"user_id": user_id, "is_default": True})
    if closet:
        closet_id = closet["closet_id"]
    else:
        closet_id = "clt_" + uuid.uuid4().hex[:16]
        await db.closets.insert_one({
            "closet_id": closet_id,
            "user_id": user_id,
            "name": "My Wardrobe",
            "is_default": True,
            "created_at": utcnow(),
        })

    # 4. Create item
    item_id = new_id("item")
    now = utcnow()
    doc = {
        "item_id": item_id,
        "user_id": user_id,
        "closet_id": closet_id,
        "image_url": image_url,
        "image_base64": None,
        "name": product["name"],
        "brand": product["brand"],
        "tags": tags.model_dump(),
        "times_worn": 0,
        "last_worn_at": None,
        "price": None,
        "purchased_at": None,
        "created_at": now,
    }
    await db.items.insert_one(doc)
    return {"added": True, "item": item_doc_to_out(doc).model_dump()}


@api.post("/items")
async def create_item(body: CreateItemIn, current=Depends(get_current_user)):
    if not body.image_base64 and not body.image_url:
        raise HTTPException(status_code=400, detail="Either image_base64 or image_url is required")

    image_b64 = _strip_data_url(body.image_base64) if body.image_base64 else ""
    image_url = body.image_url or None

    # AI tagging
    if body.tags:
        tags = body.tags
    elif image_url:
        raw = await _claude_vision_url(_TAG_SYS_PROMPT, image_url, _TAG_SCHEMA_HINT, max_tokens=600)
        tags = _parse_tag_data(_safe_json_loads(raw) if raw else None)
    else:
        tags = await ai_tag_item(image_b64)

    name = body.name or (tags.description or tags.type or "Item")

    # Resolve closet_id — use provided, or find/create default
    closet_id = body.closet_id
    if not closet_id:
        default_closet = await db.closets.find_one({"user_id": current["user_id"], "is_default": True})
        if default_closet:
            closet_id = default_closet["closet_id"]
        else:
            closet_id = "clt_" + uuid.uuid4().hex[:16]
            await db.closets.insert_one({
                "closet_id": closet_id,
                "user_id": current["user_id"],
                "name": "My Wardrobe",
                "is_default": True,
                "created_at": utcnow(),
            })

    doc = {
        "item_id": new_id("itm"),
        "user_id": current["user_id"],
        "name": name,
        "image_base64": image_b64,
        "image_url": image_url,
        "tags": tags.model_dump(),
        "fidelity_mode": body.fidelity_mode or current.get("fidelity_mode", "descriptive"),
        "brand": body.brand or None,
        "favorite": False,
        "times_worn": 0,
        "closet_id": closet_id,
        "created_at": utcnow(),
    }
    if body.price is not None:
        doc["price"] = body.price
    if body.purchased_at is not None:
        doc["purchased_at"] = body.purchased_at
    if body.person_tag is not None:
        doc["person_tag"] = body.person_tag
    if doc["fidelity_mode"] == "identified":
        # MOCKED identified mode (Ximilar/Google Lens not integrated yet)
        doc.setdefault("brand", None)
        doc["product_name"] = None
        doc["product_url"] = None
    await db.items.insert_one(doc)
    await award_points(current["user_id"], 10, "item_added")
    asyncio.create_task(_record_activity(current["user_id"], "item_added", {"item_id": doc["item_id"], "name": name, "category": tags.category}))
    return {"item": item_doc_to_out(doc).model_dump()}


@api.get("/items")
async def list_items(
    category: Optional[str] = None,
    color: Optional[str] = None,
    season: Optional[str] = None,
    occasion: Optional[str] = None,
    favorite: Optional[bool] = None,
    closet_id: Optional[str] = None,
    person_tag: Optional[str] = Query(None),
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
    if closet_id:
        q["closet_id"] = closet_id
    if person_tag:
        q["person_tag"] = person_tag
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
    if body.price is not None:
        updates["price"] = body.price
    if body.purchased_at is not None:
        updates["purchased_at"] = body.purchased_at
    if body.person_tag is not None:
        updates["person_tag"] = body.person_tag
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


# ---------------------- Closets CRUD ----------------------
@api.post("/closets")
async def create_closet(body: CreateClosetIn, current=Depends(get_current_user)):
    user_id = current["user_id"]
    existing_count = await db.closets.count_documents({"user_id": user_id})
    is_default = existing_count == 0
    closet_id = "clt_" + uuid.uuid4().hex[:16]
    doc = {
        "closet_id": closet_id,
        "user_id": user_id,
        "name": body.name.strip(),
        "description": body.description,
        "is_default": is_default,
        "closet_type": body.closet_type,
        "created_at": utcnow(),
    }
    await db.closets.insert_one(doc)
    return {"closet": closet_doc_to_out(doc, item_count=0).model_dump()}


@api.get("/closets")
async def list_closets(current=Depends(get_current_user)):
    user_id = current["user_id"]
    docs = await db.closets.find({"user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(100)
    result = []
    for doc in docs:
        count = await db.items.count_documents({"user_id": user_id, "closet_id": doc["closet_id"]})
        result.append(closet_doc_to_out(doc, item_count=count).model_dump())
    return {"closets": result}


@api.get("/closets/{closet_id}")
async def get_closet(closet_id: str, current=Depends(get_current_user)):
    doc = await db.closets.find_one({"closet_id": closet_id, "user_id": current["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Closet not found")
    count = await db.items.count_documents({"user_id": current["user_id"], "closet_id": closet_id})
    return {"closet": closet_doc_to_out(doc, item_count=count).model_dump()}


@api.put("/closets/{closet_id}")
async def update_closet(closet_id: str, body: UpdateClosetIn, current=Depends(get_current_user)):
    updates: Dict[str, Any] = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.description is not None:
        updates["description"] = body.description
    if not updates:
        doc = await db.closets.find_one({"closet_id": closet_id, "user_id": current["user_id"]}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Closet not found")
        count = await db.items.count_documents({"user_id": current["user_id"], "closet_id": closet_id})
        return {"closet": closet_doc_to_out(doc, item_count=count).model_dump()}
    res = await db.closets.update_one(
        {"closet_id": closet_id, "user_id": current["user_id"]},
        {"$set": updates},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Closet not found")
    doc = await db.closets.find_one({"closet_id": closet_id, "user_id": current["user_id"]}, {"_id": 0})
    count = await db.items.count_documents({"user_id": current["user_id"], "closet_id": closet_id})
    return {"closet": closet_doc_to_out(doc, item_count=count).model_dump()}


@api.delete("/closets/{closet_id}")
async def delete_closet(closet_id: str, current=Depends(get_current_user)):
    doc = await db.closets.find_one({"closet_id": closet_id, "user_id": current["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Closet not found")
    if doc.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete the default closet")
    await db.closets.delete_one({"closet_id": closet_id, "user_id": current["user_id"]})
    return {"ok": True}


@api.post("/items/{item_id}/wear")
async def mark_item_worn(item_id: str, current=Depends(get_current_user)):
    res = await db.items.find_one_and_update(
        {"item_id": item_id, "user_id": current["user_id"]},
        {"$inc": {"times_worn": 1}, "$set": {"last_worn_at": utcnow()}},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Item not found")
    res.pop("_id", None)
    return {"item": item_doc_to_out(res).model_dump()}


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
        "rating": body.rating,
        "created_at": utcnow(),
    }
    await db.outfits.insert_one(doc)
    await award_points(current["user_id"], 20, "outfit_saved")
    asyncio.create_task(_record_activity(current["user_id"], "outfit_saved", {"outfit_id": doc["outfit_id"], "title": body.title}))
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


@api.patch("/outfits/{outfit_id}/rating")
async def rate_outfit(outfit_id: str, body: OutfitRatingIn, current=Depends(get_current_user)):
    if not 1 <= body.rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    res = await db.outfits.find_one_and_update(
        {"outfit_id": outfit_id, "user_id": current["user_id"]},
        {"$set": {"rating": body.rating}},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Outfit not found")
    res.pop("_id", None)
    return {"outfit": OutfitOut(**res).model_dump()}


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
    """Asks the AI stylist to choose items from the user's closet that best match the lookbook vibe."""
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

    persona_key = current.get("stylist_persona", DEFAULT_PERSONA)
    persona = FASHION_PERSONAS.get(persona_key, FASHION_PERSONAS[DEFAULT_PERSONA])

    sys_msg = (
        f"{persona['system_intro']}\n\n"
        "Your task: pick 3-6 items from the user's wardrobe that best capture the lookbook energy. "
        'Return ONLY JSON: {"title": string, "description": string (2-3 sentences in character), "item_ids": [string]}'
    )
    prompt = (
        f"Lookbook: {lb['title']} — {lb['subtitle']}. Vibe: {lb['vibe']}. Tags: {', '.join(lb['tags'])}.\n\n"
        f"Catalog:\n{catalog}\n\nRecreate this look from the catalog. Return JSON only."
    )
    raw = await _claude_text(sys_msg, prompt, max_tokens=600)
    data = _safe_json_loads(raw) if raw else None
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


# ---------------------- Personas ----------------------
@api.get("/personas")
async def list_personas(current=Depends(get_current_user)):
    """Returns all available fashion AI personas."""
    result = []
    for key, p in FASHION_PERSONAS.items():
        result.append({
            "id": key,
            "name": p["name"],
            "tagline": p["tagline"],
            "description": p["description"],
            "emoji": p["emoji"],
        })
    return {"personas": result, "current": current.get("stylist_persona", DEFAULT_PERSONA)}


# ---------------------- Categories ----------------------
DEFAULT_CATEGORIES = ["tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"]


@api.get("/users/me/categories")
async def get_categories(current=Depends(get_current_user)):
    custom = current.get("custom_categories") or []
    all_cats = DEFAULT_CATEGORIES + [c for c in custom if c not in DEFAULT_CATEGORIES]
    return {"categories": all_cats, "default": DEFAULT_CATEGORIES, "custom": custom}


@api.post("/users/me/categories")
async def add_category(body: AddCategoryIn, current=Depends(get_current_user)):
    name = body.name.strip().lower()
    if not name:
        raise HTTPException(status_code=400, detail="Category name required")
    if name in DEFAULT_CATEGORIES:
        raise HTTPException(status_code=400, detail="That's already a default category")
    custom = current.get("custom_categories") or []
    if name in custom:
        raise HTTPException(status_code=400, detail="Category already exists")
    if len(custom) >= 20:
        raise HTTPException(status_code=400, detail="Maximum 20 custom categories")
    await db.users.update_one(
        {"user_id": current["user_id"]},
        {"$push": {"custom_categories": name}},
    )
    return {"categories": DEFAULT_CATEGORIES + custom + [name]}


@api.delete("/users/me/categories/{name}")
async def delete_category(name: str, current=Depends(get_current_user)):
    cat = name.strip().lower()
    if cat in DEFAULT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Cannot delete default categories")
    await db.users.update_one(
        {"user_id": current["user_id"]},
        {"$pull": {"custom_categories": cat}},
    )
    custom = (current.get("custom_categories") or [])
    custom = [c for c in custom if c != cat]
    return {"categories": DEFAULT_CATEGORIES + custom}


# ---------------------- Points ----------------------
@api.get("/users/me/points")
async def get_points(current=Depends(get_current_user)):
    pts = current.get("points", 0)
    return {"points": pts, "level": points_level(pts)}


# ---------------------- Listings (Donate/Swap) ----------------------
@api.patch("/items/{item_id}/listing")
async def update_listing(item_id: str, body: ListingUpdateIn, current=Depends(get_current_user)):
    """Set listing_status to 'donate', 'swap', or null to remove."""
    status = body.status
    if status not in (None, "donate", "swap"):
        raise HTTPException(status_code=400, detail="status must be 'donate', 'swap', or null")
    res = await db.items.update_one(
        {"item_id": item_id, "user_id": current["user_id"]},
        {"$set": {"listing_status": status}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    d = await db.items.find_one({"item_id": item_id, "user_id": current["user_id"]}, {"_id": 0})
    return {"item": item_doc_to_out(d).model_dump()}


@api.get("/items/listings/mine")
async def my_listings(current=Depends(get_current_user)):
    cursor = db.items.find(
        {"user_id": current["user_id"], "listing_status": {"$in": ["donate", "swap"]}},
        {"_id": 0},
    ).sort("created_at", -1)
    docs = await cursor.to_list(200)
    return {"items": [item_doc_to_out(d).model_dump() for d in docs]}


@api.get("/items/listings/community")
async def community_listings(current=Depends(get_current_user)):
    """Browse all listings from other users (no images for privacy — just metadata)."""
    cursor = db.items.find(
        {"listing_status": {"$in": ["donate", "swap"]}, "user_id": {"$ne": current["user_id"]}},
        {"_id": 0, "image_base64": 0},
    ).sort("created_at", -1).limit(100)
    docs = await cursor.to_list(100)
    # Attach owner first name
    result = []
    for d in docs:
        owner = await db.users.find_one({"user_id": d.get("user_id")}, {"name": 1})
        owner_name = (owner.get("name") or "").split()[0] if owner else "Someone"
        entry = item_doc_to_out(d).model_dump()
        entry["image_base64"] = ""  # strip image for community view
        entry["owner_name"] = owner_name
        result.append(entry)
    return {"items": result}


# ---------------------- Store Suggestions ----------------------
@api.get("/users/me/suggestions")
async def get_suggestions(current=Depends(get_current_user)):
    """AI-generated wardrobe gap analysis with store links. Cached for 24h."""
    if not _check_rate(current["user_id"], "suggestions", max_calls=5):
        raise HTTPException(status_code=429, detail="Too many requests. Try again in an hour.")
    # Check cache
    cached = current.get("wardrobe_suggestions")
    cached_at = current.get("wardrobe_suggestions_at")
    if cached and cached_at:
        if isinstance(cached_at, datetime):
            if cached_at.tzinfo is None:
                cached_at = cached_at.replace(tzinfo=timezone.utc)
            if (utcnow() - cached_at).total_seconds() < 86400:
                return {"suggestions": cached, "cached": True}

    if not ANTHROPIC_API_KEY:
        # Return static placeholder suggestions
        return {
            "suggestions": [
                {
                    "gap_title": "Versatile White Button-Down",
                    "description": "A classic white shirt anchors both casual and formal looks.",
                    "search_term": "white button-down shirt",
                    "store": "Uniqlo",
                    "store_search_url": "https://www.uniqlo.com/us/en/search?q=white+button-down+shirt",
                },
                {
                    "gap_title": "Well-Fitted Dark Jeans",
                    "description": "Dark denim transitions from day to night seamlessly.",
                    "search_term": "slim dark jeans",
                    "store": "ASOS",
                    "store_search_url": "https://www.asos.com/search/?q=slim+dark+jeans",
                },
                {
                    "gap_title": "Neutral Blazer",
                    "description": "Elevates any outfit instantly — wear over a t-shirt or dress.",
                    "search_term": "neutral blazer",
                    "store": "Zara",
                    "store_search_url": "https://www.zara.com/us/en/search?searchTerm=neutral+blazer",
                },
            ],
            "cached": False,
        }

    # Fetch user's items for context
    cursor = db.items.find({"user_id": current["user_id"]}, {"_id": 0, "image_base64": 0})
    items = await cursor.to_list(200)

    if not items:
        suggestions = [
            {
                "gap_title": "Start with basics",
                "description": "Add your first items so I can suggest wardrobe gaps.",
                "search_term": "wardrobe essentials",
                "store": "H&M",
                "store_search_url": "https://www2.hm.com/en_us/search-results.html?q=wardrobe+essentials",
            }
        ]
        return {"suggestions": suggestions, "cached": False}

    catalog_summary = []
    for it in items[:50]:
        t = it.get("tags") or {}
        catalog_summary.append(
            f"- {t.get('description') or it.get('name','item')} "
            f"({t.get('category','')} / {t.get('color','')} / {t.get('formality','')})"
        )

    stores = {
        "H&M": "https://www2.hm.com/en_us/search-results.html?q={q}",
        "Zara": "https://www.zara.com/us/en/search?searchTerm={q}",
        "ASOS": "https://www.asos.com/search/?q={q}",
        "Nordstrom": "https://www.nordstrom.com/sr?origin=keywordsearch&keyword={q}",
        "Uniqlo": "https://www.uniqlo.com/us/en/search?q={q}",
    }

    persona_key = current.get("stylist_persona", DEFAULT_PERSONA)
    persona = FASHION_PERSONAS.get(persona_key, FASHION_PERSONAS[DEFAULT_PERSONA])

    sys_msg = (
        f"{persona['system_intro']}\n\n"
        "Analyze this wardrobe and identify the most important gaps. "
        "Return ONLY a JSON object — no prose before or after:\n"
        '{"suggestions": [{"gap_title": string (short, compelling), '
        '"description": string (1 sentence fully in your persona\'s voice), '
        '"search_term": "2-4 word search phrase", '
        '"store": one of ["H&M","Zara","ASOS","Nordstrom","Uniqlo"]}]}\n'
        "Return exactly 4-5 suggestions."
    )
    prompt = (
        f"User's current wardrobe ({len(items)} items):\n"
        + "\n".join(catalog_summary)
        + "\n\nAs yourself, identify 4-5 gaps. Return JSON only."
    )

    raw = await _claude_text(sys_msg, prompt, max_tokens=900)
    data = _safe_json_loads(raw) if raw else None
    raw_suggestions = (data or {}).get("suggestions") or []

    # Build full store search URLs
    final = []
    for s in raw_suggestions[:5]:
        store = s.get("store", "H&M")
        q = (s.get("search_term") or "").replace(" ", "+")
        url_template = stores.get(store, stores["H&M"])
        final.append({
            "gap_title": str(s.get("gap_title", ""))[:80],
            "description": str(s.get("description", ""))[:200],
            "search_term": s.get("search_term", ""),
            "store": store,
            "store_search_url": url_template.replace("{q}", q),
            "persona": persona["name"],
        })

    if not final:
        raise HTTPException(status_code=500, detail="Could not generate suggestions")

    # Cache in user doc
    await db.users.update_one(
        {"user_id": current["user_id"]},
        {"$set": {"wardrobe_suggestions": final, "wardrobe_suggestions_at": utcnow()}},
    )
    return {"suggestions": final, "cached": False}


# ---------------------- Referral ----------------------
@api.get("/users/me/referral")
async def get_referral(current=Depends(get_current_user)):
    """Returns (or generates) the user's unique referral code and stats."""
    user_id = current["user_id"]
    code = current.get("referral_code")
    if not code:
        # Generate a unique 8-char uppercase alphanumeric code
        import string
        alphabet = string.ascii_uppercase + string.digits
        for _ in range(10):
            candidate = "".join(random.choices(alphabet, k=8))
            clash = await db.users.find_one({"referral_code": candidate}, {"_id": 1})
            if not clash:
                code = candidate
                break
        await db.users.update_one({"user_id": user_id}, {"$set": {"referral_code": code}})
    total_referrals = await db.users.count_documents({"referred_by": user_id, "referral_bonus_awarded": True})
    referral_url = f"{APP_URL}?ref={code}"
    return {"code": code, "referral_url": referral_url, "total_referrals": total_referrals}


# ---------------------- Feedback ----------------------
@api.post("/feedback")
async def submit_feedback(body: FeedbackIn, current=Depends(get_current_user)):
    """Store user feedback in the feedback collection."""
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    doc = {
        "feedback_id": new_id("fb"),
        "user_id": current["user_id"],
        "email": current["email"],
        "message": body.message.strip(),
        "category": body.category or "General",
        "created_at": utcnow(),
    }
    await db.feedback.insert_one(doc)
    return {"ok": True}


# ---------------------- Billing (Square) ----------------------

SQUARE_BASE_URL = (
    "https://connect.squareup.com"
    if SQUARE_ENVIRONMENT == "production"
    else "https://connect.squareupsandbox.com"
)


def _square_headers() -> dict:
    return {
        "Authorization": f"Bearer {SQUARE_ACCESS_TOKEN}",
        "Square-Version": "2024-01-17",
        "Content-Type": "application/json",
    }


async def _square_create_payment_link(payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as cli:
        r = await cli.post(
            f"{SQUARE_BASE_URL}/v2/online-checkout/payment-links",
            headers=_square_headers(),
            json=payload,
        )
    return r.json()


async def _square_get_order(order_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as cli:
        r = await cli.get(
            f"{SQUARE_BASE_URL}/v2/orders/{order_id}",
            headers=_square_headers(),
        )
    return r.json()


def _verify_square_signature(payload: bytes, signature: str) -> bool:
    if not SQUARE_WEBHOOK_SIGNATURE_KEY or not signature:
        return False
    import hmac as _hmac
    import hashlib
    import base64
    mac = _hmac.new(
        SQUARE_WEBHOOK_SIGNATURE_KEY.encode(),
        (SQUARE_WEBHOOK_URL).encode() + payload,
        hashlib.sha256,
    )
    expected = base64.b64encode(mac.digest()).decode()
    return _hmac.compare_digest(signature, expected)


@api.post("/billing/checkout")
async def billing_checkout(body: CheckoutIn, current=Depends(get_current_user)):
    """Create a Square payment link for the selected plan."""
    if not SQUARE_ACCESS_TOKEN:
        raise HTTPException(status_code=503, detail="Billing not configured")
    plan_key = f"{body.plan}_{body.period}"
    amount = PLAN_AMOUNTS_CENTS.get(plan_key)
    if not amount:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {plan_key}")
    user_id = current["user_id"]
    ref_id = _sq_sub_ref(user_id, body.plan, body.period, body.addons)
    line_items = [{
        "name": PLAN_LABELS.get(plan_key, plan_key),
        "quantity": "1",
        "base_price_money": {"amount": amount, "currency": "USD"},
    }]
    for addon in body.addons:
        addon_amount = PLAN_AMOUNTS_CENTS.get(f"addon_{addon}", 0)
        if addon_amount:
            line_items.append({
                "name": ADDON_LABELS.get(addon, addon),
                "quantity": "1",
                "base_price_money": {"amount": addon_amount, "currency": "USD"},
            })
    result = await _square_create_payment_link({
        "idempotency_key": str(uuid.uuid4()),
        "order": {
            "location_id": SQUARE_LOCATION_ID,
            "reference_id": ref_id,
            "line_items": line_items,
        },
        "checkout_options": {
            "redirect_url": f"{APP_URL}?billing=success",
            "ask_for_shipping_address": False,
        },
    })
    if "errors" in result:
        logger.error(f"Square checkout error: {result['errors']}")
        raise HTTPException(status_code=500, detail="Failed to create checkout")
    return {"checkout_url": result["payment_link"]["url"]}


@api.post("/billing/portal")
async def billing_portal(current=Depends(get_current_user)):
    """Square has no billing portal — return cancel endpoint info."""
    return {
        "portal_url": None,
        "message": "To cancel your subscription, use the cancel option in Settings.",
        "cancel_endpoint": "/api/billing/cancel",
    }


@api.post("/billing/cancel")
async def billing_cancel(current=Depends(get_current_user)):
    """Cancel the user's subscription immediately."""
    await db.users.update_one(
        {"user_id": current["user_id"]},
        {"$set": {
            "plan_type": "free",
            "plan_period": "monthly",
            "plan_addons": [],
            "subscription_status": "cancelled",
        }},
    )
    return {"ok": True}


@api.post("/billing/webhook")
async def billing_webhook(
    request: Request,
    x_square_signature: Optional[str] = Header(None, alias="x-square-hmacsha256-signature"),
):
    """Handle Square webhook events."""
    body_bytes = await request.body()
    if SQUARE_WEBHOOK_SIGNATURE_KEY:
        if not _verify_square_signature(body_bytes, x_square_signature or ""):
            raise HTTPException(status_code=400, detail="Invalid signature")
    try:
        event = json.loads(body_bytes)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    etype = event.get("type", "")

    if etype == "payment.completed":
        payment = event.get("data", {}).get("object", {}).get("payment", {})
        order_id = payment.get("order_id")
        amount_cents = (payment.get("amount_money") or {}).get("amount", 0)
        if order_id and SQUARE_ACCESS_TOKEN:
            order_result = await _square_get_order(order_id)
            if "order" in order_result:
                order = order_result["order"]
                ref_id = order.get("reference_id", "")
                decoded = _sq_decode_ref(ref_id)
                if decoded:
                    user_id = decoded["user_id"]
                    if decoded["type"] == "points_purchase":
                        await award_points(user_id, decoded["points"], "points_purchase")
                    elif decoded["type"] == "subscription":
                        pts = math.floor(amount_cents / 100) * 50
                        await db.users.update_one(
                            {"user_id": user_id},
                            {"$set": {
                                "plan_type": decoded["plan"],
                                "plan_period": decoded["period"],
                                "plan_addons": decoded["addons"],
                                "subscription_status": "active",
                                "square_order_id": order_id,
                            }},
                        )
                        if pts > 0:
                            await award_points(user_id, pts, "subscription_payment")

    return {"received": True}


@api.get("/billing/status")
async def billing_status(current=Depends(get_current_user)):
    return {
        "plan_type": current.get("plan_type", "free"),
        "plan_period": current.get("plan_period", "monthly"),
        "plan_addons": current.get("plan_addons", []) or [],
        "subscription_status": current.get("subscription_status", "none"),
    }


# ---------------------- Points Redemption ----------------------
@api.post("/points/redeem")
async def redeem_points(body: PointsRedeemIn, current=Depends(get_current_user)):
    """Deduct points from a user's balance for in-app use (e.g. swap claims)."""
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    current_pts = current.get("points", 0)
    if current_pts < body.amount:
        raise HTTPException(status_code=400, detail=f"Insufficient points. You have {current_pts} pts.")
    result = await db.users.find_one_and_update(
        {"user_id": current["user_id"], "points": {"$gte": body.amount}},
        {"$inc": {"points": -body.amount}},
        return_document=True,
        projection={"points": 1},
    )
    if not result:
        raise HTTPException(status_code=400, detail="Insufficient points")
    new_pts = result.get("points", 0)
    logger.info(f"Points redeemed: user={current['user_id']} -{body.amount} ({body.reason}) -> total={new_pts}")
    return {"ok": True, "points_spent": body.amount, "points_remaining": new_pts}


# ---------------------- Camera Roll Scan ----------------------
@api.post("/scan/camera-roll")
async def scan_camera_roll(body: CameraRollScanIn, current=Depends(get_current_user)):
    """Processes a list of photos — for each one, asks GPT to extract the main garment and adds it to the closet."""
    # Resolve or create default closet once for the batch
    closet = await db.closets.find_one({"user_id": current["user_id"], "is_default": True})
    if not closet:
        cid = "clt_" + uuid.uuid4().hex[:16]
        await db.closets.insert_one({
            "closet_id": cid,
            "user_id": current["user_id"],
            "name": "My Wardrobe",
            "is_default": True,
            "created_at": utcnow(),
        })
        closet_id = cid
    else:
        closet_id = closet["closet_id"]

    created: List[Dict[str, Any]] = []
    errors = 0
    for raw in body.images_base64[:10]:  # cap at 10 per batch
        b64 = _strip_data_url(raw)
        try:
            tags = await ai_tag_item(b64)
            doc = {
                "item_id": new_id("itm"),
                "user_id": current["user_id"],
                "closet_id": closet_id,
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


# ---------------------- Camera Roll URL Scan ----------------------
class CameraRollUrlScanIn(BaseModel):
    image_urls: List[str]


@api.post("/scan/camera-roll-urls")
async def scan_camera_roll_urls(body: CameraRollUrlScanIn, current=Depends(get_current_user)):
    """Processes a list of S3 image URLs — for each one, tags the garment and adds it to the closet."""
    if not body.image_urls:
        raise HTTPException(status_code=400, detail="No images provided")
    image_urls = body.image_urls[:10]
    added = 0
    errors = 0
    items: List[Dict[str, Any]] = []
    for image_url in image_urls:
        try:
            tags_dict = await _tag_item_from_url(image_url)
            tags = _parse_tag_data(tags_dict)
            item_id = "itm_" + uuid.uuid4().hex[:16]
            now = utcnow()
            # Get or create default closet
            closet = await db.closets.find_one({"user_id": current["user_id"], "is_default": True})
            if not closet:
                cid = "clt_" + uuid.uuid4().hex[:16]
                await db.closets.insert_one({
                    "closet_id": cid,
                    "user_id": current["user_id"],
                    "name": "My Wardrobe",
                    "is_default": True,
                    "created_at": now,
                })
                closet = {"closet_id": cid}
            doc = {
                "item_id": item_id,
                "user_id": current["user_id"],
                "closet_id": closet["closet_id"],
                "name": tags.description or tags.type or "Item",
                "image_base64": "",
                "image_url": image_url,
                "tags": tags.model_dump(),
                "fidelity_mode": current.get("fidelity_mode", "descriptive"),
                "brand": None,
                "favorite": False,
                "listing_status": None,
                "times_worn": 0,
                "price": None,
                "purchased_at": None,
                "created_at": now,
            }
            await db.items.insert_one(doc)
            doc.pop("_id", None)
            items.append(item_doc_to_out(doc).model_dump())
            added += 1
            await award_points(current["user_id"], 10, "item_added")
        except Exception as e:
            logger.error(f"camera roll URL scan error: {e}")
            errors += 1
    return {"added": added, "errors": errors, "items": items}


# ---------------------- Persons (Family/Couples plan) ----------------------
@api.get("/users/me/persons")
async def list_persons(current=Depends(get_current_user)):
    user = await db.users.find_one({"user_id": current["user_id"]}, {"persons": 1, "plan_type": 1, "_id": 0})
    persons = user.get("persons", []) if user else []
    return {"persons": persons}

@api.post("/users/me/persons")
async def add_person(body: dict, current=Depends(get_current_user)):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    user = await db.users.find_one({"user_id": current["user_id"]}, {"persons": 1, "_id": 0})
    persons = user.get("persons", []) if user else []
    if len(persons) >= 10:
        raise HTTPException(status_code=400, detail="Max 10 persons")
    if name in persons:
        raise HTTPException(status_code=400, detail="Person already exists")
    persons.append(name)
    await db.users.update_one({"user_id": current["user_id"]}, {"$set": {"persons": persons}})
    return {"persons": persons}

@api.delete("/users/me/persons/{name}")
async def delete_person(name: str, current=Depends(get_current_user)):
    user = await db.users.find_one({"user_id": current["user_id"]}, {"persons": 1, "_id": 0})
    persons = [p for p in (user.get("persons") or []) if p != name]
    await db.users.update_one({"user_id": current["user_id"]}, {"$set": {"persons": persons}})
    return {"persons": persons}


# ---------------------- Virtual SWAP Box ----------------------
class SwapBoxListIn(BaseModel):
    item_id: str
    description: str = ""
    points_cost: int = 200

@api.post("/swapbox")
async def swapbox_list(body: SwapBoxListIn, current=Depends(get_current_user)):
    user_id = current["user_id"]
    item = await db.items.find_one({"item_id": body.item_id, "user_id": user_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    existing = await db.swap_box.find_one({"item_id": body.item_id, "status": "available"})
    if existing:
        raise HTTPException(status_code=400, detail="Item already in Swap Box")
    swb_id = "swb_" + uuid.uuid4().hex[:16]
    user = await db.users.find_one({"user_id": user_id}, {"name": 1, "_id": 0})
    doc = {
        "swap_box_id": swb_id,
        "user_id": user_id,
        "owner_name": (user.get("name") or "").split()[0],
        "item_id": body.item_id,
        "item_name": item.get("name", ""),
        "image_url": item.get("image_url", ""),
        "tags": item.get("tags", {}),
        "description": body.description,
        "points_cost": max(50, min(1000, body.points_cost)),
        "status": "available",
        "claimed_by": None,
        "claimed_at": None,
        "created_at": utcnow(),
    }
    await db.swap_box.insert_one(doc)
    await award_points(user_id, 100, "swap_box_listed")
    asyncio.create_task(_record_activity(user_id, "swap_listed", {"swap_box_id": swb_id, "item_name": item.get("name", "")}))
    return {"swap_box_id": swb_id, "points_awarded": 100}

@api.get("/swapbox")
async def swapbox_browse(current=Depends(get_current_user)):
    user_id = current["user_id"]
    cursor = db.swap_box.find({"status": "available", "user_id": {"$ne": user_id}}, {"_id": 0}).sort("created_at", -1)
    listings = await cursor.to_list(100)
    return {"items": listings}

@api.get("/swapbox/mine")
async def swapbox_mine(current=Depends(get_current_user)):
    cursor = db.swap_box.find({"user_id": current["user_id"]}, {"_id": 0}).sort("created_at", -1)
    listings = await cursor.to_list(50)
    return {"items": listings}

@api.post("/swapbox/{swap_box_id}/claim")
async def swapbox_claim(swap_box_id: str, current=Depends(get_current_user)):
    user_id = current["user_id"]
    listing = await db.swap_box.find_one({"swap_box_id": swap_box_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing["status"] != "available":
        raise HTTPException(status_code=400, detail="Already claimed")
    if listing["user_id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot claim own listing")
    user = await db.users.find_one({"user_id": user_id}, {"points": 1, "_id": 0})
    cost = listing["points_cost"]
    current_pts = user.get("points") or 0
    if current_pts < cost:
        raise HTTPException(status_code=400, detail=f"Need {cost} points")
    await db.users.update_one({"user_id": user_id}, {"$inc": {"points": -cost}})
    await db.swap_box.update_one({"swap_box_id": swap_box_id}, {"$set": {"status": "claimed", "claimed_by": user_id, "claimed_at": utcnow()}})
    return {"ok": True, "points_spent": cost, "points_remaining": current_pts - cost}

@api.delete("/swapbox/{swap_box_id}")
async def swapbox_remove(swap_box_id: str, current=Depends(get_current_user)):
    listing = await db.swap_box.find_one({"swap_box_id": swap_box_id, "user_id": current["user_id"]}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Not found")
    if listing["status"] == "claimed":
        raise HTTPException(status_code=400, detail="Already claimed, cannot remove")
    await db.swap_box.delete_one({"swap_box_id": swap_box_id})
    return {"ok": True}


# ---------------------- Buy Points (Square) ----------------------
class BuyPointsIn(BaseModel):
    pack: str  # "points_starter" | "points_popular" | "points_best"

POINTS_PACKS = {
    "points_starter": {"points": 500,  "label": "Starter",    "price_cents": 99},
    "points_popular": {"points": 1200, "label": "Popular",    "price_cents": 199},
    "points_best":    {"points": 2800, "label": "Best Value", "price_cents": 399},
}

@api.post("/billing/buy-points")
async def billing_buy_points(body: BuyPointsIn, current=Depends(get_current_user)):
    if body.pack not in POINTS_PACKS:
        raise HTTPException(status_code=400, detail="Invalid pack")
    pack_info = POINTS_PACKS[body.pack]
    user_id = current["user_id"]
    if not SQUARE_ACCESS_TOKEN:
        new_pts = await award_points(user_id, pack_info["points"], f"points_purchase_{body.pack}")
        return {"ok": True, "checkout_url": None, "dev_mode": True, "points_awarded": pack_info["points"], "total_points": new_pts}
    ref_id = _sq_pts_ref(user_id, body.pack, pack_info["points"])
    result = await _square_create_payment_link({
        "idempotency_key": str(uuid.uuid4()),
        "order": {
            "location_id": SQUARE_LOCATION_ID,
            "reference_id": ref_id,
            "line_items": [{
                "name": f"{pack_info['label']} - {pack_info['points']} Points",
                "quantity": "1",
                "base_price_money": {"amount": pack_info["price_cents"], "currency": "USD"},
            }],
        },
        "checkout_options": {
            "redirect_url": f"{APP_URL}/buy-points?success=1&pack={body.pack}",
            "ask_for_shipping_address": False,
        },
    })
    if "errors" in result:
        logger.error(f"Square buy-points error: {result['errors']}")
        raise HTTPException(status_code=500, detail="Failed to create checkout")
    return {"ok": True, "checkout_url": result["payment_link"]["url"]}


# ---------------------- Geo Services ----------------------
async def _places_nearby(lat: float, lng: float, keyword: str, radius: int = 5000) -> list:
    if not GOOGLE_PLACES_API_KEY:
        return []
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    params = {"location": f"{lat},{lng}", "radius": radius, "keyword": keyword, "key": GOOGLE_PLACES_API_KEY}
    async with httpx.AsyncClient(timeout=10.0) as cli:
        r = await cli.get(url, params=params)
    if r.status_code != 200:
        return []
    results = r.json().get("results", [])
    return [{"name": p.get("name"), "address": p.get("vicinity"), "rating": p.get("rating"), "place_id": p.get("place_id"), "open_now": p.get("opening_hours", {}).get("open_now")} for p in results[:10]]

@api.get("/services/grooming")
async def services_grooming(lat: float = Query(...), lng: float = Query(...), current=Depends(get_current_user)):
    results = await _places_nearby(lat, lng, "pet grooming")
    return {"results": results, "has_api_key": bool(GOOGLE_PLACES_API_KEY)}

@api.get("/services/organizers")
async def services_organizers(lat: float = Query(...), lng: float = Query(...), current=Depends(get_current_user)):
    results = await _places_nearby(lat, lng, "closet organizer home organization")
    return {"results": results, "has_api_key": bool(GOOGLE_PLACES_API_KEY)}

@api.get("/services/drycleaners")
async def services_drycleaners(lat: float = Query(...), lng: float = Query(...), current=Depends(get_current_user)):
    results = await _places_nearby(lat, lng, "dry cleaner laundry")
    return {"results": results, "has_api_key": bool(GOOGLE_PLACES_API_KEY)}

class ServiceBookingIn(BaseModel):
    service_type: str  # "drycleaner" | "organizer" | "groomer"
    place_id: str
    place_name: str
    place_address: str
    pickup_date: str  # ISO date string
    notes: str = ""

@api.post("/services/book")
async def services_book(body: ServiceBookingIn, current=Depends(get_current_user)):
    user_id = current["user_id"]
    booking_id = "bkn_" + uuid.uuid4().hex[:16]
    doc = {
        "booking_id": booking_id,
        "user_id": user_id,
        "service_type": body.service_type,
        "place_id": body.place_id,
        "place_name": body.place_name,
        "place_address": body.place_address,
        "pickup_date": body.pickup_date,
        "notes": body.notes,
        "status": "confirmed",
        "created_at": utcnow(),
    }
    await db.service_bookings.insert_one(doc)
    await award_points(user_id, 50, f"service_booking_{body.service_type}")
    return {"booking_id": booking_id, "points_awarded": 50}

@api.get("/services/bookings")
async def services_my_bookings(current=Depends(get_current_user)):
    cursor = db.service_bookings.find({"user_id": current["user_id"]}, {"_id": 0}).sort("created_at", -1)
    bookings = await cursor.to_list(50)
    return {"bookings": bookings}


# ---------------------- Friends ----------------------
class FriendRequestIn(BaseModel):
    email: str

@api.post("/friends/request")
async def friends_send_request(body: FriendRequestIn, current=Depends(get_current_user)):
    user_id = current["user_id"]
    target = await db.users.find_one({"email": body.email.lower().strip()}, {"user_id": 1, "name": 1, "_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["user_id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot add yourself")
    existing = await db.friends.find_one({
        "$or": [
            {"from_user_id": user_id, "to_user_id": target["user_id"]},
            {"from_user_id": target["user_id"], "to_user_id": user_id},
        ]
    })
    if existing:
        raise HTTPException(status_code=400, detail="Request already exists or already friends")
    req_id = "frq_" + uuid.uuid4().hex[:16]
    me = await db.users.find_one({"user_id": user_id}, {"name": 1, "_id": 0})
    await db.friends.insert_one({
        "request_id": req_id,
        "from_user_id": user_id,
        "from_name": me.get("name", ""),
        "to_user_id": target["user_id"],
        "to_name": target.get("name", ""),
        "status": "pending",
        "created_at": utcnow(),
    })
    return {"request_id": req_id}

@api.get("/friends/requests")
async def friends_requests(current=Depends(get_current_user)):
    user_id = current["user_id"]
    cursor = db.friends.find({"$or": [{"from_user_id": user_id}, {"to_user_id": user_id}], "status": "pending"}, {"_id": 0}).sort("created_at", -1)
    requests = await cursor.to_list(50)
    return {"requests": requests}

@api.post("/friends/request/{request_id}/respond")
async def friends_respond(request_id: str, body: dict, current=Depends(get_current_user)):
    action = body.get("action")  # "accept" | "reject"
    req = await db.friends.find_one({"request_id": request_id, "to_user_id": current["user_id"], "status": "pending"})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    new_status = "accepted" if action == "accept" else "rejected"
    await db.friends.update_one({"request_id": request_id}, {"$set": {"status": new_status}})
    return {"ok": True, "status": new_status}

@api.get("/friends")
async def friends_list(current=Depends(get_current_user)):
    user_id = current["user_id"]
    cursor = db.friends.find({"$or": [{"from_user_id": user_id}, {"to_user_id": user_id}], "status": "accepted"}, {"_id": 0})
    accepted = await cursor.to_list(100)
    friend_ids = []
    for r in accepted:
        fid = r["to_user_id"] if r["from_user_id"] == user_id else r["from_user_id"]
        friend_ids.append(fid)
    friends_data = []
    for fid in friend_ids:
        u = await db.users.find_one({"user_id": fid}, {"user_id": 1, "name": 1, "picture": 1, "points": 1, "_id": 0})
        if u:
            friends_data.append(u)
    return {"friends": friends_data}

@api.delete("/friends/{friend_user_id}")
async def friends_remove(friend_user_id: str, current=Depends(get_current_user)):
    user_id = current["user_id"]
    await db.friends.delete_one({
        "$or": [
            {"from_user_id": user_id, "to_user_id": friend_user_id},
            {"from_user_id": friend_user_id, "to_user_id": user_id},
        ],
        "status": "accepted",
    })
    return {"ok": True}

@api.get("/friends/{friend_user_id}/profile")
async def friends_profile(friend_user_id: str, current=Depends(get_current_user)):
    user_id = current["user_id"]
    # Check they are friends
    rel = await db.friends.find_one({
        "$or": [
            {"from_user_id": user_id, "to_user_id": friend_user_id},
            {"from_user_id": friend_user_id, "to_user_id": user_id},
        ],
        "status": "accepted",
    })
    if not rel:
        raise HTTPException(status_code=403, detail="Not friends")
    friend = await db.users.find_one({"user_id": friend_user_id}, {"user_id": 1, "name": 1, "picture": 1, "points": 1, "_id": 0})
    if not friend:
        raise HTTPException(status_code=404, detail="User not found")
    # Get shared closets
    closets_cursor = db.closets.find({"user_id": friend_user_id, "is_shared": True}, {"_id": 0, "closet_id": 1, "name": 1, "closet_type": 1})
    shared_closets = await closets_cursor.to_list(20)
    # Get public outfits (last 20)
    outfits_cursor = db.outfits.find({"user_id": friend_user_id}, {"_id": 0, "outfit_id": 1, "title": 1, "description": 1, "occasion": 1, "item_ids": 1, "rating": 1, "created_at": 1}).sort("created_at", -1)
    public_looks = await outfits_cursor.to_list(20)
    return {"friend": friend, "shared_closets": shared_closets, "public_looks": public_looks}

@api.get("/activity-feed")
async def activity_feed(current=Depends(get_current_user)):
    user_id = current["user_id"]
    # Get friend IDs
    cursor = db.friends.find({"$or": [{"from_user_id": user_id}, {"to_user_id": user_id}], "status": "accepted"}, {"_id": 0})
    accepted = await cursor.to_list(100)
    friend_ids = []
    for r in accepted:
        fid = r["to_user_id"] if r["from_user_id"] == user_id else r["from_user_id"]
        friend_ids.append(fid)
    if not friend_ids:
        return {"events": []}
    # Get activity events for friends
    events_cursor = db.activity_feed.find({"user_id": {"$in": friend_ids}}, {"_id": 0}).sort("created_at", -1)
    events = await events_cursor.to_list(50)
    return {"events": events}


async def _record_activity(user_id: str, event_type: str, data: dict):
    user = await db.users.find_one({"user_id": user_id}, {"name": 1, "_id": 0})
    await db.activity_feed.insert_one({
        "activity_id": "act_" + uuid.uuid4().hex[:12],
        "user_id": user_id,
        "user_name": (user.get("name") or "").split()[0],
        "event_type": event_type,
        "data": data,
        "created_at": utcnow(),
    })


# ---------------------- Admin / Migration ----------------------
@api.post("/admin/migrate/closets")
async def migrate_closets(x_admin_secret: Optional[str] = Header(None)):
    admin_secret = os.environ.get("ADMIN_SECRET", "")
    if not admin_secret or x_admin_secret != admin_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")
    users = await db.users.find({}, {"user_id": 1}).to_list(None)
    created = 0
    backfilled = 0
    for u in users:
        uid = u["user_id"]
        existing = await db.closets.find_one({"user_id": uid})
        if not existing:
            cid = "clt_" + uuid.uuid4().hex[:16]
            await db.closets.insert_one({
                "closet_id": cid,
                "user_id": uid,
                "name": "My Wardrobe",
                "is_default": True,
                "created_at": utcnow(),
            })
            result = await db.items.update_many(
                {"user_id": uid, "closet_id": {"$exists": False}},
                {"$set": {"closet_id": cid}},
            )
            backfilled += result.modified_count
            created += 1
    return {"created_closets": created, "backfilled_items": backfilled}


# ---------------------- Health ----------------------
@api.get("/")
async def root():
    return {"ok": True, "app": "wardrobe", "model": AI_SMART_MODEL}

@api.get("/debug/db")
async def debug_db():
    """Public debug endpoint — tests DB connection."""
    if db is None:
        return {"db": "None — MONGO_URL not set"}
    try:
        result = await db.command("ping")
        return {"db": "ok", "ping": result}
    except Exception as e:
        return {"db": "error", "error": type(e).__name__, "detail": str(e)}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    if JWT_SECRET == "dev_secret":
        logger.warning("JWT_SECRET is using the insecure default. Set the JWT_SECRET environment variable in production.")
    if db is None:
        logger.warning("No MONGO_URL set — database disabled")
        return
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.items.create_index([("user_id", 1), ("created_at", -1)])
        await db.items.create_index([("user_id", 1), ("closet_id", 1)])
        await db.outfits.create_index([("user_id", 1), ("created_at", -1)])
        await db.verification_codes.create_index("expires_at", expireAfterSeconds=0)
        await db.verification_codes.create_index([("target", 1), ("type", 1)], unique=True)
        await db.users.create_index("referral_code", sparse=True)
        await db.feedback.create_index([("user_id", 1), ("created_at", -1)])
        await db.closets.create_index([("user_id", 1)])
        await db.closets.create_index("closet_id", unique=True)
        await db.swap_box.create_index([("status", 1), ("created_at", -1)])
        await db.swap_box.create_index("item_id")
        await db.friends.create_index([("from_user_id", 1), ("to_user_id", 1)])
        await db.service_bookings.create_index([("user_id", 1), ("created_at", -1)])
        await db.activity_feed.create_index([("user_id", 1), ("created_at", -1)])
        logger.info("Wardrobe API ready")
    except Exception as e:
        logger.error(f"DB index creation failed (check Atlas Network Access whitelist): {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
