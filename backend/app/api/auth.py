import hmac
import logging
import secrets
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from google_auth_oauthlib.flow import Flow
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models.gmail_connection import GmailConnection
from app.security import (
    create_session_token,
    decrypt_refresh_token,
    encrypt_refresh_token,
    read_session_subject,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/google", tags=["Google OAuth"])

OAUTH_STATE_COOKIE = "jobpilot_google_oauth_state"
SESSION_COOKIE = "jobpilot_session"
OAUTH_STATE_MAX_AGE = 600
SESSION_MAX_AGE = 60 * 60 * 24 * 14
GOOGLE_SCOPES = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.readonly",
]


class ConnectStartResponse(BaseModel):
    authorization_url: str


class GmailStatusResponse(BaseModel):
    connected: bool
    email: Optional[str] = None


def _google_configured() -> bool:
    return bool(
        settings.google_client_id
        and settings.google_client_secret
        and settings.google_redirect_uri
    )


def _flow(state: Optional[str] = None) -> Flow:
    if not _google_configured():
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in the backend environment.",
        )
    if settings.app_secret_key is None or not settings.app_secret_key.get_secret_value().strip():
        raise HTTPException(
            status_code=503,
            detail="Gmail token encryption is not configured. Set a high-entropy APP_SECRET_KEY in the backend environment.",
        )
    assert settings.google_client_id and settings.google_client_secret and settings.google_redirect_uri
    client_config = {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret.get_secret_value(),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.google_redirect_uri],
        }
    }
    flow = Flow.from_client_config(client_config, scopes=GOOGLE_SCOPES, state=state)
    flow.redirect_uri = settings.google_redirect_uri
    return flow


def _secure_cookie() -> bool:
    return bool(settings.google_redirect_uri and settings.google_redirect_uri.startswith("https://"))


def _clear_state_cookie(response: Response) -> None:
    response.delete_cookie(
        OAUTH_STATE_COOKIE,
        path=f"{settings.api_prefix}/auth/google/callback",
        secure=_secure_cookie(),
        httponly=True,
        samesite="lax",
    )


def _frontend_result(result: str) -> Response:
    response = Response(
        status_code=303,
        headers={"Location": f"{settings.frontend_app_url.rstrip('/')}?{urlencode({'gmail': result})}"},
    )
    _clear_state_cookie(response)
    return response


def _session_subject(request: Request) -> Optional[str]:
    try:
        return read_session_subject(request.cookies.get(SESSION_COOKIE))
    except ValueError:
        return None


@router.get("/connect", response_model=ConnectStartResponse)
def start_google_oauth(
    response: Response,
    db: Session = Depends(get_db),
) -> ConnectStartResponse:
    state = secrets.token_urlsafe(32)
    flow = _flow(state)
    try:
        db.execute(select(GmailConnection.google_subject).limit(1))
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=503,
            detail="Gmail token storage is not ready. Start PostgreSQL and run the Gmail database migration.",
        ) from error
    authorization_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    response.set_cookie(
        OAUTH_STATE_COOKIE,
        state,
        max_age=OAUTH_STATE_MAX_AGE,
        path=f"{settings.api_prefix}/auth/google/callback",
        secure=_secure_cookie(),
        httponly=True,
        samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"
    return ConnectStartResponse(authorization_url=authorization_url)


@router.get("/callback")
def google_oauth_callback(
    request: Request,
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> Response:
    saved_state = request.cookies.get(OAUTH_STATE_COOKIE)
    if not state or not saved_state or not hmac.compare_digest(state, saved_state):
        return _frontend_result("state_error")
    if error:
        return _frontend_result("denied")
    if not code:
        return _frontend_result("connect_error")

    try:
        flow = _flow(state)
        flow.fetch_token(code=code)
        credential = flow.credentials
        if not credential.id_token:
            return _frontend_result("identity_error")
        claims = id_token.verify_oauth2_token(
            credential.id_token,
            GoogleRequest(),
            audience=settings.google_client_id,
        )
        google_subject = claims.get("sub")
        email = claims.get("email")
        if not isinstance(google_subject, str) or not isinstance(email, str) or claims.get("email_verified") is not True:
            return _frontend_result("identity_error")

        connection = db.get(GmailConnection, google_subject)
        refresh_token = credential.refresh_token
        if not refresh_token and connection is None:
            return _frontend_result("reauthorize")
        if connection is None:
            if not refresh_token:
                return _frontend_result("reauthorize")
            connection = GmailConnection(
                google_subject=google_subject,
                email=email,
                encrypted_refresh_token=encrypt_refresh_token(refresh_token),
                scopes=" ".join(credential.scopes or GOOGLE_SCOPES),
            )
            db.add(connection)
        else:
            connection.email = email
            if refresh_token:
                connection.encrypted_refresh_token = encrypt_refresh_token(refresh_token)
            connection.scopes = " ".join(credential.scopes or GOOGLE_SCOPES)
        db.commit()

        result = _frontend_result("connected")
        result.set_cookie(
            SESSION_COOKIE,
            create_session_token(google_subject),
            max_age=SESSION_MAX_AGE,
            path="/",
            secure=_secure_cookie(),
            httponly=True,
            samesite="lax",
        )
        return result
    except HTTPException:
        db.rollback()
        return _frontend_result("connect_error")
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Could not persist a Gmail connection")
        return _frontend_result("storage_error")
    except Exception:
        db.rollback()
        logger.exception("Google OAuth callback failed")
        return _frontend_result("connect_error")


@router.get("/status", response_model=GmailStatusResponse)
def gmail_connection_status(
    request: Request,
    db: Session = Depends(get_db),
) -> GmailStatusResponse:
    google_subject = _session_subject(request)
    if not google_subject:
        return GmailStatusResponse(connected=False)
    connection = db.get(GmailConnection, google_subject)
    if connection is None:
        return GmailStatusResponse(connected=False)
    return GmailStatusResponse(connected=True, email=connection.email)


@router.delete("/disconnect")
def disconnect_gmail(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    google_subject = _session_subject(request)
    if google_subject:
        connection = db.get(GmailConnection, google_subject)
        if connection:
            try:
                refresh_token = decrypt_refresh_token(connection.encrypted_refresh_token)
                revoke_response = httpx.post(
                    "https://oauth2.googleapis.com/revoke",
                    data={"token": refresh_token},
                    timeout=10,
                )
                revoke_response.raise_for_status()
            except (httpx.HTTPError, ValueError):
                logger.warning("Google token revocation could not be confirmed during disconnect")
            db.delete(connection)
            db.commit()
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        secure=_secure_cookie(),
        httponly=True,
        samesite="lax",
    )
    return {"disconnected": True}
