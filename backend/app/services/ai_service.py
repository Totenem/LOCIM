"""AI Project Architect: natural language -> validated ProjectDraft.

Providers return raw JSON text; this module validates with Pydantic, retries once on
invalid output, and rebalances milestone amounts so they always sum to the budget.
"""

import json
import logging
import re
from decimal import ROUND_HALF_UP, Decimal
from typing import Protocol

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.schemas import DraftMilestone, ProjectDraft, ScopeCheck, SubmissionReview

log = logging.getLogger("locim.ai")

GROQ_BASE = "https://api.groq.com/openai/v1"
DEFAULT_BUDGET = {"PHP": 25000}  # mock AI fallback when the prompt names no amount

SYSTEM_PROMPT = """You are LOCIM's Project Architect. Turn a client's plain-language request into a \
structured freelance project. Respond with ONE JSON object only, no prose, with exactly these keys:
{
  "title": string,
  "description": string (2-4 sentences),
  "skills": [string] (3-8 required skills),
  "budget": number (total, in the stated currency; if none given, propose a realistic one),
  "currency": string (3-letter code; amounts with no currency symbol are in the default currency, "PHP"),
  "deadline_days": integer (default 14 if unspecified),
  "milestones": [{"title": string, "description": string (concrete, checkable requirements), \
"amount": number, "sequence": integer starting at 1}]
}
Use 3-6 milestones. Milestone amounts MUST sum to the budget. If a previous draft is provided, \
apply the client's requested change to it and return the full updated project."""


class AIUnavailable(Exception):
    """The AI provider failed or returned unusable output."""


class Provider(Protocol):
    def complete(self, system: str, user: str) -> str: ...


class GroqProvider:
    def __init__(self, api_key: str, model: str):
        self.api_key, self.model = api_key, model

    def complete(self, system: str, user: str) -> str:
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "response_format": {"type": "json_object"},
            "temperature": 0.3,
        }
        try:
            r = httpx.post(
                f"{GROQ_BASE}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=body,
                timeout=45,
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
        except httpx.HTTPStatusError as e:
            log.error("Groq HTTP %s: %s", e.response.status_code, e.response.text[:300])
            raise AIUnavailable(f"AI provider returned {e.response.status_code}") from e
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
            log.error("Groq call failed: %s", e)
            raise AIUnavailable("AI provider unreachable") from e


class MockProvider:
    """Deterministic provider used without an API key and in tests."""

    def _refine(self, user: str) -> str:
        head, change = user.split("Requested change:", 1)
        prev = json.loads(head.split("Previous draft:", 1)[1].strip())
        m = re.search(r"\$?\s?(\d[\d,]*)", change)
        if m and int(m.group(1).replace(",", "")) >= 50:
            prev["budget"] = int(m.group(1).replace(",", ""))
        elif re.search(r"cheap|lower|less|reduce", change, re.I):
            prev["budget"] = round(float(prev["budget"]) * 0.8, 2)
        elif re.search(r"more|higher|increase|bigger", change, re.I):
            prev["budget"] = round(float(prev["budget"]) * 1.25, 2)
        return json.dumps(prev)  # amounts are rebalanced to the new budget downstream

    def complete(self, system: str, user: str) -> str:
        if system.startswith("You are LOCIM's Submission Reviewer"):
            return _mock_review(user)
        if system.startswith("You are LOCIM's Scope Guard"):
            return _mock_scope(user)
        if "Previous draft:" in user and "Requested change:" in user:
            return self._refine(user)
        m = re.search(r"\$?\s?(\d[\d,]*)\s*(?:usd|dollars|\$)?", user.split("Previous draft")[0])
        budget = int(m.group(1).replace(",", "")) if m and int(m.group(1).replace(",", "")) >= 50 else DEFAULT_BUDGET.get(settings.default_currency, 500)
        days = 14
        d = re.search(r"(\d+)\s*(day|week)", user, re.I)
        if d:
            days = int(d.group(1)) * (7 if d.group(2).lower() == "week" else 1)
        if "two weeks" in user.lower():
            days = 14
        first = user.strip().split("\n")[0][:60].rstrip(".")
        splits = [("Design & Planning", 0.25), ("Core Build", 0.4), ("Integration & Content", 0.2),
                  ("Testing & Deployment", 0.15)]
        ms = [
            {"title": t, "description": f"{t} for: {first}", "amount": round(budget * p, 2), "sequence": i + 1}
            for i, (t, p) in enumerate(splits)
        ]
        return json.dumps({
            "title": first[:1].upper() + first[1:] or "New Project",
            "description": f"A freelance project based on the client's request: {first}.",
            "skills": ["Web Development", "UI/UX Design", "React", "Testing"],
            "budget": budget, "currency": settings.default_currency, "deadline_days": days, "milestones": ms,
        })


def get_provider() -> Provider:
    if settings.groq_api_key:
        return GroqProvider(settings.groq_api_key, settings.groq_model)
    log.warning("GROQ_API_KEY not set; using deterministic mock AI")
    return MockProvider()


def rebalance(draft: ProjectDraft) -> ProjectDraft:
    """Force milestone amounts to sum exactly to the budget (last milestone absorbs rounding)."""
    cent = Decimal("0.01")
    total = sum((m.amount for m in draft.milestones), Decimal(0))
    ms = sorted(draft.milestones, key=lambda m: m.sequence)
    if total <= 0:
        share = (draft.budget / len(ms)).quantize(cent, ROUND_HALF_UP)
        amounts = [share] * len(ms)
    else:
        amounts = [(m.amount * draft.budget / total).quantize(cent, ROUND_HALF_UP) for m in ms]
    amounts[-1] += draft.budget - sum(amounts)
    fixed = [
        DraftMilestone(title=m.title, description=m.description, amount=a, sequence=i + 1)
        for i, (m, a) in enumerate(zip(ms, amounts))
    ]
    return draft.model_copy(update={"milestones": fixed, "budget": draft.budget.quantize(cent)})


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    return json.loads(text)


def generate_project(prompt: str, previous: ProjectDraft | None = None,
                     provider: Provider | None = None) -> ProjectDraft:
    provider = provider or get_provider()
    user = prompt if previous is None else (
        f"Previous draft:\n{previous.model_dump_json()}\n\nRequested change: {prompt}"
    )
    last_err: Exception | None = None
    for attempt in range(2):
        hint = "" if attempt == 0 else f"\n\nYour previous reply was invalid ({last_err}). Return valid JSON only."
        raw = provider.complete(SYSTEM_PROMPT, user + hint)
        try:
            return rebalance(ProjectDraft.model_validate(_extract_json(raw)))
        except (json.JSONDecodeError, ValidationError) as e:
            last_err = e
            log.warning("AI output invalid (attempt %d): %s", attempt + 1, str(e)[:200])
    raise AIUnavailable("AI returned an invalid project structure")


def check_model_available() -> None:
    """Startup sanity check so a retired Groq model never fails silently."""
    if not settings.groq_api_key:
        return
    try:
        r = httpx.get(f"{GROQ_BASE}/models", headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                      timeout=10)
        r.raise_for_status()
        ids = {m["id"] for m in r.json().get("data", [])}
        if settings.groq_model not in ids:
            log.warning("GROQ_MODEL %r not in Groq's model list; AI calls will fail. Available: %s",
                        settings.groq_model, sorted(ids))
    except Exception as e:  # noqa: BLE001 - informational only
        log.warning("Could not verify Groq model list: %s", e)


# ---------------- submission review + scope check ----------------
REVIEW_PROMPT = """You are LOCIM's Submission Reviewer. A freelancer submitted work for a milestone. Compare their \
submission note against the milestone's requirements. You only advise; the client decides. Respond with ONE JSON \
object only: {"verdict": "MEETS" | "PARTIAL" | "UNCLEAR", "summary": string (1-2 sentences), \
"checks": [{"requirement": string, "met": boolean, "comment": string}]}. Break the requirements into 2-6 checkable \
items. Use UNCLEAR when the note gives too little evidence. Never invent evidence that isn't in the note."""

SCOPE_PROMPT = """You are LOCIM's Scope Guard. Decide whether a change request is already covered by the project's \
existing milestones. Respond with ONE JSON object only: {"verdict": "IN_SCOPE" | "OUT_OF_SCOPE" | "UNCLEAR", \
"explanation": string (1-3 sentences), "matched_milestone": integer sequence number or null, \
"suggested_milestone": null or {"title": string, "description": string, "amount": number}}. \
For OUT_OF_SCOPE, suggest one new milestone with a fair amount in the project's currency (typically 5-25% of the \
budget). For IN_SCOPE, set matched_milestone and leave suggested_milestone null."""

_STOP = {"with", "that", "this", "from", "have", "will", "should", "would", "could", "your", "their", "into",
         "also", "need", "want", "please", "make", "page", "pages", "site", "website", "add", "the", "and", "for",
         "build", "create", "send", "implement", "deliver", "like", "just", "some"}


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]{4,}", text.lower()) if w not in _STOP}


def _mock_review(user: str) -> str:
    data = json.loads(user)
    reqs = [r.strip(" .") for r in re.split(r"[.;,\n]|\band\b", data["requirements"]) if len(r.strip()) > 6][:6]
    note_words = _words(data["note"])
    if len(data["note"].strip()) < 15 or not reqs:
        return json.dumps({"verdict": "UNCLEAR", "summary": "The note is too short to judge the work.",
                           "checks": [{"requirement": r, "met": False, "comment": "No evidence in the note."} for r in reqs]})
    checks = [{"requirement": r, "met": bool(_words(r) & note_words),
               "comment": "Mentioned in the note." if _words(r) & note_words else "Not mentioned in the note."} for r in reqs]
    met = sum(c["met"] for c in checks)
    verdict = "MEETS" if met == len(checks) else "PARTIAL" if met else "UNCLEAR"
    return json.dumps({"verdict": verdict, "summary": f"{met} of {len(checks)} requirements are addressed in the note.",
                       "checks": checks})


def _mock_scope(user: str) -> str:
    data = json.loads(user)
    req = _words(data["request"])
    best, best_n = None, 0
    for m in data["milestones"]:
        n = len(req & _words(m["title"] + " " + m["description"]))
        if n > best_n:
            best, best_n = m, n
    if best:
        return json.dumps({"verdict": "IN_SCOPE", "matched_milestone": best["sequence"], "suggested_milestone": None,
                           "explanation": f"This looks covered by milestone {best['sequence']}: {best['title']}."})
    title = " ".join(data["request"].split()[:6]).strip(" .,")
    return json.dumps({
        "verdict": "OUT_OF_SCOPE", "matched_milestone": None,
        "explanation": "Nothing in the current milestones covers this, so it counts as new work.",
        "suggested_milestone": {"title": title[:1].upper() + title[1:], "description": data["request"],
                                "amount": round(float(data["budget"]) * 0.15, 2)},
    })



def _ask(model, system: str, user: str, provider: Provider | None):
    """Call the provider, validate against a Pydantic model, retry once on invalid output."""
    provider = provider or get_provider()
    last: Exception | None = None
    for attempt in range(2):
        hint = "" if attempt == 0 else f"\n\nYour previous reply was invalid ({last}). Return valid JSON only."
        raw = provider.complete(system, user + hint)
        try:
            return model.model_validate(_extract_json(raw))
        except (json.JSONDecodeError, ValidationError) as e:
            last = e
            log.warning("AI output invalid (attempt %d): %s", attempt + 1, str(e)[:200])
    raise AIUnavailable("AI returned an invalid response")


def review_submission(milestone_title: str, requirements: str, note: str,
                      provider: Provider | None = None) -> SubmissionReview:
    payload = json.dumps({"milestone": milestone_title, "requirements": requirements, "note": note})
    return _ask(SubmissionReview, REVIEW_PROMPT, payload, provider)


def check_scope(request: str, project, provider: Provider | None = None) -> ScopeCheck:
    payload = json.dumps({
        "request": request, "budget": str(project.budget), "currency": project.currency,
        "milestones": [{"sequence": m.sequence, "title": m.title, "description": m.description}
                       for m in project.milestones],
    })
    return _ask(ScopeCheck, SCOPE_PROMPT, payload, provider)
