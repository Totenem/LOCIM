"""Hiring and the milestone escrow lifecycle.

PENDING --fund--> FUNDED --submit--> SUBMITTED --release--> RELEASED
                     |                   \\--dispute--> DISPUTED (funds frozen)
                     \\--refund--> PENDING (project reopens, freelancer unassigned)

Rules that protect both sides:
- Hiring moves no money. Funds only move when the client funds a milestone.
- Only one milestone is in flight at a time, so at most one milestone is ever at risk.
- The client can refund only before the freelancer submits. After that it's release or dispute.
- Every state change locks the milestone row (FOR UPDATE) so double clicks can't double-pay.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models import FreelancerProfile, Milestone, Payment, Project, User
from app.schemas.schemas import (
    AddMilestoneIn, CaptureIn, DisputeIn, DisputeResponseIn, FreelancerMe, FreelancerMeUpdate, FundOrderOut, HireIn,
    PaymentOut, ProjectOut, ScopeCheck, ScopeCheckIn, SubmitIn,
)
from app.services import ai_service, capacity
from app.services.paypal import PayPalClient, PayPalError, get_paypal
from app.core.config import settings

router = APIRouter(prefix="/api")

DONE = {"RELEASED"}


def _fail(code: int, msg: str):
    raise HTTPException(code, msg)


def _paypal_call(fn):
    try:
        return fn()
    except PayPalError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e)) from e


def _locked_milestone(db: Session, milestone_id: int) -> tuple[Milestone, Project]:
    m = db.scalar(select(Milestone).where(Milestone.id == milestone_id).with_for_update())
    project = db.scalar(
        select(Project).where(Project.id == m.project_id).options(selectinload(Project.milestones))
    ) if m else None
    return m, project


def _client_milestone(db: Session, milestone_id: int, user: User) -> tuple[Milestone, Project]:
    m, p = _locked_milestone(db, milestone_id)
    if not m or p.client_id != user.id:  # 404 for both: don't leak existence
        _fail(404, "Milestone not found")
    return m, p


def _freelancer_milestone(db: Session, milestone_id: int, user: User) -> tuple[Milestone, Project]:
    m, p = _locked_milestone(db, milestone_id)
    if not m or p.freelancer_id != user.id:
        _fail(404, "Milestone not found")
    return m, p


def _project_out(db: Session, project_id: int) -> Project:
    db.expire_all()
    return db.scalar(select(Project).where(Project.id == project_id).options(selectinload(Project.milestones)))


# ---------- hiring ----------
@router.post("/projects/{project_id}/hire", response_model=ProjectOut)
def hire(project_id: int, body: HireIn, user: User = Depends(require_role("CLIENT")),
         db: Session = Depends(get_db)):
    p = db.scalar(select(Project).where(Project.id == project_id).with_for_update())
    if not p or p.client_id != user.id:
        _fail(404, "Project not found")
    if p.freelancer_id or p.status != "OPEN":
        _fail(409, "This project already has a freelancer.")
    profile = db.get(FreelancerProfile, body.freelancer_id)
    if not profile:
        _fail(404, "Freelancer not found")
    if not profile.paypal_email:
        _fail(409, "This freelancer hasn't connected PayPal yet, so they can't be paid. Pick another.")
    if capacity.at_capacity(capacity.active_count(db, profile.user_id)):
        _fail(409, f"This freelancer already has {settings.max_active_projects} active projects. Pick someone else or wait for them to finish one.")
    p.freelancer_id = profile.user_id
    p.status = "ASSIGNED"
    db.commit()
    return _project_out(db, p.id)


# ---------- funding (client -> escrow) ----------
@router.post("/milestones/{milestone_id}/fund", response_model=FundOrderOut)
def fund_order(milestone_id: int, user: User = Depends(require_role("CLIENT")),
               db: Session = Depends(get_db), paypal: PayPalClient = Depends(get_paypal)):
    m, p = _client_milestone(db, milestone_id, user)
    if not p.freelancer_id:
        _fail(409, "Hire a freelancer before funding a milestone.")
    if m.status != "PENDING":
        _fail(409, "This milestone is already funded or finished.")
    if any(x.sequence < m.sequence and x.status not in DONE for x in p.milestones):
        _fail(409, "Finish the earlier milestones first. Only one is funded at a time.")
    base = f"{settings.frontend_url.rstrip('/')}/workspace/p/{p.id}"
    order = _paypal_call(lambda: paypal.create_order(
        amount=m.total, currency=m.currency, custom_id=str(m.id),
        description=f"{p.title} - {m.title}", return_url=f"{base}?milestone={m.id}",
        cancel_url=f"{base}?cancelled=1"))
    db.add(Payment(milestone_id=m.id, kind="FUND", status="PENDING", amount=m.total, fee=m.fee,
                   currency=m.currency, paypal_order_id=order.id))
    db.commit()
    return FundOrderOut(order_id=order.id, approve_url=order.approve_url)


@router.post("/milestones/{milestone_id}/capture", response_model=ProjectOut)
def capture(milestone_id: int, body: CaptureIn, user: User = Depends(require_role("CLIENT")),
            db: Session = Depends(get_db), paypal: PayPalClient = Depends(get_paypal)):
    m, p = _client_milestone(db, milestone_id, user)
    pay = db.scalar(select(Payment).where(
        Payment.milestone_id == m.id, Payment.kind == "FUND", Payment.paypal_order_id == body.order_id))
    if not pay:  # only orders we created for this exact milestone can be captured
        _fail(404, "Payment not found for this milestone.")
    if pay.status == "COMPLETED":  # page reload after a successful capture
        return _project_out(db, p.id)
    if m.status != "PENDING":
        _fail(409, "This milestone is already funded or finished.")
    cap = _paypal_call(lambda: paypal.capture_order(body.order_id))
    if cap.status != "COMPLETED":
        _fail(402, "PayPal hasn't completed this payment yet. If you were charged, refresh in a minute.")
    if cap.amount != m.total or cap.currency != m.currency or cap.custom_id != str(m.id):
        pay.status = "FAILED"
        db.commit()
        _fail(409, "The captured payment didn't match this milestone. Contact support.")
    pay.status, pay.paypal_capture_id = "COMPLETED", cap.capture_id
    m.status = "FUNDED"
    p.status = "IN_PROGRESS"
    db.commit()
    return _project_out(db, p.id)


# ---------- work ----------
@router.post("/milestones/{milestone_id}/submit", response_model=ProjectOut)
def submit(milestone_id: int, body: SubmitIn, user: User = Depends(require_role("FREELANCER")),
           db: Session = Depends(get_db)):
    m, p = _freelancer_milestone(db, milestone_id, user)
    if m.status != "FUNDED":
        _fail(409, "You can submit once the client has funded this milestone.")
    m.status, m.submission_note = "SUBMITTED", body.note.strip()
    m.submitted_at = datetime.now(timezone.utc)
    try:  # advisory only: a failed or slow AI must never block the freelancer from submitting
        m.ai_review = ai_service.review_submission(m.title, m.description, m.submission_note).model_dump()
    except ai_service.AIUnavailable:
        m.ai_review = None
    db.commit()
    return _project_out(db, p.id)


# ---------- release / refund / dispute ----------
def release_milestone(db: Session, m: Milestone, p: Project, paypal: PayPalClient) -> None:
    """Pay the freelancer the full milestone amount. Shared by the client's approval and an admin's ruling."""
    profile = db.scalar(select(FreelancerProfile).where(FreelancerProfile.user_id == p.freelancer_id))
    if not profile or not profile.paypal_email:
        _fail(409, "The freelancer has no PayPal email on file.")
    batch = _paypal_call(lambda: paypal.payout(
        email=profile.paypal_email, amount=m.amount, currency=m.currency, item_id=f"m{m.id}"))
    db.add(Payment(milestone_id=m.id, kind="RELEASE", status="COMPLETED", amount=m.amount,
                   currency=m.currency, paypal_ref=batch))
    m.status = "RELEASED"
    if all(x.status in DONE for x in p.milestones):
        p.status = "COMPLETED"


def refund_milestone(db: Session, m: Milestone, p: Project, paypal: PayPalClient) -> None:
    """Return the client's full payment (fee included), reopen the slot and unassign the freelancer."""
    fund = db.scalar(select(Payment).where(
        Payment.milestone_id == m.id, Payment.kind == "FUND", Payment.status == "COMPLETED"))
    if not fund or not fund.paypal_capture_id:
        _fail(409, "No completed payment found to refund.")
    ref = _paypal_call(lambda: paypal.refund(
        capture_id=fund.paypal_capture_id, amount=fund.amount, currency=fund.currency, item_id=f"m{m.id}-p{fund.id}"))
    db.add(Payment(milestone_id=m.id, kind="REFUND", status="COMPLETED", amount=fund.amount, fee=fund.fee,
                   currency=fund.currency, paypal_capture_id=fund.paypal_capture_id, paypal_ref=ref))
    m.status = "PENDING"  # money is back with the client; the slot is open again
    m.submission_note = m.ai_review = None
    p.freelancer_id, p.status = None, "OPEN"


@router.post("/milestones/{milestone_id}/release", response_model=ProjectOut)
def release(milestone_id: int, user: User = Depends(require_role("CLIENT")),
            db: Session = Depends(get_db), paypal: PayPalClient = Depends(get_paypal)):
    m, p = _client_milestone(db, milestone_id, user)
    if m.status not in ("FUNDED", "SUBMITTED"):
        _fail(409, "Only a funded milestone can be released.")
    release_milestone(db, m, p, paypal)
    db.commit()
    return _project_out(db, p.id)


@router.post("/milestones/{milestone_id}/refund", response_model=ProjectOut)
def refund(milestone_id: int, user: User = Depends(require_role("CLIENT")),
           db: Session = Depends(get_db), paypal: PayPalClient = Depends(get_paypal)):
    m, p = _client_milestone(db, milestone_id, user)
    if m.status != "FUNDED":
        _fail(409, "You can only get a refund before the freelancer submits work.")
    refund_milestone(db, m, p, paypal)
    db.commit()
    return _project_out(db, p.id)


@router.post("/milestones/{milestone_id}/dispute", response_model=ProjectOut)
def dispute(milestone_id: int, body: DisputeIn, user: User = Depends(require_role("CLIENT")),
            db: Session = Depends(get_db)):
    m, p = _client_milestone(db, milestone_id, user)
    if m.status != "SUBMITTED":
        _fail(409, "You can dispute a milestone after the freelancer submits it.")
    m.status = "DISPUTED"  # funds stay in escrow until an admin rules on it
    m.dispute_reason, m.dispute_response, m.resolution_note = body.reason.strip(), None, None
    db.commit()
    return _project_out(db, p.id)


@router.post("/milestones/{milestone_id}/dispute/respond", response_model=ProjectOut)
def dispute_respond(milestone_id: int, body: DisputeResponseIn, user: User = Depends(require_role("FREELANCER")),
                    db: Session = Depends(get_db)):
    m, p = _freelancer_milestone(db, milestone_id, user)
    if m.status != "DISPUTED":
        _fail(409, "There's no open dispute on this milestone.")
    m.dispute_response = body.message.strip()
    db.commit()
    return _project_out(db, p.id)


# ---------- scope changes ----------
@router.post("/projects/{project_id}/scope-check", response_model=ScopeCheck)
def scope_check(project_id: int, body: ScopeCheckIn, user: User = Depends(require_role("CLIENT")),
                db: Session = Depends(get_db)):
    p = db.scalar(select(Project).where(Project.id == project_id).options(selectinload(Project.milestones)))
    if not p or p.client_id != user.id:
        _fail(404, "Project not found")
    try:
        return ai_service.check_scope(body.request, p)
    except ai_service.AIUnavailable as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"AI is unavailable right now: {e}") from e


@router.post("/projects/{project_id}/milestones", response_model=ProjectOut, status_code=201)
def add_milestone(project_id: int, body: AddMilestoneIn, user: User = Depends(require_role("CLIENT")),
                  db: Session = Depends(get_db)):
    """Out-of-scope work becomes a new, separately funded milestone and raises the budget by the same amount."""
    p = db.scalar(select(Project).where(Project.id == project_id).options(selectinload(Project.milestones))
                  .with_for_update())
    if not p or p.client_id != user.id:
        _fail(404, "Project not found")
    if p.status == "COMPLETED":
        _fail(409, "This project is finished. Start a new one for the extra work.")
    p.milestones.append(Milestone(
        title=body.title.strip(), description=body.description.strip(), amount=body.amount,
        currency=p.currency, sequence=max((x.sequence for x in p.milestones), default=0) + 1))
    p.budget += body.amount
    db.commit()
    return _project_out(db, p.id)


# ---------- ledger ----------
@router.get("/payments", response_model=list[PaymentOut])
def payments(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = (select(Payment, Milestone, Project)
         .join(Milestone, Payment.milestone_id == Milestone.id)
         .join(Project, Milestone.project_id == Project.id)
         .where(Payment.status != "PENDING")  # abandoned checkouts aren't money movements
         .order_by(Payment.id.desc()))
    if user.role == "CLIENT":
        q = q.where(Project.client_id == user.id)
    else:
        q = q.where(Project.freelancer_id == user.id, Payment.kind == "RELEASE")
    return [PaymentOut(id=pay.id, kind=pay.kind, status=pay.status, amount=pay.amount, fee=pay.fee, currency=pay.currency,
                       project_id=proj.id, project_title=proj.title, milestone_title=ms.title,
                       created_at=pay.created_at)
            for pay, ms, proj in db.execute(q).all()]


# ---------- freelancer side ----------
@router.get("/jobs", response_model=list[ProjectOut])
def jobs(user: User = Depends(require_role("FREELANCER")), db: Session = Depends(get_db)):
    return db.scalars(select(Project).where(Project.freelancer_id == user.id)
                      .options(selectinload(Project.milestones)).order_by(Project.created_at.desc())).all()


def _me(f: FreelancerProfile, active: int) -> FreelancerMe:
    return FreelancerMe(headline=f.headline, bio=f.bio, skills=f.skills or [], hourly_rate=f.hourly_rate,
                        availability=f.availability, paypal_email=f.paypal_email, active_projects=active,
                        max_active_projects=settings.max_active_projects)


@router.get("/freelancers/me", response_model=FreelancerMe)
def my_profile(user: User = Depends(require_role("FREELANCER")), db: Session = Depends(get_db)):
    return _me(user.profile, capacity.active_count(db, user.id))


@router.put("/freelancers/me", response_model=FreelancerMe)
def update_my_profile(body: FreelancerMeUpdate, user: User = Depends(require_role("FREELANCER")),
                      db: Session = Depends(get_db)):
    f = user.profile
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(f, k, [s.strip() for s in v if s.strip()] if k == "skills" else v)
    db.commit()
    return _me(f, capacity.active_count(db, user.id))
