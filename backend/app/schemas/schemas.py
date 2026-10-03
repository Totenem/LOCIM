from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.config import settings


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- auth / users ----
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal["CLIENT", "FREELANCER"] = "CLIENT"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORM):
    id: int
    name: str
    email: EmailStr
    role: str


class TokenOut(BaseModel):
    access_token: str
    user: UserOut


# ---- milestones / projects ----
class MilestoneIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    amount: Decimal = Field(ge=0)
    sequence: int = Field(default=1, ge=1)


class MilestoneOut(ORM):
    id: int
    title: str
    description: str
    amount: Decimal
    fee: Decimal  # LOCIM platform fee, paid by the client on top of the amount
    total: Decimal  # what the client is charged to fund this milestone
    currency: str
    sequence: int
    status: str
    submission_note: str | None = None
    submitted_at: datetime | None = None
    ai_review: dict | None = None
    dispute_reason: str | None = None
    dispute_response: str | None = None
    resolution_note: str | None = None


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    budget: Decimal = Field(gt=0)
    currency: str = Field(default_factory=lambda: settings.default_currency, min_length=3, max_length=3)
    deadline_days: int = Field(default=14, ge=1, le=730)
    skills: list[str] = []
    original_prompt: str = ""
    milestones: list[MilestoneIn] = Field(min_length=1, max_length=12)


class ProjectOut(ORM):
    id: int
    title: str
    description: str
    budget: Decimal
    currency: str
    deadline_days: int
    status: str
    skills: list[str]
    original_prompt: str
    created_at: datetime
    freelancer_id: int | None = None
    freelancer_name: str | None = None
    client_name: str = ""
    milestones: list[MilestoneOut]


class ProjectSummary(ORM):
    id: int
    title: str
    budget: Decimal
    currency: str
    status: str
    created_at: datetime


# ---- freelancers ----
class FreelancerOut(BaseModel):
    id: int
    name: str
    headline: str
    bio: str
    skills: list[str]
    hourly_rate: Decimal | None
    availability: str
    portfolio_url: str | None
    payout_ready: bool = False  # has a PayPal email; the address itself is never exposed
    active_projects: int = 0
    at_capacity: bool = False


class FreelancerMe(BaseModel):
    headline: str
    bio: str
    skills: list[str]
    hourly_rate: Decimal | None
    availability: str
    paypal_email: str | None
    active_projects: int = 0
    max_active_projects: int = 3


class FreelancerMeUpdate(BaseModel):
    headline: str | None = Field(default=None, max_length=200)
    bio: str | None = Field(default=None, max_length=2000)
    skills: list[str] | None = Field(default=None, max_length=20)
    hourly_rate: Decimal | None = Field(default=None, ge=0)
    availability: Literal["available", "busy"] | None = None
    paypal_email: EmailStr | None = None


class FreelancerMatch(BaseModel):
    freelancer: FreelancerOut
    score: int
    reasons: list[str]


# ---- escrow / payments ----
class HireIn(BaseModel):
    freelancer_id: int  # FreelancerProfile.id, as returned by /api/freelancers


class FundOrderOut(BaseModel):
    order_id: str
    approve_url: str


class CaptureIn(BaseModel):
    order_id: str = Field(min_length=5, max_length=64)


class SubmitIn(BaseModel):
    note: str = Field(min_length=1, max_length=4000)


class PaymentOut(BaseModel):
    id: int
    kind: str
    status: str
    amount: Decimal
    fee: Decimal
    currency: str
    project_id: int
    project_title: str
    milestone_title: str
    created_at: datetime


# ---- AI ----
class AIProjectRequest(BaseModel):
    prompt: str = Field(min_length=5, max_length=4000)
    # optional: refine an existing draft ("make it cheaper")
    previous_draft: "ProjectDraft | None" = None


class DraftMilestone(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    amount: Decimal = Field(ge=0)
    sequence: int = Field(default=1, ge=1)


class ProjectDraft(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    skills: list[str] = Field(default_factory=list, max_length=15)
    budget: Decimal = Field(gt=0)
    currency: str = Field(default_factory=lambda: settings.default_currency, min_length=3, max_length=3)
    deadline_days: int = Field(default=14, ge=1, le=730)
    milestones: list[DraftMilestone] = Field(min_length=1, max_length=12)


AIProjectRequest.model_rebuild()


# ---- dashboard ----
class DashboardProject(BaseModel):
    id: int
    title: str
    status: str
    currency: str
    budget: Decimal
    freelancer_name: str | None
    milestones_total: int
    milestones_released: int
    milestone_statuses: list[str]
    escrow_held: Decimal  # client's money currently held by LOCIM
    paid_out: Decimal  # released to the freelancer
    next_action: str
    needs_attention: bool
    created_at: datetime


class DashboardTotals(BaseModel):
    projects: int
    active: int
    completed: int
    needs_attention: int
    total_budget: Decimal
    escrow_held: Decimal
    paid_out: Decimal
    fees_paid: Decimal
    currency: str


class DashboardOut(BaseModel):
    totals: DashboardTotals
    projects: list[DashboardProject]


# ---- disputes ----
class DisputeIn(BaseModel):
    reason: str = Field(min_length=5, max_length=4000)


class DisputeResponseIn(BaseModel):
    message: str = Field(min_length=2, max_length=4000)


class ResolveIn(BaseModel):
    decision: Literal["RELEASE", "REFUND"]  # RELEASE = pay the freelancer, REFUND = return the money to the client
    note: str = Field(min_length=5, max_length=4000)


class DisputeOut(BaseModel):
    milestone_id: int
    milestone_title: str
    sequence: int
    amount: Decimal
    total: Decimal
    currency: str
    project_id: int
    project_title: str
    client_name: str
    freelancer_name: str | None
    milestone_description: str
    submission_note: str | None
    ai_review: dict | None
    dispute_reason: str | None
    dispute_response: str | None


# ---- AI review + scope ----
class ReviewCheck(BaseModel):
    requirement: str
    met: bool
    comment: str = ""


class SubmissionReview(BaseModel):
    verdict: Literal["MEETS", "PARTIAL", "UNCLEAR"]
    summary: str
    checks: list[ReviewCheck] = Field(default_factory=list, max_length=12)


class ScopeCheckIn(BaseModel):
    request: str = Field(min_length=5, max_length=2000)


class SuggestedMilestone(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    amount: Decimal = Field(ge=0)


class ScopeCheck(BaseModel):
    verdict: Literal["IN_SCOPE", "OUT_OF_SCOPE", "UNCLEAR"]
    explanation: str
    matched_milestone: int | None = None  # sequence of the milestone that already covers it
    suggested_milestone: SuggestedMilestone | None = None


class AddMilestoneIn(SuggestedMilestone):
    amount: Decimal = Field(gt=0)


# ---- admin overview ----
class AdminActivity(BaseModel):
    id: int
    kind: str
    status: str
    amount: Decimal
    fee: Decimal
    currency: str
    project_id: int
    project_title: str
    milestone_title: str
    client_name: str
    freelancer_name: str | None
    created_at: datetime


class AdminOverview(BaseModel):
    currency: str
    clients: int
    freelancers: int
    freelancers_payout_ready: int
    projects: int
    projects_by_status: dict[str, int]
    open_disputes: int
    volume: Decimal  # everything clients have paid in (fees included), net of refunds
    escrow_held: Decimal
    paid_out: Decimal
    refunded: Decimal
    fees_earned: Decimal  # platform revenue: fees on fundings, minus fees on refunded fundings
    recent_activity: list[AdminActivity]


class AdminUser(BaseModel):
    id: int
    name: str
    email: str
    role: str
    created_at: datetime
    payout_ready: bool | None = None  # freelancers only
    projects: int  # created (client) or hired for (freelancer)


class AdminProject(BaseModel):
    id: int
    title: str
    status: str
    currency: str
    budget: Decimal
    client_name: str
    freelancer_name: str | None
    milestones_total: int
    milestones_released: int
    escrow_held: Decimal
    has_dispute: bool
    created_at: datetime
