import logging
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from google.auth.exceptions import GoogleAuthError
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.auth import SESSION_COOKIE
from app.config import settings
from app.db import get_db
from app.models import GmailConnection, GmailMessage
from app.security import decrypt_refresh_token, read_session_subject


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/gmail", tags=["Gmail sync"])
JOB_SEARCH_QUERY = "{application applied interview recruiter assessment offer rejection hiring position job vacancy}"
METADATA_HEADERS = ["Subject", "From", "Date"]


class GmailSyncResponse(BaseModel):
    imported: int
    total_tracked: int
    initial_sync: bool
    last_sync_at: datetime


class GmailSyncStatusResponse(BaseModel):
    total_tracked: int
    last_sync_at: datetime | None


def _subject(request: Request) -> str:
    try:
        subject = read_session_subject(request.cookies.get(SESSION_COOKIE))
    except ValueError:
        subject = None
    if not subject:
        raise HTTPException(status_code=401, detail="Connect Gmail to continue.")
    return subject


def _service(connection: GmailConnection) -> Any:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured. Reconnect Gmail after setup.")
    try:
        credentials = Credentials(
            token=None,
            refresh_token=decrypt_refresh_token(connection.encrypted_refresh_token),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret.get_secret_value() if settings.google_client_secret else None,
            scopes=["https://www.googleapis.com/auth/gmail.readonly"],
        )
        return build("gmail", "v1", credentials=credentials, cache_discovery=False)
    except ValueError as error:
        raise HTTPException(status_code=503, detail="Gmail credentials are unavailable. Reconnect Gmail.") from error


def _header(payload: dict[str, Any], name: str) -> str:
    for item in payload.get("headers", []):
        if item.get("name", "").casefold() == name.casefold():
            return str(item.get("value", ""))[:2000]
    return ""


def _received_at(message: dict[str, Any]) -> datetime:
    internal_date = message.get("internalDate")
    if internal_date:
        return datetime.fromtimestamp(int(internal_date) / 1000, tz=timezone.utc)
    date_value = _header(message.get("payload", {}), "Date")
    try:
        parsed = parsedate_to_datetime(date_value)
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return datetime.now(timezone.utc)


def _is_job_related(subject: str, sender: str) -> bool:
    searchable = f"{subject} {sender}".casefold()
    return any(term in searchable for term in (
        "application", "applied", "interview", "recruit", "assessment", "offer", "hiring", "job", "position", "vacancy"
    ))


def _save_message(db: Session, google_subject: str, service: Any, message_id: str) -> bool:
    message = service.users().messages().get(
        userId="me", id=message_id, format="metadata", metadataHeaders=METADATA_HEADERS
    ).execute()
    payload = message.get("payload", {})
    subject = _header(payload, "Subject")
    sender = _header(payload, "From")
    # History sync can include messages outside the initial Gmail query; keep only job-search metadata.
    if not _is_job_related(subject, sender):
        return False
    db.merge(GmailMessage(
        google_subject=google_subject,
        message_id=message_id,
        thread_id=str(message.get("threadId", "")),
        subject=subject,
        sender=sender,
        received_at=_received_at(message),
    ))
    return True


def _list_initial(service: Any, db: Session, google_subject: str) -> int:
    query = f"newer_than:{settings.gmail_initial_sync_days}d {JOB_SEARCH_QUERY} -in:spam -in:trash"
    page_token = None
    imported = 0
    while True:
        result = service.users().messages().list(
            userId="me", q=query, maxResults=500, pageToken=page_token
        ).execute()
        for item in result.get("messages", []):
            imported += int(_save_message(db, google_subject, service, item["id"]))
        page_token = result.get("nextPageToken")
        if not page_token:
            return imported


def _list_incremental(service: Any, db: Session, google_subject: str, start_history_id: str) -> tuple[int, str]:
    page_token = None
    imported = 0
    latest_history_id = start_history_id
    while True:
        result = service.users().history().list(
            userId="me", startHistoryId=start_history_id, historyTypes=["messageAdded"], pageToken=page_token
        ).execute()
        latest_history_id = str(result.get("historyId", latest_history_id))
        for history in result.get("history", []):
            for added in history.get("messagesAdded", []):
                message_id = added.get("message", {}).get("id")
                if message_id:
                    imported += int(_save_message(db, google_subject, service, message_id))
        page_token = result.get("nextPageToken")
        if not page_token:
            return imported, latest_history_id


def _google_failure(error: Exception) -> HTTPException:
    logger.warning("Gmail sync failed: %s", error)
    if isinstance(error, HttpError) and getattr(error, "status_code", None) in (401, 403):
        return HTTPException(status_code=401, detail="Gmail access expired or was revoked. Reconnect Gmail.")
    return HTTPException(status_code=502, detail="Google could not complete this Gmail sync. Please try again.")


@router.get("/sync/status", response_model=GmailSyncStatusResponse)
def gmail_sync_status(request: Request, db: Session = Depends(get_db)) -> GmailSyncStatusResponse:
    google_subject = _subject(request)
    connection = db.get(GmailConnection, google_subject)
    if not connection:
        raise HTTPException(status_code=404, detail="Gmail is not connected.")
    count = db.scalar(select(func.count()).select_from(GmailMessage).where(GmailMessage.google_subject == google_subject)) or 0
    return GmailSyncStatusResponse(total_tracked=count, last_sync_at=connection.last_sync_at)


@router.post("/sync", response_model=GmailSyncResponse)
def sync_gmail(request: Request, db: Session = Depends(get_db)) -> GmailSyncResponse:
    """Import relevant metadata on explicit user action; first sync is capped to the configured 60-day window."""
    google_subject = _subject(request)
    connection = db.get(GmailConnection, google_subject)
    if not connection:
        raise HTTPException(status_code=404, detail="Gmail is not connected.")
    service = _service(connection)
    initial_sync = connection.history_id is None
    imported = 0
    try:
        if connection.history_id:
            try:
                imported, history_id = _list_incremental(service, db, google_subject, connection.history_id)
            except HttpError as error:
                if getattr(error, "status_code", None) != 404:
                    raise
                # Google history IDs expire; safely re-scan only the allowed recent window.
                initial_sync = True
                history_id = str(service.users().getProfile(userId="me").execute()["historyId"])
                imported = _list_initial(service, db, google_subject)
        else:
            # Pin the cursor before listing so messages arriving during the scan appear next time.
            history_id = str(service.users().getProfile(userId="me").execute()["historyId"])
            imported = _list_initial(service, db, google_subject)
        connection.history_id = history_id
        connection.last_sync_at = datetime.now(timezone.utc)
        db.commit()
    except (HttpError, GoogleAuthError, KeyError, ValueError) as error:
        db.rollback()
        raise _google_failure(error) from error
    total = db.scalar(select(func.count()).select_from(GmailMessage).where(GmailMessage.google_subject == google_subject)) or 0
    return GmailSyncResponse(imported=imported, total_tracked=total, initial_sync=initial_sync, last_sync_at=connection.last_sync_at)
