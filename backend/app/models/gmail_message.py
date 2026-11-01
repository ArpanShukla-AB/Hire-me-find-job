from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.gmail_connection import Base


class GmailMessage(Base):
    """Minimal metadata for job-search messages discovered by an authorized sync."""

    __tablename__ = "gmail_messages"

    google_subject: Mapped[str] = mapped_column(
        String(255), ForeignKey("gmail_connections.google_subject", ondelete="CASCADE"), primary_key=True
    )
    message_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    thread_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sender: Mapped[str] = mapped_column(Text, nullable=False, default="")
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
