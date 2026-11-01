import base64
import binascii
import hashlib
import hmac
import json
import time
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _secret_bytes() -> bytes:
    secret = settings.app_secret_key
    if secret is None or not secret.get_secret_value().strip():
        raise ValueError("APP_SECRET_KEY is required for Gmail token encryption and sessions.")
    return secret.get_secret_value().encode("utf-8")


def _fernet() -> Fernet:
    key_material = hashlib.sha256(b"jobpilot:gmail-token:v1:" + _secret_bytes()).digest()
    return Fernet(base64.urlsafe_b64encode(key_material))


def encrypt_refresh_token(refresh_token: str) -> str:
    return _fernet().encrypt(refresh_token.encode("utf-8")).decode("ascii")


def decrypt_refresh_token(encrypted_refresh_token: str) -> str:
    try:
        return _fernet().decrypt(encrypted_refresh_token.encode("ascii")).decode("utf-8")
    except InvalidToken as error:
        raise ValueError("Stored Gmail credentials cannot be decrypted with the current APP_SECRET_KEY.") from error


def create_session_token(google_subject: str) -> str:
    payload = json.dumps(
        {"sub": google_subject, "exp": int(time.time()) + 60 * 60 * 24 * 14},
        separators=(",", ":"),
    ).encode("utf-8")
    encoded_payload = base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")
    signature = hmac.new(
        _secret_bytes(), b"jobpilot:session:v1:" + encoded_payload.encode("ascii"), hashlib.sha256
    ).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"{encoded_payload}.{encoded_signature}"


def read_session_subject(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        expected = hmac.new(
            _secret_bytes(), b"jobpilot:session:v1:" + encoded_payload.encode("ascii"), hashlib.sha256
        ).digest()
        padding = "=" * (-len(encoded_signature) % 4)
        provided = base64.urlsafe_b64decode(encoded_signature + padding)
        if not hmac.compare_digest(expected, provided):
            return None
        payload_padding = "=" * (-len(encoded_payload) % 4)
        payload = json.loads(base64.urlsafe_b64decode(encoded_payload + payload_padding))
        if not isinstance(payload.get("sub"), str) or payload.get("exp", 0) < int(time.time()):
            return None
        return payload["sub"]
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError, binascii.Error):
        return None
