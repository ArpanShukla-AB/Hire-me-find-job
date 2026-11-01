"""Add storage for encrypted Gmail OAuth connections.

Revision ID: 20261101_0001
Revises:
Create Date: 2026-11-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20261101_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gmail_connections",
        sa.Column("google_subject", sa.String(length=255), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("encrypted_refresh_token", sa.Text(), nullable=False),
        sa.Column("scopes", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_gmail_connections_email", "gmail_connections", ["email"])


def downgrade() -> None:
    op.drop_index("ix_gmail_connections_email", table_name="gmail_connections")
    op.drop_table("gmail_connections")
