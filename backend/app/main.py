import os
from contextlib import asynccontextmanager
from time import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.db import SessionLocal
from app.models import User, UserRole
from app.routers.auth import router as auth_router
from app.routers.assets import router as assets_router
from app.routers.users import router as users_router
from app.routers.locations import router as locations_router
from app.routers.user_requests import router as user_requests_router
from app.routers.asset_requests import router as asset_requests_router
from app.routers.audit import router as audit_router
# Only import test router in development
DEBUG_MODE = os.getenv("DEBUG", "false").lower() == "true"
if DEBUG_MODE:
    from app.routers.test_db import router as test_db_router


def check_first_run():
    """Check if this is the first run (no users) and print instructions."""
    db = SessionLocal()
    try:
        user_count = db.query(User).count()
        if user_count == 0:
            print("\n" + "=" * 60)
            print("🚀 FIRST RUN: No users in database")
            print("=" * 60)
            print("   Sign in with Google to create the first admin account.")
            print("   The first user will automatically be an ADMIN.")
            print("=" * 60 + "\n")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: check if first run
    check_first_run()
    yield
    # Shutdown: nothing to do


app = FastAPI(title="Asset Management API", lifespan=lifespan)

# Session middleware for OAuth state (required by authlib)
SESSION_SECRET = os.getenv("SESSION_SECRET", os.getenv("JWT_SECRET", "dev-session-secret"))
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET)

# Basic in-memory rate limiting (per-process)
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "120"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
_rate_limit_store: dict[str, tuple[int, float]] = {}

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Skip health checks
    if request.url.path == "/health":
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"
    now = time()

    count, window_start = _rate_limit_store.get(client_ip, (0, now))
    if now - window_start >= RATE_LIMIT_WINDOW_SECONDS:
        count = 0
        window_start = now

    count += 1
    _rate_limit_store[client_ip] = (count, window_start)

    if count > RATE_LIMIT_REQUESTS:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Please slow down."},
        )

    return await call_next(request)

cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
allowed_origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}

if DEBUG_MODE:
    app.include_router(test_db_router)
app.include_router(locations_router)
app.include_router(users_router)
app.include_router(user_requests_router)
app.include_router(assets_router)
app.include_router(asset_requests_router)
app.include_router(auth_router)
app.include_router(audit_router)