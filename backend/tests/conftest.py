import os
import io
import time
import base64
import uuid
import httpx
import pytest
import requests
from pathlib import Path

# Load frontend .env to grab the public backend URL the user actually sees
FRONTEND_ENV = Path("/app/frontend/.env")
if FRONTEND_ENV.exists():
    for line in FRONTEND_ENV.read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
            v = line.split("=", 1)[1].strip().strip('"')
            os.environ.setdefault("EXPO_PUBLIC_BACKEND_URL", v)

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not set")

API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def api_base() -> str:
    return API


@pytest.fixture(scope="session")
def http_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _download_fashion_image_b64() -> str:
    """Download a small real fashion image and return base64 (JPEG)."""
    urls = [
        # Pexels: small white t-shirt on hanger
        "https://images.pexels.com/photos/5946081/pexels-photo-5946081.jpeg?auto=compress&cs=tinysrgb&w=400",
        # Pexels: denim jeans
        "https://images.pexels.com/photos/1082528/pexels-photo-1082528.jpeg?auto=compress&cs=tinysrgb&w=400",
        # Unsplash backup
        "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&auto=format&fit=crop&q=60",
    ]
    last_err = None
    for u in urls:
        try:
            r = httpx.get(u, timeout=15.0, follow_redirects=True)
            if r.status_code == 200 and len(r.content) > 5000:
                return base64.b64encode(r.content).decode("ascii")
        except Exception as e:
            last_err = e
    raise RuntimeError(f"Could not download fashion image: {last_err}")


@pytest.fixture(scope="session")
def fashion_image_b64() -> str:
    return _download_fashion_image_b64()


@pytest.fixture(scope="session")
def fashion_image_b64_2() -> str:
    """A second, different clothing image for multi-item tests."""
    # Pexels: black sneaker / shoes
    urls = [
        "https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg?auto=compress&cs=tinysrgb&w=400",
        "https://images.pexels.com/photos/1456706/pexels-photo-1456706.jpeg?auto=compress&cs=tinysrgb&w=400",
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&auto=format&fit=crop&q=60",
    ]
    for u in urls:
        try:
            r = httpx.get(u, timeout=15.0, follow_redirects=True)
            if r.status_code == 200 and len(r.content) > 5000:
                return base64.b64encode(r.content).decode("ascii")
        except Exception:
            continue
    raise RuntimeError("Could not download second fashion image")


@pytest.fixture(scope="session")
def fashion_image_b64_3() -> str:
    """A third clothing image (jacket/outerwear)."""
    urls = [
        "https://images.pexels.com/photos/1183266/pexels-photo-1183266.jpeg?auto=compress&cs=tinysrgb&w=400",
        "https://images.pexels.com/photos/3782789/pexels-photo-3782789.jpeg?auto=compress&cs=tinysrgb&w=400",
    ]
    for u in urls:
        try:
            r = httpx.get(u, timeout=15.0, follow_redirects=True)
            if r.status_code == 200 and len(r.content) > 5000:
                return base64.b64encode(r.content).decode("ascii")
        except Exception:
            continue
    raise RuntimeError("Could not download third fashion image")


def _register_user(http_session, prefix="user"):
    email = f"test_{prefix.lower()}_{uuid.uuid4().hex[:8]}@example.com"
    password = "Wardrobe!1234"
    name = "TEST User"
    r = http_session.post(
        f"{API}/auth/register",
        json={"email": email, "password": password, "name": name},
        timeout=20,
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        "token": data["token"],
        "user": data["user"],
        "email": email,
        "password": password,
        "headers": {
            "Authorization": f"Bearer {data['token']}",
            "Content-Type": "application/json",
        },
    }


@pytest.fixture(scope="session")
def user_a(http_session):
    return _register_user(http_session, "userA")


@pytest.fixture(scope="session")
def user_b(http_session):
    return _register_user(http_session, "userB")
