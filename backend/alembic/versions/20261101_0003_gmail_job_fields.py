"""Persist extracted company, role, and application status.

Revision ID: 20261101_0003
Revises: 20261101_0002
Create Date: 2026-11-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20261101_0003"
down_revision = "20261101_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("gmail_messages", sa.Column("company", sa.String(length=255), nullable=True))
    op.add_column("gmail_messages", sa.Column("role", sa.String(length=255), nullable=True))
    op.add_column("gmail_messages", sa.Column("status", sa.String(length=32), nullable=True))
    op.create_index("ix_gmail_messages_company", "gmail_messages", ["company"])


def downgrade() -> None:
    op.drop_index("ix_gmail_messages_company", table_name="gmail_messages")
    op.drop_column("gmail_messages", "status")
    op.drop_column("gmail_messages", "role")
    op.drop_column("gmail_messages", "company")
