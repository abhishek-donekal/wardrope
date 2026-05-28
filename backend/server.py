from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
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

from openai import AsyncOpenAI

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "wardrobe")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev_secret")
JWT_EXPIRES_DAYS = int(os.environ.get("JWT_EXPIRES_DAYS", "30"))
AI_MODEL_NAME = "gpt-4o"

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


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: Optional[str] = None


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


class BarcodeIn(BaseModel):
    barcode: str


class CreateItemIn(BaseModel):
    image_base64: str
    name: Optional[str] = None
    tags: Optional[ItemTags] = None
    fidelity_mode: Optional[str] = "descriptive"
    brand: Optional[str] = None


class AddCategoryIn(BaseModel):
    name: str


class ListingUpdateIn(BaseModel):
    status: Optional[str] = None  # "donate" | "swap" | null


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
    listing_status: Optional[str] = None
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
        listing_status=d.get("listing_status"),
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
        "brand": body.brand or None,
        "favorite": False,
        "created_at": utcnow(),
    }
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

    if not EMERGENT_LLM_KEY:
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

    sys_msg = (
        "You are a personal stylist. Analyze the user's wardrobe and identify gaps. "
        "Return strict JSON ONLY: {\"suggestions\": ["
        "{\"gap_title\": string, \"description\": string (1 sentence), "
        "\"search_term\": string (2-4 words for searching), "
        "\"store\": one of [\"H&M\",\"Zara\",\"ASOS\",\"Nordstrom\",\"Uniqlo\"]}]} "
        "Return 4-5 suggestions. No prose, no markdown."
    )
    prompt = (
        f"User's current wardrobe ({len(items)} items):\n"
        + "\n".join(catalog_summary)
        + "\n\nIdentify 4-5 missing wardrobe essentials or style gaps. Return JSON only."
    )

    try:
        ai_client = AsyncOpenAI(api_key=EMERGENT_LLM_KEY)
        response = await ai_client.chat.completions.create(
            model=AI_MODEL_NAME,
            messages=[
                {"role": "system", "content": sys_msg},
                {"role": "user", "content": prompt},
            ],
            max_tokens=800,
        )
        resp = response.choices[0].message.content
        data = _safe_json_loads(resp if isinstance(resp, str) else str(resp))
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
            })

        # Cache in user doc
        await db.users.update_one(
            {"user_id": current["user_id"]},
            {"$set": {"wardrobe_suggestions": final, "wardrobe_suggestions_at": utcnow()}},
        )
        return {"suggestions": final, "cached": False}
    except Exception as e:
        logger.error(f"get_suggestions error: {e}")
        raise HTTPException(status_code=500, detail="Could not generate suggestions")


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
    return {"ok": True, "app": "wardrobe", "model": AI_MODEL_NAME}


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
        logger.info("Wardrobe API ready")
    except Exception as e:
        logger.error(f"DB index creation failed (check Atlas Network Access whitelist): {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
