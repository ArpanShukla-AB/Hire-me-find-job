import logging
import re
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


class TrackedApplication(BaseModel):
    id: str
    company: str
    role: str
    status: str
    applied_at: datetime
    latest_update: str


class TrackedApplicationsResponse(BaseModel):
    applications: list[TrackedApplication]


APPLICATION_SIGNAL = re.compile(r"\b(application|applied|interview|assessment|offer|rejected|not moving forward|hiring process)\b", re.I)
ROLE_PATTERNS = (
    re.compile(r"(?:application|applied|applying)\s+to\s+(?P<company>[^.!?,]{2,50})\s+for\s+(?:the\s+)?(?P<role>[^.!?;]{3,100})", re.I),
    re.compile(r"(?:application|applied|interview|assessment|offer|position|role)\s+(?:for|to|as|of)\s+(?:the\s+)?(?P<role>[^.!?;]{3,100}?)\s+(?:at|with)\s+(?P<company>[A-Z][\w&.' -]{1,50})", re.I),
    re.compile(r"(?:for|as)\s+(?:a|an|the)\s+(?P<role>[A-Z][^.!?;]{2,80}?)\s+(?:at|with)\s+(?P<company>[A-Z][\w&.' -]{1,50})"),
    re.compile(r"(?:applying|applied)\s+for\s+(?P<role>[^.!?;]{3,100}?)\s+(?:at|with)\s+(?P<company>[A-Z][\w&.' -]{1,50})", re.I),
    re.compile(r"(?:application for|applied for|interview for|position of|role:)\s*(?P<role>[^.!?;]{3,100})", re.I),
)
BOILERPLATE = re.compile(r"\b(your application|application received|application update|thank you for applying|interview|next steps|status update|regarding)\b", re.I)


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


def _clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" \t\r\n-:|.,;")[:255]


def _company_from_sender(sender: str) -> str:
    display = re.sub(r"<.*?>", "", sender).strip(' "')
    if display and "@" not in display:
        display = re.sub(r"\b(?:talent acquisition|recruiting|recruitment|careers|jobs|team)\b", " ", display, flags=re.I)
        display = _clean(display)
        if display and display.casefold() not in {"noreply", "no reply", "notifications", "notification", "hiring"}:
            return display
    address = re.search(r"[\w.+-]+@([\w.-]+)", sender)
    if not address:
        return _clean(display) or "Company not identified"
    domain = address.group(1).lower().split(":")[0]
    if domain.split(".")[0] in {"gmail", "googlemail", "outlook", "hotmail", "yahoo", "icloud"}:
        return "Company not identified"
    parts = [part for part in domain.split(".") if part not in {"com", "net", "org", "io", "co", "uk", "in", "jobs", "careers", "mail"}]
    return (parts[-1].replace("-", " ").title() if parts else "Company not identified")[:255]


def _extract_application(subject: str, sender: str, snippet: str) -> tuple[str | None, str | None, str | None]:
    searchable = f"{subject} {snippet}"[:5000]
    if not APPLICATION_SIGNAL.search(searchable):
        return None, None, None
    text = re.sub(r"^(?:re|fwd?):\s*", "", subject, flags=re.I).strip()
    company = None
    role = None
    for pattern in ROLE_PATTERNS:
        match = pattern.search(f"{text}. {snippet[:1000]}")
        if match:
            role = _clean(match.group("role"))
            company = _clean(match.groupdict().get("company") or "") or None
            if role:
                # Avoid saving the rest of a long sentence as a role title.
                role = re.split(r"\b(?:we received|we have received|thank you|your application|at [A-Z])\b", role, maxsplit=1, flags=re.I)[0].strip()
                role = _clean(role)
            break
    if not role:
        candidate = BOILERPLATE.sub(" ", text)
        candidate = re.sub(r"\b(?:for|to|as|of)\b", " ", candidate, flags=re.I)
        candidate = _clean(candidate)
        if 3 <= len(candidate) <= 100 and not re.search(r"\b(job|application|update|status|next steps)\b", candidate, re.I):
            role = candidate
    status_text = searchable.casefold()
    if any(term in status_text for term in ("rejected", "not moving forward", "unable to move forward")):
        status = "Rejected"
    elif "offer" in status_text:
        status = "Offer received"
    elif "interview" in status_text or "phone screen" in status_text:
        status = "Interview"
    elif any(term in status_text for term in ("assessment", "coding test", "take-home", "take home")):
        status = "Assessment"
    else:
        status = "Applied"
    return company or _company_from_sender(sender), role or "Role not identified", status


def _save_message(db: Session, google_subject: str, service: Any, message_id: str) -> bool:
    message = service.users().messages().get(
        userId="me", id=message_id, format="metadata", metadataHeaders=METADATA_HEADERS
    ).execute()
    payload = message.get("payload", {})
    subject = _header(payload, "Subject")
    sender = _header(payload, "From")
    snippet = str(message.get("snippet", ""))[:5000]
    # History sync can include messages outside the initial Gmail query; keep only job-search metadata.
    if not _is_job_related(subject, sender) and not _is_job_related(snippet, ""):
        return False
    company, role, status = _extract_application(subject, sender, snippet)
    db.merge(GmailMessage(
        google_subject=google_subject,
        message_id=message_id,
        thread_id=str(message.get("threadId", "")),
        subject=subject,
        sender=sender,
        company=company,
        role=role,
        status=status,
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
    if isinstance(error, HttpError) and getattr(error.resp, "status", None) in (401, 403):
        return HTTPException(status_code=401, detail="Gmail access expired or was revoked. Reconnect Gmail.")
    if isinstance(error, GoogleAuthError) and "invalid_grant" in str(error).casefold():
        return HTTPException(status_code=401, detail="Gmail authorization expired. Reconnect Gmail.")
    return HTTPException(status_code=502, detail="Google could not complete this Gmail sync. Please try again.")


def _google_status(error: HttpError) -> int | None:
    return getattr(getattr(error, "resp", None), "status", None)


@router.get("/sync/status", response_model=GmailSyncStatusResponse)
def gmail_sync_status(request: Request, db: Session = Depends(get_db)) -> GmailSyncStatusResponse:
    google_subject = _subject(request)
    connection = db.get(GmailConnection, google_subject)
    if not connection:
        raise HTTPException(status_code=404, detail="Gmail is not connected.")
    count = db.scalar(select(func.count()).select_from(GmailMessage).where(GmailMessage.google_subject == google_subject)) or 0
    return GmailSyncStatusResponse(total_tracked=count, last_sync_at=connection.last_sync_at)


@router.get("/applications", response_model=TrackedApplicationsResponse)
def tracked_applications(request: Request, db: Session = Depends(get_db)) -> TrackedApplicationsResponse:
    google_subject = _subject(request)
    rows = db.scalars(
        select(GmailMessage)
        .where(GmailMessage.google_subject == google_subject, GmailMessage.status.is_not(None))
        .order_by(GmailMessage.received_at.desc())
    ).all()
    # Keep the latest signal per company and role, with stable IDs for React.
    grouped: dict[tuple[str, str], TrackedApplication] = {}
    for row in rows:
        company = row.company or "Company not identified"
        role = row.role or "Role not identified"
        identity = role.casefold() if role != "Role not identified" else (row.thread_id or row.message_id)
        key = (company.casefold(), identity.casefold())
        existing = grouped.get(key)
        if existing:
            if row.status == "Applied" and row.received_at < existing.applied_at:
                existing.applied_at = row.received_at
            continue
        grouped[key] = TrackedApplication(
            id=f"{row.company}:{identity}", company=company,
            role=role, status=row.status or "Applied",
            applied_at=row.received_at, latest_update=row.subject,
        )
    return TrackedApplicationsResponse(applications=list(grouped.values()))


@router.post("/sync", response_model=GmailSyncResponse)
def sync_gmail(request: Request, db: Session = Depends(get_db)) -> GmailSyncResponse:
    """Import relevant metadata after Gmail consent; the first sync is capped to 60 days."""
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
                if _google_status(error) != 404:
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
