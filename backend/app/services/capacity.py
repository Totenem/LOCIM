"""A freelancer can run a limited number of projects at once. A project is active until it is COMPLETED
(every milestone released); a refund that unassigns the freelancer also frees the slot."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Project


def active_counts(db: Session) -> dict[int, int]:
    """Active project count per freelancer user id."""
    rows = db.execute(
        select(Project.freelancer_id, func.count())
        .where(Project.freelancer_id.is_not(None), Project.status != "COMPLETED")
        .group_by(Project.freelancer_id)
    ).all()
    return dict(rows)


def active_count(db: Session, user_id: int) -> int:
    return active_counts(db).get(user_id, 0)


def at_capacity(active: int) -> bool:
    return active >= settings.max_active_projects
