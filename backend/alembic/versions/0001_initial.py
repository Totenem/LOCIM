"""initial schema

Revision ID: 0001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001"
down_revision = None


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    ]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        *_ts(),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table(
        "freelancer_profiles",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), unique=True,
                  nullable=False),
        sa.Column("headline", sa.String(200), nullable=False, server_default=""),
        sa.Column("bio", sa.Text, nullable=False, server_default=""),
        sa.Column("skills", JSONB, nullable=False, server_default="[]"),
        sa.Column("hourly_rate", sa.Numeric(10, 2)),
        sa.Column("availability", sa.String(50), nullable=False, server_default="available"),
        sa.Column("portfolio_url", sa.String(500)),
        *_ts(),
    )
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("budget", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("deadline_days", sa.Integer, nullable=False, server_default="14"),
        sa.Column("status", sa.String(30), nullable=False, server_default="DRAFT"),
        sa.Column("skills", JSONB, nullable=False, server_default="[]"),
        sa.Column("original_prompt", sa.Text, nullable=False, server_default=""),
        sa.Column("ai_generated_requirements", JSONB),
        *_ts(),
    )
    op.create_index("ix_projects_client_id", "projects", ["client_id"])
    op.create_table(
        "milestones",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("sequence", sa.Integer, nullable=False, server_default="1"),
        sa.Column("status", sa.String(30), nullable=False, server_default="PENDING"),
        *_ts(),
    )
    op.create_index("ix_milestones_project_id", "milestones", ["project_id"])


def downgrade() -> None:
    for t in ("milestones", "projects", "freelancer_profiles", "users"):
        op.drop_table(t)
