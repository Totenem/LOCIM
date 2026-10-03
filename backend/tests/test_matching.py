from decimal import Decimal
from types import SimpleNamespace as NS

from app.services.matching import rank_freelancers, score_freelancer


def project(skills, budget="25000", days=14):
    return NS(skills=skills, budget=Decimal(budget), deadline_days=days, currency="PHP")


def freelancer(id, skills, rate="30", availability="available"):
    return NS(id=id, skills=skills, hourly_rate=Decimal(rate), availability=availability)


def test_full_skill_match_beats_none():
    p = project(["React", "Next.js"])
    good, _ = score_freelancer(p, freelancer(1, ["react", "next.js"]))
    bad, _ = score_freelancer(p, freelancer(2, ["Python"]))
    assert good > bad


def test_skill_matching_is_normalized_and_partial():
    _, reasons = score_freelancer(project(["React"]), freelancer(1, ["React Native"]))
    assert "Covers 1 of 1" in reasons[0]


def test_expensive_rate_lowers_score():
    p = project(["React"], budget="300", days=14)  # 56h => 5.35/h affordable
    cheap, _ = score_freelancer(p, freelancer(1, ["React"], rate="5"))
    pricey, _ = score_freelancer(p, freelancer(2, ["React"], rate="90"))
    assert cheap > pricey


def test_unavailable_loses_points_and_ranking_is_stable():
    p = project(["React"])
    ranked = rank_freelancers(p, [
        freelancer(2, ["React"], availability="busy"),
        freelancer(1, ["React"]),
    ])
    assert [r["freelancer"].id for r in ranked] == [1, 2]
    assert 0 <= ranked[1]["score"] <= ranked[0]["score"] <= 100


def test_freelancer_at_capacity_is_ranked_down_with_a_reason():
    p = project(["React"])
    busy, free = freelancer(1, ["React"]), freelancer(2, ["React"])
    busy.user_id, free.user_id = 10, 20
    ranked = rank_freelancers(p, [busy, free], {10: 3, 20: 1})
    assert [r["freelancer"].id for r in ranked] == [2, 1]
    assert any("At capacity" in r for r in ranked[1]["reasons"])
    assert ranked[1]["score"] < ranked[0]["score"]
