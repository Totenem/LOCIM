"""dispute fields and AI review

Revision ID: 0004
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004"
down_revision = "0003"


def upgrade() -> None:
    op.add_column("milestones", sa.Column("ai_review", JSONB))
    op.add_column("milestones", sa.Column("dispute_reason", sa.Text))
    op.add_column("milestones", sa.Column("dispute_response", sa.Text))
    op.add_column("milestones", sa.Column("resolution_note", sa.Text))


def downgrade() -> None:
    for c in ("resolution_note", "dispute_response", "dispute_reason", "ai_review"):
        op.drop_column("milestones", c)
