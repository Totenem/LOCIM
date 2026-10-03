"""escrow: hiring, submissions, payments ledger

Revision ID: 0002
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"


def upgrade() -> None:
    op.add_column("freelancer_profiles", sa.Column("paypal_email", sa.String(255)))
    op.add_column("projects", sa.Column("freelancer_id", sa.Integer,
                                        sa.ForeignKey("users.id", ondelete="SET NULL")))
    op.create_index("ix_projects_freelancer_id", "projects", ["freelancer_id"])
    op.add_column("milestones", sa.Column("submission_note", sa.Text))
    op.add_column("milestones", sa.Column("submitted_at", sa.DateTime(timezone=True)))
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("milestone_id", sa.Integer, sa.ForeignKey("milestones.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="PENDING"),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("paypal_order_id", sa.String(64)),
        sa.Column("paypal_capture_id", sa.String(64)),
        sa.Column("paypal_ref", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_payments_milestone_id", "payments", ["milestone_id"])
    op.create_index("ix_payments_paypal_order_id", "payments", ["paypal_order_id"])


def downgrade() -> None:
    op.drop_table("payments")
    op.drop_column("milestones", "submitted_at")
    op.drop_column("milestones", "submission_note")
    op.drop_index("ix_projects_freelancer_id", "projects")
    op.drop_column("projects", "freelancer_id")
    op.drop_column("freelancer_profiles", "paypal_email")
