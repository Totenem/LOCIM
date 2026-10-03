from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.services.fees import platform_fee


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))  # CLIENT | FREELANCER

    profile: Mapped["FreelancerProfile | None"] = relationship(back_populates="user", uselist=False)
    projects: Mapped[list["Project"]] = relationship(back_populates="client", foreign_keys="Project.client_id")


class FreelancerProfile(TimestampMixin, Base):
    __tablename__ = "freelancer_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    headline: Mapped[str] = mapped_column(String(200), default="")
    bio: Mapped[str] = mapped_column(Text, default="")
    skills: Mapped[list] = mapped_column(JSONB, default=list)
    hourly_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    availability: Mapped[str] = mapped_column(String(50), default="available")
    portfolio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    paypal_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user: Mapped[User] = relationship(back_populates="profile")


class Project(TimestampMixin, Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    budget: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="PHP")
    deadline_days: Mapped[int] = mapped_column(Integer, default=14)
    status: Mapped[str] = mapped_column(String(30), default="DRAFT")
    skills: Mapped[list] = mapped_column(JSONB, default=list)
    original_prompt: Mapped[str] = mapped_column(Text, default="")
    ai_generated_requirements: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    freelancer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    client: Mapped[User] = relationship(back_populates="projects", foreign_keys=[client_id])
    freelancer: Mapped[User | None] = relationship(foreign_keys=[freelancer_id])

    @property
    def freelancer_name(self) -> str | None:
        return self.freelancer.name if self.freelancer else None

    @property
    def client_name(self) -> str:
        return self.client.name
    milestones: Mapped[list["Milestone"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Milestone.sequence"
    )


class Milestone(TimestampMixin, Base):
    __tablename__ = "milestones"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="PHP")
    sequence: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(30), default="PENDING")
    submission_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ai_review: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # advisory; the client decides
    dispute_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    dispute_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped[Project] = relationship(back_populates="milestones")

    @property
    def fee(self) -> Decimal:
        return platform_fee(self.amount)

    @property
    def total(self) -> Decimal:
        return self.amount + self.fee

    payments: Mapped[list["Payment"]] = relationship(back_populates="milestone", order_by="Payment.id")


class Payment(TimestampMixin, Base):
    """Escrow ledger. One row per money movement: FUND (client -> LOCIM), RELEASE (LOCIM -> freelancer),
    REFUND (LOCIM -> client). Rows are never edited except PENDING -> COMPLETED/FAILED."""

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    milestone_id: Mapped[int] = mapped_column(ForeignKey("milestones.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # FUND | RELEASE | REFUND
    status: Mapped[str] = mapped_column(String(12), default="PENDING")  # PENDING | COMPLETED | FAILED
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))  # total moved (FUND includes the fee)
    fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(3), default="PHP")
    paypal_order_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    paypal_capture_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    paypal_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)  # payout batch / refund id

    milestone: Mapped[Milestone] = relationship(back_populates="payments")
