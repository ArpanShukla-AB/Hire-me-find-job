import logging
import re
import base64
import mimetypes
import zipfile
from xml.etree import ElementTree
from io import BytesIO
from email.message import EmailMessage
from email.utils import getaddresses
from html.parser import HTMLParser
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from google.auth.exceptions import GoogleAuthError
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import SESSION_COOKIE
from app.config import settings
from app.db import get_db
from app.models import GmailConnection, GmailMessage
from app.security import decrypt_refresh_token, read_session_subject
from openai import OpenAI


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


class GmailMessageSummary(BaseModel):
    id: str
    subject: str
    sender: str
    received_at: datetime
    snippet: str
    company: str | None = None
    role: str | None = None
    status: str | None = None


class GmailMessageListResponse(BaseModel):
    messages: list[GmailMessageSummary]


class GmailMessageDetail(GmailMessageSummary):
    body: str


class FollowUpResponse(BaseModel):
    sent: bool
    recipient: str
    subject: str
    generated_body: str


APPLICATION_SIGNAL = re.compile(r"\b(application|applied|interview|assessment|offer|rejected|not moving forward|hiring process)\b", re.I)
JOB_CONTEXT = re.compile(r"\b(job|career|employment|role|position|vacancy|recruit(?:er|ing)|hiring|candidate)\b", re.I)
JOB_EVENT = re.compile(r"\b(interview|assessment|recruit(?:er|ing)|hiring process|rejected|not moving forward|job offer|offer letter|employment offer|application|applied)\b", re.I)
PROMOTIONAL_NOISE = re.compile(r"\b(bonus points|points offer|debit card|credit card|amazon fresh|festival|limited time offer|travel smart|save more|rewards? points|cashback|discount)\b", re.I)
ATS_SENDER = re.compile(r"\b(workday|greenhouse|lever|ashby|smartrecruiters|workable|icims|jobvite|careers|recruiting|talent acquisition)\b", re.I)
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


def _service(connection: GmailConnection, *, send: bool = False) -> Any:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured. Reconnect Gmail after setup.")
    try:
        credentials = Credentials(
            token=None,
            refresh_token=decrypt_refresh_token(connection.encrypted_refresh_token),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret.get_secret_value() if settings.google_client_secret else None,
            scopes=["https://www.googleapis.com/auth/gmail.readonly"] + (
                ["https://www.googleapis.com/auth/gmail.send"] if send else []
            ),
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


def _is_job_related(subject: str, sender: str, snippet: str = "", known_status: str | None = None) -> bool:
    searchable = f"{subject} {sender} {snippet}"[:5000]
    if PROMOTIONAL_NOISE.search(searchable):
        return False
    if known_status and known_status != "Offer received":
        return True
    if re.search(r"\b(interview|assessment|recruiter|recruiting|hiring process|job offer|offer letter|employment offer|not moving forward)\b", searchable, re.I):
        return True
    return bool(JOB_EVENT.search(searchable) and (JOB_CONTEXT.search(searchable) or ATS_SENDER.search(sender)))


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
    if not _is_job_related(subject, sender, snippet):
        # Re-syncing also removes messages that an earlier, looser classifier mislabeled as job mail.
        existing = db.get(GmailMessage, (google_subject, message_id))
        if existing:
            db.delete(existing)
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


def _tracked_message_count(db: Session, google_subject: str) -> int:
    rows = db.scalars(select(GmailMessage).where(GmailMessage.google_subject == google_subject)).all()
    return sum(bool(row.status and _is_job_related(row.subject, row.sender, known_status=row.status)) for row in rows)


def _decode_part(data: str) -> str:
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")


class _HTMLText(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "head"}:
            self.skip_depth += 1
        if not self.skip_depth and tag in {"br", "p", "div", "li", "tr"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "head"} and self.skip_depth:
            self.skip_depth -= 1
        if not self.skip_depth and tag in {"p", "div", "li", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self.parts.append(data)


def _message_body(payload: dict[str, Any]) -> str:
    plain_parts: list[str] = []
    html_parts: list[str] = []

    def visit(part: dict[str, Any]) -> None:
        if part.get("filename") or part.get("body", {}).get("attachmentId"):
            return
        mime = str(part.get("mimeType", "")).lower()
        data = part.get("body", {}).get("data")
        if data:
            decoded = _decode_part(str(data))
            if mime == "text/plain":
                plain_parts.append(decoded)
            elif mime == "text/html":
                html_parts.append(decoded)
        for child in part.get("parts", []):
            visit(child)

    visit(payload)
    if plain_parts:
        body = "\n\n".join(plain_parts)
    elif html_parts:
        parser = _HTMLText()
        parser.feed("\n".join(html_parts))
        body = "".join(parser.parts)
    else:
        body = "This message has no readable text body."
    return re.sub(r"\n{3,}", "\n\n", body).strip()[:100_000]


def _google_status(error: HttpError) -> int | None:
    return getattr(getattr(error, "resp", None), "status", None)


def _extract_resume(filename: str, content: bytes) -> str:
    extension = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    try:
        if extension == "txt":
            return content.decode("utf-8", errors="replace")[:30000]
        if extension == "pdf":
            from pypdf import PdfReader
            return "\n".join(page.extract_text() or "" for page in PdfReader(BytesIO(content)).pages)[:30000]
        if extension == "docx":
            with zipfile.ZipFile(BytesIO(content)) as archive:
                document = ElementTree.fromstring(archive.read("word/document.xml"))
            paragraphs = ["".join(node.text or "" for node in paragraph.iter() if node.tag.endswith("}t")) for paragraph in document.iter() if paragraph.tag.endswith("}p")]
            return "\n".join(paragraphs)[:30000]
    except Exception as error:
        raise HTTPException(status_code=400, detail="The résumé could not be read. Upload a valid PDF, DOCX, or TXT file.") from error
    raise HTTPException(status_code=400, detail="Résumé must be a PDF, DOCX, or TXT file.")


@router.post("/messages/{message_id}/follow-up", response_model=FollowUpResponse)
async def send_follow_up(
    message_id: str,
    request: Request,
    prompt: str = Form(..., min_length=3, max_length=4000),
    resume: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
) -> FollowUpResponse:
    google_subject = _subject(request)
    row = db.get(GmailMessage, (google_subject, message_id))
    if not row or not row.status or not _is_job_related(row.subject, row.sender, known_status=row.status):
        raise HTTPException(status_code=404, detail="This job message is no longer available in your tracker.")
    connection = db.get(GmailConnection, google_subject)
    if not connection:
        raise HTTPException(status_code=404, detail="Gmail is not connected.")
    scopes = set((connection.scopes or "").split())
    if "https://www.googleapis.com/auth/gmail.send" not in scopes:
        raise HTTPException(status_code=409, detail="Reconnect Gmail and approve the send permission before sending a follow-up.")
    if not settings.openai_api_key or not settings.openai_api_key.get_secret_value().strip():
        raise HTTPException(status_code=503, detail="AI writing is not configured. Set OPENAI_API_KEY in the backend environment.")

    resume_bytes: bytes | None = None
    resume_name: str | None = None
    resume_content = ""
    if resume and resume.filename:
        resume_bytes = await resume.read(5 * 1024 * 1024 + 1)
        if len(resume_bytes) > 5 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Résumé must be 5 MB or smaller.")
        resume_name = re.sub(r"[^\w .()-]", "_", resume.filename).strip()[:120] or "resume.pdf"
        resume_content = _extract_resume(resume_name, resume_bytes)

    service = _service(connection, send=True)
    try:
        original = service.users().messages().get(userId="me", id=message_id, format="full").execute()
        original_payload = original.get("payload", {})
        sender_headers = getaddresses([_header(original_payload, "Reply-To") or _header(original_payload, "From")])
        recipient = next((address for _, address in sender_headers if "@" in address), "")
        if not recipient or recipient.casefold().startswith(("no-reply@", "noreply@", "donotreply@")):
            raise HTTPException(status_code=400, detail="This message does not have a replyable sender address.")
        original_subject = _header(original_payload, "Subject") or row.subject
        reply_subject = original_subject if original_subject.lower().startswith("re:") else f"Re: {original_subject}"
        original_body = _message_body(original_payload)
        try:
            result = OpenAI(api_key=settings.openai_api_key.get_secret_value()).chat.completions.create(
                model="gpt-4o-mini",
                temperature=0.4,
                messages=[
                    {"role": "system", "content": "Write a concise, professional job-application follow-up email as a reply to the supplied message. Follow the user's requested intent. Do not invent facts, dates, qualifications, or promises. Return only the email body, without a subject line or markdown."},
                    {"role": "user", "content": f"User's follow-up request:\n{prompt.strip()}\n\nOriginal email subject:\n{original_subject}\n\nOriginal email body:\n{original_body[:18000]}\n\nOptional résumé context (attach the original file to the email; use only if helpful):\n{resume_content}"},
                ],
            )
            generated = (result.choices[0].message.content or "").strip()
        except Exception as error:
            logger.warning("AI follow-up generation failed: %s", error)
            raise HTTPException(status_code=502, detail="AI could not write this follow-up. Please try again.") from error
        if not generated:
            raise HTTPException(status_code=502, detail="AI returned an empty follow-up. Please try again.")

        email = EmailMessage()
        email["To"] = recipient
        email["Subject"] = reply_subject
        email["In-Reply-To"] = _header(original_payload, "Message-ID")
        references = _header(original_payload, "References")
        email["References"] = f"{references} {_header(original_payload, 'Message-ID')}".strip()
        email.set_content(generated)
        if resume_bytes is not None and resume_name:
            mime_type, _ = mimetypes.guess_type(resume_name)
            maintype, subtype = (mime_type or "application/octet-stream").split("/", 1)
            email.add_attachment(resume_bytes, maintype=maintype, subtype=subtype, filename=resume_name)
        raw = base64.urlsafe_b64encode(email.as_bytes()).decode("ascii")
        service.users().messages().send(userId="me", body={"raw": raw, "threadId": row.thread_id}).execute()
    except HTTPException:
        raise
    except (HttpError, GoogleAuthError, ValueError) as error:
        raise _google_failure(error) from error
    return FollowUpResponse(sent=True, recipient=recipient, subject=reply_subject, generated_body=generated)


@router.get("/sync/status", response_model=GmailSyncStatusResponse)
def gmail_sync_status(request: Request, db: Session = Depends(get_db)) -> GmailSyncStatusResponse:
    google_subject = _subject(request)
    connection = db.get(GmailConnection, google_subject)
    if not connection:
        raise HTTPException(status_code=404, detail="Gmail is not connected.")
    count = _tracked_message_count(db, google_subject)
    return GmailSyncStatusResponse(total_tracked=count, last_sync_at=connection.last_sync_at)


@router.get("/messages", response_model=GmailMessageListResponse)
def list_job_messages(request: Request, db: Session = Depends(get_db)) -> GmailMessageListResponse:
    google_subject = _subject(request)
    rows = db.scalars(
        select(GmailMessage)
        .where(GmailMessage.google_subject == google_subject, GmailMessage.status.is_not(None))
        .order_by(GmailMessage.received_at.desc())
        .limit(100)
    ).all()
    messages = [
        GmailMessageSummary(
            id=row.message_id, subject=row.subject, sender=row.sender, received_at=row.received_at,
            snippet="", company=row.company, role=row.role, status=row.status,
        )
        for row in rows if _is_job_related(row.subject, row.sender, known_status=row.status)
    ]
    return GmailMessageListResponse(messages=messages)


@router.get("/messages/{message_id}", response_model=GmailMessageDetail)
def read_job_message(message_id: str, request: Request, db: Session = Depends(get_db)) -> GmailMessageDetail:
    google_subject = _subject(request)
    row = db.get(GmailMessage, (google_subject, message_id))
    if not row or not row.status or not _is_job_related(row.subject, row.sender, known_status=row.status):
        raise HTTPException(status_code=404, detail="This job message is no longer available in your tracker.")
    connection = db.get(GmailConnection, google_subject)
    if not connection:
        raise HTTPException(status_code=404, detail="Gmail is not connected.")
    service = _service(connection)
    try:
        message = service.users().messages().get(userId="me", id=message_id, format="full").execute()
    except (HttpError, GoogleAuthError, ValueError) as error:
        raise _google_failure(error) from error
    payload = message.get("payload", {})
    return GmailMessageDetail(
        id=row.message_id, subject=row.subject, sender=row.sender, received_at=row.received_at,
        snippet=str(message.get("snippet", ""))[:1000], company=row.company, role=row.role,
        status=row.status, body=_message_body(payload),
    )


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
    total = _tracked_message_count(db, google_subject)
    return GmailSyncResponse(imported=imported, total_tracked=total, initial_sync=initial_sync, last_sync_at=connection.last_sync_at)
