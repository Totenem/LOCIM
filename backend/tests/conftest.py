import pytest
from sqlalchemy import text

from app.db.session import SessionLocal


@pytest.fixture(autouse=True, scope="session")
def _purge_test_users():
    """Tests register throwaway @test.locim users; delete them (cascades) so they never pollute demo data."""
    yield
    with SessionLocal() as db:
        db.execute(text("DELETE FROM users WHERE email LIKE '%@test.locim'"))
        db.commit()


@pytest.fixture(autouse=True)
def _mock_ai(monkeypatch):
    """Tests must be deterministic and free: never call the real Groq even if a key is in .env."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "groq_api_key", "")
