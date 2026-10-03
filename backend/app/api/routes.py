from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_role
from app.core.security import create_token, hash_password, verify_password
from app.db.session import get_db
from app.models import FreelancerProfile, Milestone, Project, User
from app.schemas.schemas import (
    AIProjectRequest, FreelancerMatch, FreelancerOut, LoginIn, ProjectCreate, ProjectDraft, ProjectOut,
    ProjectSummary, RegisterIn, TokenOut, UserOut,
)
from app.services import ai_service, capacity, matching

router = APIRouter(prefix="/api")


# ---------- auth ----------
@router.post("/auth/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(name=body.name.strip(), email=email, password_hash=hash_password(body.password),
                role=body.role)
    if body.role == "FREELANCER":
        user.profile = FreelancerProfile()
    db.add(user)
    db.commit()
    return TokenOut(access_token=create_token(user.id), user=UserOut.model_validate(user))


@router.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return TokenOut(access_token=create_token(user.id), user=UserOut.model_validate(user))


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


# ---------- projects ----------
def _owned_project(db: Session, project_id: int, user: User) -> Project:
    p = db.scalar(
        select(Project).where(Project.id == project_id).options(selectinload(Project.milestones))
    )
    if not p or p.client_id != user.id:  # 404 for both: don't leak existence
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return p


@router.get("/projects", response_model=list[ProjectSummary])
def list_projects(user: User = Depends(require_role("CLIENT")), db: Session = Depends(get_db)):
    return db.scalars(
        select(Project).where(Project.client_id == user.id).order_by(Project.created_at.desc())
    ).all()


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectCreate, user: User = Depends(require_role("CLIENT")),
                   db: Session = Depends(get_db)):
    total = sum(m.amount for m in body.milestones)
    if total != body.budget:
        raise HTTPException(422, f"Milestone amounts ({total}) must equal the budget ({body.budget})")
    p = Project(
        client_id=user.id, title=body.title, description=body.description, budget=body.budget,
        currency=body.currency.upper(), deadline_days=body.deadline_days, skills=body.skills,
        original_prompt=body.original_prompt, status="OPEN",
        milestones=[
            Milestone(title=m.title, description=m.description, amount=m.amount,
                      currency=body.currency.upper(), sequence=i + 1)
            for i, m in enumerate(sorted(body.milestones, key=lambda m: m.sequence))
        ],
    )
    db.add(p)
    db.commit()
    return p


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, user: User = Depends(require_role("CLIENT")),
                db: Session = Depends(get_db)):
    return _owned_project(db, project_id, user)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: int, user: User = Depends(require_role("CLIENT")),
                   db: Session = Depends(get_db)):
    db.delete(_owned_project(db, project_id, user))
    db.commit()


# ---------- freelancers ----------
@router.get("/freelancers", response_model=list[FreelancerOut])
def list_freelancers(_: User = Depends(require_role("CLIENT")), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(FreelancerProfile).options(selectinload(FreelancerProfile.user)).order_by(FreelancerProfile.id)
    ).all()
    counts = capacity.active_counts(db)
    return [_freelancer_out(f, counts.get(f.user_id, 0)) for f in rows]


def _freelancer_out(f: FreelancerProfile, active: int = 0) -> FreelancerOut:
    return FreelancerOut(id=f.id, name=f.user.name, headline=f.headline, bio=f.bio,
                         skills=f.skills or [], hourly_rate=f.hourly_rate,
                         availability=f.availability, portfolio_url=f.portfolio_url,
                         payout_ready=bool(f.paypal_email), active_projects=active,
                         at_capacity=capacity.at_capacity(active))


@router.get("/projects/{project_id}/matches", response_model=list[FreelancerMatch])
def project_matches(project_id: int, user: User = Depends(require_role("CLIENT")),
                    db: Session = Depends(get_db)):
    project = _owned_project(db, project_id, user)
    rows = db.scalars(
        select(FreelancerProfile).options(selectinload(FreelancerProfile.user))
    ).all()
    counts = capacity.active_counts(db)
    return [
        FreelancerMatch(freelancer=_freelancer_out(r["freelancer"], counts.get(r["freelancer"].user_id, 0)),
                        score=r["score"], reasons=r["reasons"])
        for r in matching.rank_freelancers(project, list(rows), counts)[:5]
    ]


# ---------- AI ----------
@router.post("/ai/project", response_model=ProjectDraft)
def ai_project(body: AIProjectRequest, _: User = Depends(require_role("CLIENT"))):
    try:
        return ai_service.generate_project(body.prompt, body.previous_draft)
    except ai_service.AIUnavailable as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"AI is unavailable right now: {e}") from e
