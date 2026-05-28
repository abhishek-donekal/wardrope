from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, Request
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
import smtplib
import random
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from anthropic import AsyncAnthropic
import stripe
import math

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "wardrobe")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev_secret")
JWT_EXPIRES_DAYS = int(os.environ.get("JWT_EXPIRES_DAYS", "30"))
AI_FAST_MODEL = "claude-3-5-haiku-20241022"   # vision + fast tagging
AI_SMART_MODEL = "claude-3-5-sonnet-20241022"  # stylist, suggestions, lookbook

# Email (SMTP) config
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Wardrope")
EMAIL_FROM = os.environ.get("EMAIL_FROM", SMTP_USER)
APP_URL = os.environ.get("APP_URL", "https://wardrope-red.vercel.app")

# Twilio SMS config (optional)
TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM = os.environ.get("TWILIO_PHONE_NUMBER", "")

# Stripe billing config
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

# AWS S3 config
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
S3_BUCKET = os.environ.get("S3_BUCKET", "")
S3_REGION = os.environ.get("S3_REGION", "us-east-1")

# Stripe price IDs — set these after creating prices in Stripe dashboard
# Keys: "{plan}_{period}", e.g. "single_monthly", "single_annual"
STRIPE_PRICES: Dict[str, str] = {
    "single_monthly":   os.environ.get("STRIPE_PRICE_SINGLE_MONTHLY", ""),
    "single_annual":    os.environ.get("STRIPE_PRICE_SINGLE_ANNUAL", ""),
    "couples_monthly":  os.environ.get("STRIPE_PRICE_COUPLES_MONTHLY", ""),
    "couples_annual":   os.environ.get("STRIPE_PRICE_COUPLES_ANNUAL", ""),
    "family_monthly":   os.environ.get("STRIPE_PRICE_FAMILY_MONTHLY", ""),
    "family_annual":    os.environ.get("STRIPE_PRICE_FAMILY_ANNUAL", ""),
    "addon_share":      os.environ.get("STRIPE_PRICE_ADDON_SHARE", ""),
    "addon_stylist":    os.environ.get("STRIPE_PRICE_ADDON_STYLIST", ""),
}

# Fallback plan amounts for display when Stripe not configured (cents)
PLAN_AMOUNTS_CENTS: Dict[str, int] = {
    "single_monthly": 199, "single_annual": 1791,
    "couples_monthly": 299, "couples_annual": 2691,
    "family_monthly": 499, "family_annual": 4491,
    "addon_share": 999, "addon_stylist": 399,
}

client = AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where()) if MONGO_URL else None
db = client[DB_NAME] if client else None

app = FastAPI(title="What's In My Wardrobe API")
api = APIRouter(prefix="/api")

logger = logging.getLogger("wardrobe")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


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
    async with session.client("s3") as s3:
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
    created_at: datetime


# ---------------------- Email & SMS helpers ----------------------
def _email_html(content: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#050505;margin:0;padding:0;">
  <div style="max-width:480px;margin:40px auto;padding:40px 32px;background:#111111;border:1px solid #1e1e1e;">
    <h1 style="color:#C5A059;font-size:26px;margin:0 0 4px;letter-spacing:1px;">WARDROPE</h1>
    <p style="color:#666;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 32px;">Your digital wardrobe</p>
    {content}
    <hr style="border:none;border-top:1px solid #222;margin:32px 0;">
    <p style="color:#444;font-size:11px;margin:0;">Wardrope &middot; <a href="{APP_URL}" style="color:#666;text-decoration:none;">{APP_URL}</a></p>
  </div>
</body>
</html>"""


async def send_email(to: str, subject: str, html_content: str) -> None:
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASS:
        logger.warning("SMTP not configured — email skipped")
        return
    html = _email_html(html_content)
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))

    def _send():
        try:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
                s.ehlo()
                s.starttls()
                s.login(SMTP_USER, SMTP_PASS)
                s.sendmail(EMAIL_FROM, to, msg.as_string())
            logger.info(f"Email sent to {to}: {subject}")
        except Exception as e:
            logger.error(f"SMTP send failed: {e}")

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send)


async def send_sms(to: str, body: str) -> None:
    if not TWILIO_SID or not TWILIO_TOKEN or not TWILIO_FROM:
        logger.warning("Twilio not configured — SMS skipped")
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as cli:
            r = await cli.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Messages.json",
                auth=(TWILIO_SID, TWILIO_TOKEN),
                data={"From": TWILIO_FROM, "To": to, "Body": body},
            )
            if r.status_code not in (200, 201):
                logger.error(f"Twilio SMS failed ({r.status_code}): {r.text}")
    except Exception as e:
        logger.error(f"SMS send error: {e}")


async def create_verification_code(target: str, code_type: str) -> str:
    """Generate and store a 6-digit verification code (10-min TTL)."""
    code = str(random.randint(100000, 999999))
    if db is not None:
        await db.verification_codes.replace_one(
            {"target": target, "type": code_type},
            {
                "target": target,
                "type": code_type,
                "code": code,
                "created_at": utcnow(),
                "expires_at": utcnow() + timedelta(minutes=10),
            },
            upsert=True,
        )
    return code


async def check_verification_code(target: str, code_type: str, code: str) -> bool:
    """Return True and consume the code if valid and not expired."""
    if db is None:
        return False
    doc = await db.verification_codes.find_one({"target": target, "type": code_type, "code": code})
    if not doc:
        return False
    exp = doc.get("expires_at")
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < utcnow():
            return False
    await db.verification_codes.delete_one({"_id": doc["_id"]})
    return True


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


async def send_welcome_email(email: str, name: str) -> None:
    first = name.split()[0] if name else "there"
    await send_email(
        to=email,
        subject="Welcome to Wardrope",
        html_content=f"""
<h2 style="color:#f0f0f0;font-size:22px;margin:0 0 16px;">Welcome, {first}.</h2>
<p style="color:#aaa;font-size:15px;line-height:1.6;margin:0 0 24px;">
  Your digital wardrobe is ready. Start cataloging your items, let the AI stylist build
  looks from what you actually own, and explore editorial lookbooks for inspiration.
</p>
<a href="{APP_URL}" style="display:inline-block;background:#C5A059;color:#050505;text-decoration:none;
  padding:14px 28px;font-weight:700;letter-spacing:1px;font-size:13px;">
  OPEN MY WARDROBE
</a>""",
    )


async def send_email_verification_code(email: str, name: str) -> None:
    code = await create_verification_code(email, "email")
    first = name.split()[0] if name else "there"
    await send_email(
        to=email,
        subject="Verify your Wardrope email",
        html_content=f"""
<h2 style="color:#f0f0f0;font-size:22px;margin:0 0 16px;">Hi {first} — verify your email</h2>
<p style="color:#aaa;font-size:15px;line-height:1.6;margin:0 0 24px;">
  Enter this code in the app to confirm your email address.
  It expires in <strong style="color:#f0f0f0;">10 minutes</strong>.
</p>
<div style="text-align:center;margin:32px 0;">
  <span style="font-size:42px;font-weight:700;letter-spacing:12px;color:#C5A059;">{code}</span>
</div>
<p style="color:#555;font-size:12px;">If you didn't create a Wardrope account, you can safely ignore this email.</p>""",
    )


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
        email_verified=u.get("email_verified", False),
        phone=u.get("phone"),
        phone_verified=u.get("phone_verified", False),
        points=u.get("points", 0),
        stylist_persona=u.get("stylist_persona", DEFAULT_PERSONA),
        plan_type=u.get("plan_type", "free"),
        plan_period=u.get("plan_period", "monthly"),
        plan_addons=u.get("plan_addons", []) or [],
        subscription_status=u.get("subscription_status", "none"),
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
                "https://backend.emergentagent.com/auth/v1/env/oauth/session-data",
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


@api.post("/auth/resend-email-code")
async def resend_email_code(current=Depends(get_current_user)):
    """Resend email verification code to the current user."""
    if current.get("email_verified"):
        return {"ok": True, "already_verified": True}
    asyncio.create_task(send_email_verification_code(current["email"], current.get("name", "")))
    return {"ok": True}


@api.post("/auth/verify-email")
async def verify_email_endpoint(body: VerifyEmailIn, current=Depends(get_current_user)):
    """Verify the 6-digit code sent to the user's email."""
    if current.get("email_verified"):
        return {"ok": True, "user": user_to_out(current).model_dump()}
    email = body.email.lower().strip()
    if email != current["email"]:
        raise HTTPException(status_code=400, detail="Email mismatch")
    ok = await check_verification_code(email, "email", body.code.strip())
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    await db.users.update_one({"user_id": current["user_id"]}, {"$set": {"email_verified": True}})
    await award_points(current["user_id"], 25, "email_verified")
    user_doc = await db.users.find_one({"user_id": current["user_id"]}, {"_id": 0})
    # Award referral bonus to referrer (only once, guard with referral_bonus_awarded flag)
    referred_by = user_doc.get("referred_by")
    if referred_by and not user_doc.get("referral_bonus_awarded"):
        await award_points(referred_by, 200, "referral")
        await db.users.update_one(
            {"user_id": current["user_id"]},
            {"$set": {"referral_bonus_awarded": True}},
        )
    # Send welcome email after successful email verification
    asyncio.create_task(send_welcome_email(user_doc["email"], user_doc.get("name", "")))
    return {"ok": True, "user": user_to_out(user_doc).model_dump()}


@api.post("/auth/send-phone-code")
async def send_phone_code(body: SendPhoneCodeIn, current=Depends(get_current_user)):
    """Send a 6-digit SMS verification code to the given phone number."""
    phone = body.phone.strip()
    code = await create_verification_code(phone, "phone")
    await send_sms(phone, f"Your Wardrope verification code is: {code}. It expires in 10 minutes.")
    # Store phone on user so it's available
    await db.users.update_one({"user_id": current["user_id"]}, {"$set": {"phone": phone}})
    return {"ok": True}


@api.post("/auth/verify-phone")
async def verify_phone_endpoint(body: VerifyPhoneIn, current=Depends(get_current_user)):
    """Verify the 6-digit SMS code sent to the user's phone."""
    phone = body.phone.strip()
    ok = await check_verification_code(phone, "phone", body.code.strip())
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
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
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

DEFAULT_PERSONA = "editor"


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
    if doc["fidelity_mode"] == "identified":
        # MOCKED identified mode (Ximilar/Google Lens not integrated yet)
        doc.setdefault("brand", None)
        doc["product_name"] = None
        doc["product_url"] = None
    await db.items.insert_one(doc)
    await award_points(current["user_id"], 10, "item_added")
    return {"item": item_doc_to_out(doc).model_dump()}


@api.get("/items")
async def list_items(
    category: Optional[str] = None,
    color: Optional[str] = None,
    season: Optional[str] = None,
    occasion: Optional[str] = None,
    favorite: Optional[bool] = None,
    closet_id: Optional[str] = None,
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
    return {"outfit": res}


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


# ---------------------- Billing (Stripe) ----------------------
@api.post("/billing/checkout")
async def billing_checkout(body: CheckoutIn, current=Depends(get_current_user)):
    """Create a Stripe Checkout session for the selected plan."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")
    plan_key = f"{body.plan}_{body.period}"
    price_id = STRIPE_PRICES.get(plan_key)
    if not price_id:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {plan_key}")

    # Build line items
    line_items = [{"price": price_id, "quantity": 1}]
    for addon in body.addons:
        addon_price = STRIPE_PRICES.get(f"addon_{addon}")
        if addon_price:
            line_items.append({"price": addon_price, "quantity": 1})

    # Get or create Stripe customer
    customer_id = current.get("stripe_customer_id")
    if not customer_id:
        customer = stripe.Customer.create(
            email=current["email"],
            name=current.get("name", ""),
            metadata={"user_id": current["user_id"]},
        )
        customer_id = customer["id"]
        await db.users.update_one(
            {"user_id": current["user_id"]},
            {"$set": {"stripe_customer_id": customer_id}},
        )

    success_url = f"{APP_URL}?billing=success"
    cancel_url = f"{APP_URL}?billing=cancel"
    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=line_items,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": current["user_id"],
            "plan": body.plan,
            "period": body.period,
            "addons": ",".join(body.addons),
        },
    )
    return {"checkout_url": session["url"]}


@api.post("/billing/portal")
async def billing_portal(current=Depends(get_current_user)):
    """Create a Stripe Billing Portal session for managing/cancelling a subscription."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")
    customer_id = current.get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="No active subscription found")
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{APP_URL}/profile",
    )
    return {"portal_url": session["url"]}


@api.post("/billing/webhook")
async def billing_webhook(request: Request, stripe_signature: Optional[str] = Header(None, alias="stripe-signature")):
    """Handle Stripe webhook events."""
    body_bytes = await request.body()
    if STRIPE_WEBHOOK_SECRET and stripe_signature:
        try:
            event = stripe.Webhook.construct_event(body_bytes, stripe_signature, STRIPE_WEBHOOK_SECRET)
        except Exception as e:
            logger.error(f"Stripe webhook signature error: {e}")
            raise HTTPException(status_code=400, detail="Invalid signature")
    else:
        # No secret configured — parse raw (dev mode only)
        try:
            event = json.loads(body_bytes)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid payload")

    etype = event.get("type", "")
    data = event.get("data", {}).get("object", {})

    if etype == "checkout.session.completed":
        user_id = (data.get("metadata") or {}).get("user_id")
        plan = (data.get("metadata") or {}).get("plan", "single")
        period = (data.get("metadata") or {}).get("period", "monthly")
        addons_str = (data.get("metadata") or {}).get("addons", "")
        addons = [a for a in addons_str.split(",") if a]
        sub_id = data.get("subscription")
        amount_cents = data.get("amount_total") or 0
        if user_id:
            pts = math.floor(amount_cents / 100) * 50
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {
                    "plan_type": plan,
                    "plan_period": period,
                    "plan_addons": addons,
                    "subscription_status": "active",
                    "stripe_subscription_id": sub_id,
                }},
            )
            if pts > 0:
                await award_points(user_id, pts, "subscription_payment")

    elif etype == "customer.subscription.updated":
        sub_status = data.get("status", "")
        customer_id = data.get("customer")
        if customer_id:
            user = await db.users.find_one({"stripe_customer_id": customer_id}, {"user_id": 1})
            if user:
                status_map = {"active": "active", "past_due": "past_due", "canceled": "cancelled"}
                mapped = status_map.get(sub_status, sub_status)
                await db.users.update_one(
                    {"user_id": user["user_id"]},
                    {"$set": {"subscription_status": mapped}},
                )

    elif etype == "customer.subscription.deleted":
        customer_id = data.get("customer")
        if customer_id:
            user = await db.users.find_one({"stripe_customer_id": customer_id}, {"user_id": 1})
            if user:
                await db.users.update_one(
                    {"user_id": user["user_id"]},
                    {"$set": {
                        "plan_type": "free",
                        "plan_period": "monthly",
                        "plan_addons": [],
                        "subscription_status": "cancelled",
                    }},
                )

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


# ---------------------- Admin / Migration ----------------------
@api.post("/admin/migrate/closets")
async def migrate_closets():
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
    if db is None:
        logger.warning("No MONGO_URL set — database disabled")
        return
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.items.create_index([("user_id", 1), ("created_at", -1)])
        await db.outfits.create_index([("user_id", 1), ("created_at", -1)])
        await db.verification_codes.create_index("expires_at", expireAfterSeconds=0)
        await db.verification_codes.create_index([("target", 1), ("type", 1)], unique=True)
        await db.users.create_index("referral_code", sparse=True)
        await db.feedback.create_index([("user_id", 1), ("created_at", -1)])
        await db.closets.create_index([("user_id", 1)])
        await db.closets.create_index("closet_id", unique=True)
        logger.info("Wardrobe API ready")
    except Exception as e:
        logger.error(f"DB index creation failed (check Atlas Network Access whitelist): {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
