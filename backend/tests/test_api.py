"""API tests. Run against the compose Postgres (needs `alembic upgrade head` applied)."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _register(role="CLIENT"):
    email = f"{uuid.uuid4().hex[:10]}@test.locim"
    r = client.post("/api/auth/register", json={"name": "T", "email": email, "password": "password123",
                                                "role": role})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _payload(total=500):
    return {"title": "Site", "budget": total, "milestones": [
        {"title": "A", "amount": total - 100, "sequence": 1}, {"title": "B", "amount": 100, "sequence": 2}]}


def test_requires_auth():
    assert client.get("/api/projects").status_code == 401


def test_login_and_duplicate_register():
    h = _register()
    me = client.get("/api/auth/me", headers=h).json()
    dup = client.post("/api/auth/register", json={"name": "T", "email": me["email"], "password": "password123"})
    assert dup.status_code == 409
    bad = client.post("/api/auth/login", json={"email": me["email"], "password": "wrong-password"})
    assert bad.status_code == 401


def test_freelancer_cannot_create_project():
    h = _register("FREELANCER")
    assert client.post("/api/projects", json=_payload(), headers=h).status_code == 403


def test_project_ownership_and_budget_check():
    a, b = _register(), _register()
    r = client.post("/api/projects", json=_payload(), headers=a)
    assert r.status_code == 201
    pid = r.json()["id"]
    assert client.get(f"/api/projects/{pid}", headers=a).status_code == 200
    assert client.get(f"/api/projects/{pid}", headers=b).status_code == 404
    bad = _payload()
    bad["milestones"][0]["amount"] = 1
    assert client.post("/api/projects", json=bad, headers=a).status_code == 422


def test_ai_endpoint_returns_draft(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "groq_api_key", "")
    h = _register()
    r = client.post("/api/ai/project", json={"prompt": "restaurant website for $500 in two weeks"}, headers=h)
    assert r.status_code == 200 and len(r.json()["milestones"]) >= 3
