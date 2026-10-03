from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin import router as admin_router
from app.api.dashboard import router as dashboard_router
from app.api.escrow import router as escrow_router
from app.api.routes import router
from app.core.config import settings
from app.services.ai_service import check_model_available


@asynccontextmanager
async def lifespan(_: FastAPI):
    check_model_available()
    yield


app = FastAPI(title="LOCIM API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_list, allow_methods=["*"], allow_headers=["*"]
)
app.include_router(router)
app.include_router(escrow_router)
app.include_router(dashboard_router)
app.include_router(admin_router)


@app.get("/health")
def health():
    return {"status": "ok"}
