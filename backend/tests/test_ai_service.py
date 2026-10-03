import json
from decimal import Decimal

import pytest

from app.services.ai_service import AIUnavailable, MockProvider, generate_project


class Flaky:
    """Returns garbage first, then valid JSON."""

    def __init__(self):
        self.calls = 0

    def complete(self, system, user):
        self.calls += 1
        if self.calls == 1:
            return "not json at all"
        return MockProvider().complete(system, user)


class Broken:
    def complete(self, system, user):
        return "{}"


def test_mock_draft_sums_to_budget():
    d = generate_project("I need a restaurant website for around $500 within two weeks.", provider=MockProvider())
    assert d.budget == Decimal("500.00")
    assert d.deadline_days == 14
    assert sum(m.amount for m in d.milestones) == d.budget
    assert [m.sequence for m in d.milestones] == list(range(1, len(d.milestones) + 1))


def test_rebalance_fixes_bad_totals():
    class Off:
        def complete(self, s, u):
            return json.dumps({"title": "x", "budget": 100, "milestones": [
                {"title": "a", "amount": 10, "sequence": 1}, {"title": "b", "amount": 10, "sequence": 2},
                {"title": "c", "amount": 10, "sequence": 3}]})

    d = generate_project("make something", provider=Off())
    assert sum(m.amount for m in d.milestones) == Decimal("100.00")


def test_retries_once_on_invalid_output():
    p = Flaky()
    d = generate_project("build me a landing page for $300", provider=p)
    assert p.calls == 2 and d.budget == Decimal("300.00")


def test_raises_after_two_invalid_outputs():
    with pytest.raises(AIUnavailable):
        generate_project("build me a landing page", provider=Broken())


def test_refine_passes_previous_draft():
    first = generate_project("restaurant site $500", provider=MockProvider())
    seen = {}

    class Spy:
        def complete(self, s, u):
            seen["u"] = u
            return MockProvider().complete(s, u)

    generate_project("make it cheaper", previous=first, provider=Spy())
    assert "Previous draft" in seen["u"] and "make it cheaper" in seen["u"]


def test_mock_refine_changes_budget_and_keeps_title():
    first = generate_project("restaurant site $500", provider=MockProvider())
    cheaper = generate_project("make it cheaper", previous=first, provider=MockProvider())
    assert cheaper.title == first.title
    assert cheaper.budget == Decimal("400.00")
    assert sum(m.amount for m in cheaper.milestones) == cheaper.budget
    exact = generate_project("make it $350 total", previous=first, provider=MockProvider())
    assert exact.budget == Decimal("350.00")
