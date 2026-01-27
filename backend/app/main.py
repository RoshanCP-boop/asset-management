from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers.auth import router as auth_router


from app.routers.assets import router as assets_router
from app.routers.users import router as users_router
from app.routers.locations import router as locations_router
from app.routers.user_requests import router as user_requests_router
from app.routers.test_db import router as test_db_router  # keep for now

app = FastAPI(title="Asset Management API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
  "http://localhost:3000",
  "http://127.0.0.1:3000",
],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}

app.include_router(test_db_router)
app.include_router(locations_router)
app.include_router(users_router)
app.include_router(user_requests_router)
app.include_router(assets_router)
app.include_router(auth_router)