"""Add Gmail metadata import and incremental sync cursor.

Revision ID: 20261101_0002
Revises: 20261101_0001
Create Date: 2026-11-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20261101_0002"
down_revision = "20261101_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("gmail_connections", sa.Column("history_id", sa.String(length=64), nullable=True))
    op.add_column("gmail_connections", sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "gmail_messages",
        sa.Column("google_subject", sa.String(length=255), nullable=False),
        sa.Column("message_id", sa.String(length=255), nullable=False),
        sa.Column("thread_id", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("sender", sa.Text(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["google_subject"], ["gmail_connections.google_subject"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("google_subject", "message_id"),
    )
    op.create_index("ix_gmail_messages_thread_id", "gmail_messages", ["thread_id"])
    op.create_index("ix_gmail_messages_received_at", "gmail_messages", ["received_at"])


def downgrade() -> None:
    op.drop_index("ix_gmail_messages_received_at", table_name="gmail_messages")
    op.drop_index("ix_gmail_messages_thread_id", table_name="gmail_messages")
    op.drop_table("gmail_messages")
    op.drop_column("gmail_connections", "last_sync_at")
    op.drop_column("gmail_connections", "history_id")
