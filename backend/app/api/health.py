from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    service: str
    mode: str


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Report API process health without implying database or provider connectivity."""
    return HealthResponse(status="ok", service=settings.app_name, mode=settings.app_mode)
