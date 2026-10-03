"""Admin: dispute rulings plus a read-only platform overview. Only the ADMIN role gets in."""
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_role
from app.api.escrow import _fail, _locked_milestone, _project_out, refund_milestone, release_milestone
from app.db.session import get_db
from app.core.config import settings
from app.models import FreelancerProfile, Milestone, Payment, Project, User
from app.schemas.schemas import (
    AdminActivity, AdminOverview, AdminProject, AdminUser, DisputeOut, ProjectOut, ResolveIn,
)
from app.services.paypal import PayPalClient, get_paypal

router = APIRouter(prefix="/api/admin")


@router.get("/disputes", response_model=list[DisputeOut])
def list_disputes(_: User = Depends(require_role("ADMIN")), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Milestone, Project).join(Project, Milestone.project_id == Project.id)
        .where(Milestone.status == "DISPUTED")
        .options(selectinload(Project.client), selectinload(Project.freelancer))
        .order_by(Milestone.updated_at)
    ).all()
    return [
        DisputeOut(
            milestone_id=m.id, milestone_title=m.title, sequence=m.sequence, amount=m.amount, total=m.total,
            currency=m.currency, project_id=p.id, project_title=p.title, client_name=p.client_name,
            freelancer_name=p.freelancer_name, milestone_description=m.description,
            submission_note=m.submission_note, ai_review=m.ai_review, dispute_reason=m.dispute_reason,
            dispute_response=m.dispute_response,
        )
        for m, p in rows
    ]


@router.post("/milestones/{milestone_id}/resolve", response_model=ProjectOut)
def resolve(milestone_id: int, body: ResolveIn, _: User = Depends(require_role("ADMIN")),
            db: Session = Depends(get_db), paypal: PayPalClient = Depends(get_paypal)):
    m, p = _locked_milestone(db, milestone_id)
    if not m or m.status != "DISPUTED":
        _fail(404, "No open dispute for this milestone.")
    m.resolution_note = body.note.strip()
    if body.decision == "RELEASE":
        release_milestone(db, m, p, paypal)
    else:
        refund_milestone(db, m, p, paypal)
    db.commit()
    return _project_out(db, p.id)


# ---------- overview ----------
HELD = {"FUNDED", "SUBMITTED", "DISPUTED"}


def _activity(db: Session, limit: int | None) -> list[AdminActivity]:
    q = (select(Payment, Milestone, Project)
         .join(Milestone, Payment.milestone_id == Milestone.id)
         .join(Project, Milestone.project_id == Project.id)
         .where(Payment.status != "PENDING")  # abandoned checkouts aren't money movements
         .options(selectinload(Project.client), selectinload(Project.freelancer))
         .order_by(Payment.id.desc()))
    if limit:
        q = q.limit(limit)
    return [
        AdminActivity(id=pay.id, kind=pay.kind, status=pay.status, amount=pay.amount, fee=pay.fee,
                      currency=pay.currency, project_id=p.id, project_title=p.title, milestone_title=m.title,
                      client_name=p.client_name, freelancer_name=p.freelancer_name, created_at=pay.created_at)
        for pay, m, p in db.execute(q).all()
    ]


@router.get("/overview", response_model=AdminOverview)
def overview(_: User = Depends(require_role("ADMIN")), db: Session = Depends(get_db)):
    def money(kind: str, col=Payment.amount) -> Decimal:
        return db.scalar(select(func.coalesce(func.sum(col), 0)).where(
            Payment.kind == kind, Payment.status == "COMPLETED")) or Decimal(0)

    funded, refunded, paid_out = money("FUND"), money("REFUND"), money("RELEASE")
    fees = money("FUND", Payment.fee) - money("REFUND", Payment.fee)
    by_status = dict(db.execute(select(Project.status, func.count()).group_by(Project.status)).all())
    held = sum((m.total for m in db.scalars(select(Milestone).where(Milestone.status.in_(HELD))).all()), Decimal(0))
    roles = dict(db.execute(select(User.role, func.count()).group_by(User.role)).all())
    return AdminOverview(
        currency=settings.default_currency, clients=roles.get("CLIENT", 0), freelancers=roles.get("FREELANCER", 0),
        freelancers_payout_ready=db.scalar(select(func.count()).select_from(FreelancerProfile)
                                           .where(FreelancerProfile.paypal_email.is_not(None))) or 0,
        projects=sum(by_status.values()), projects_by_status=by_status,
        open_disputes=db.scalar(select(func.count()).select_from(Milestone).where(Milestone.status == "DISPUTED")) or 0,
        volume=funded - refunded, escrow_held=held, paid_out=paid_out, refunded=refunded, fees_earned=fees,
        recent_activity=_activity(db, 8),
    )


@router.get("/payments", response_model=list[AdminActivity])
def all_payments(_: User = Depends(require_role("ADMIN")), db: Session = Depends(get_db)):
    return _activity(db, 300)


@router.get("/users", response_model=list[AdminUser])
def users(_: User = Depends(require_role("ADMIN")), db: Session = Depends(get_db)):
    created = dict(db.execute(select(Project.client_id, func.count()).group_by(Project.client_id)).all())
    hired = dict(db.execute(select(Project.freelancer_id, func.count())
                            .where(Project.freelancer_id.is_not(None)).group_by(Project.freelancer_id)).all())
    rows = db.scalars(select(User).options(selectinload(User.profile)).order_by(User.created_at.desc())).all()
    return [
        AdminUser(id=u.id, name=u.name, email=u.email, role=u.role, created_at=u.created_at,
                  payout_ready=bool(u.profile and u.profile.paypal_email) if u.role == "FREELANCER" else None,
                  projects=(created if u.role == "CLIENT" else hired).get(u.id, 0))
        for u in rows
    ]


@router.get("/projects", response_model=list[AdminProject])
def all_projects(_: User = Depends(require_role("ADMIN")), db: Session = Depends(get_db)):
    rows = db.scalars(select(Project).options(selectinload(Project.milestones), selectinload(Project.client),
                                              selectinload(Project.freelancer))
                      .order_by(Project.created_at.desc()).limit(300)).all()
    return [
        AdminProject(
            id=p.id, title=p.title, status=p.status, currency=p.currency, budget=p.budget,
            client_name=p.client_name, freelancer_name=p.freelancer_name, milestones_total=len(p.milestones),
            milestones_released=sum(m.status == "RELEASED" for m in p.milestones),
            escrow_held=sum((m.total for m in p.milestones if m.status in HELD), Decimal(0)),
            has_dispute=any(m.status == "DISPUTED" for m in p.milestones), created_at=p.created_at)
        for p in rows
    ]
