from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_role
from app.core.config import settings
from app.db.session import get_db
from app.models import Milestone, Payment, Project, User
from app.schemas.schemas import DashboardOut, DashboardProject, DashboardTotals

router = APIRouter(prefix="/api")

HELD = {"FUNDED", "SUBMITTED", "DISPUTED"}


def _next_action(p: Project) -> tuple[str, bool]:
    """What should the client do next on this project? Second value: does it need their attention now."""
    if p.status == "COMPLETED":
        return "Completed", False
    if not p.freelancer_id:
        return "Hire a freelancer", True
    current = next((m for m in p.milestones if m.status != "RELEASED"), None)
    if current is None:
        return "Completed", False
    n = current.sequence
    return {
        "PENDING": (f"Fund milestone {n}", True),
        "FUNDED": (f"Waiting for {p.freelancer_name} to submit milestone {n}", False),
        "SUBMITTED": (f"Review milestone {n} and approve", True),
        "DISPUTED": (f"Milestone {n} is in dispute", False),
    }.get(current.status, ("In progress", False))


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(user: User = Depends(require_role("CLIENT")), db: Session = Depends(get_db)):
    projects = db.scalars(
        select(Project).where(Project.client_id == user.id)
        .options(selectinload(Project.milestones), selectinload(Project.freelancer))
        .order_by(Project.created_at.desc())
    ).all()

    # fees the client has actually paid: fees on completed fundings, minus refunded ones
    fee_rows = db.execute(
        select(Payment.kind, Payment.fee).join(Milestone, Payment.milestone_id == Milestone.id)
        .join(Project, Milestone.project_id == Project.id)
        .where(Project.client_id == user.id, Payment.status == "COMPLETED", Payment.kind.in_(("FUND", "REFUND")))
    ).all()
    fees_paid = sum((f if k == "FUND" else -f for k, f in fee_rows), Decimal(0))

    rows: list[DashboardProject] = []
    for p in projects:
        action, attention = _next_action(p)
        rows.append(DashboardProject(
            id=p.id, title=p.title, status=p.status, currency=p.currency, budget=p.budget,
            freelancer_name=p.freelancer_name, milestones_total=len(p.milestones),
            milestones_released=sum(m.status == "RELEASED" for m in p.milestones),
            milestone_statuses=[m.status for m in p.milestones],
            escrow_held=sum((m.total for m in p.milestones if m.status in HELD), Decimal(0)),
            paid_out=sum((m.amount for m in p.milestones if m.status == "RELEASED"), Decimal(0)),
            next_action=action, needs_attention=attention, created_at=p.created_at,
        ))
    return DashboardOut(
        totals=DashboardTotals(
            projects=len(rows), active=sum(r.status != "COMPLETED" for r in rows),
            completed=sum(r.status == "COMPLETED" for r in rows),
            needs_attention=sum(r.needs_attention for r in rows),
            total_budget=sum((r.budget for r in rows), Decimal(0)),
            escrow_held=sum((r.escrow_held for r in rows), Decimal(0)),
            paid_out=sum((r.paid_out for r in rows), Decimal(0)),
            fees_paid=fees_paid, currency=settings.default_currency,
        ),
        projects=rows,
    )
