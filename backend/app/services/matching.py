"""Explainable freelancer matching.

Deterministic on purpose: every point in a score maps to a reason shown to the client,
so the ranking can be trusted and tested. No LLM call, no PII leaves the server.
"""
import re
from decimal import Decimal

from app.models import FreelancerProfile, Project
from app.services import capacity

W_SKILLS, W_BUDGET, W_AVAIL = 70, 20, 10
HOURS_PER_DAY = 4  # assumed focused hours/day when sizing a project against an hourly rate

_NORMALIZE = re.compile(r"[^a-z0-9+#.]+")


def _norm(skill: str) -> str:
    return _NORMALIZE.sub(" ", skill.lower()).strip()


def score_freelancer(project: Project, f: FreelancerProfile, active: int = 0) -> tuple[int, list[str]]:
    reasons: list[str] = []
    wanted = {_norm(s): s for s in (project.skills or []) if _norm(s)}
    have = {_norm(s): s for s in (f.skills or []) if _norm(s)}

    # skills: exact normalized match, or one contains the other ("react" ~ "react native")
    matched = [wanted[w] for w in wanted
               if w in have or any(w in h or h in w for h in have)]
    if wanted:
        pts = round(W_SKILLS * len(matched) / len(wanted))
        if matched:
            reasons.append(f"Covers {len(matched)} of {len(wanted)} skills: {', '.join(matched)}")
        else:
            reasons.append("No overlap with the required skills")
    else:
        pts = W_SKILLS // 2  # nothing to compare: neutral
        reasons.append("Project lists no specific skills")

    # budget: can the budget buy the estimated hours at this rate?
    budget_pts = W_BUDGET // 2
    if f.hourly_rate and f.hourly_rate > 0:
        hours = Decimal(project.deadline_days * HOURS_PER_DAY)
        cost = f.hourly_rate * hours
        if cost <= project.budget:
            budget_pts = W_BUDGET
            reasons.append(f"{f.hourly_rate:.0f} {project.currency}/h fits the budget")
        else:
            ratio = float(project.budget / cost)
            budget_pts = max(0, round(W_BUDGET * ratio))
            reasons.append(f"{f.hourly_rate:.0f} {project.currency}/h may stretch the budget")
    else:
        reasons.append("Rate not listed")

    avail_pts = W_AVAIL if f.availability == "available" else 0
    if capacity.at_capacity(active):  # full plate: still shown, but ranked down and the reason is explicit
        avail_pts = 0
        reasons.append(f"At capacity ({active} active projects)")
    else:
        reasons.append("Available now" if avail_pts else f"Availability: {f.availability}")

    return min(100, pts + budget_pts + avail_pts), reasons


def rank_freelancers(project: Project, freelancers: list[FreelancerProfile],
                     active: dict[int, int] | None = None) -> list[dict]:
    out = []
    for f in freelancers:
        score, reasons = score_freelancer(project, f, (active or {}).get(getattr(f, "user_id", None), 0))
        out.append({"freelancer": f, "score": score, "reasons": reasons})
    out.sort(key=lambda r: (-r["score"], r["freelancer"].id))
    return out
