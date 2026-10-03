"""Escrow lifecycle against a fake PayPal. Needs the compose Postgres, like test_api."""
import itertools
import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.paypal import Capture, Order, PayPalError, get_paypal

client = TestClient(app)


class FakePayPal:
    def __init__(self):
        self.orders, self.payouts, self.refunds = {}, [], []
        self.ids = itertools.count(1)
        self.fail_next_payout = False

    def create_order(self, *, amount, currency, custom_id, description, return_url, cancel_url):
        oid = f"ORDER{next(self.ids)}XYZ"
        self.orders[oid] = (amount, currency, custom_id)
        return Order(id=oid, approve_url=f"https://paypal.test/approve/{oid}")

    def capture_order(self, order_id):
        amount, currency, custom_id = self.orders[order_id]
        return Capture(capture_id=f"CAP-{order_id}", status="COMPLETED", amount=amount,
                       currency=currency, custom_id=custom_id)

    def payout(self, *, email, amount, currency, item_id):
        if self.fail_next_payout:
            self.fail_next_payout = False
            raise PayPalError("LOCIM's PayPal balance is too low for this payout.")
        self.payouts.append((email, amount, item_id))
        return f"BATCH-{item_id}"

    def refund(self, *, capture_id, amount, currency, item_id):
        self.refunds.append((capture_id, amount))
        return f"REF-{item_id}"


@pytest.fixture()
def pp():
    fake = FakePayPal()
    app.dependency_overrides[get_paypal] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_paypal, None)


def _register(role, name="T"):
    email = f"{uuid.uuid4().hex[:10]}@test.locim"
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": "password123", "role": role})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _freelancer(paypal=True):
    name = f"F{uuid.uuid4().hex[:8]}"
    h = _register("FREELANCER", name)
    if paypal:
        r = client.put("/api/freelancers/me", json={"paypal_email": "fl@example.com", "skills": ["React"]}, headers=h)
        assert r.status_code == 200, r.text
    fid = next(f["id"] for f in client.get("/api/freelancers", headers=_register("CLIENT")).json() if f["name"] == name)
    return h, fid


def _project(h):
    r = client.post("/api/projects", headers=h, json={"title": "Site", "budget": 300, "skills": ["React"], "milestones": [
        {"title": "A", "amount": 200, "sequence": 1}, {"title": "B", "amount": 100, "sequence": 2}]})
    assert r.status_code == 201, r.text
    return r.json()


def _fund(h, mid):
    o = client.post(f"/api/milestones/{mid}/fund", headers=h)
    assert o.status_code == 200, o.text
    return client.post(f"/api/milestones/{mid}/capture", json={"order_id": o.json()["order_id"]}, headers=h)


def _setup():
    c = _register("CLIENT")
    p = _project(c)
    f, fid = _freelancer()
    r = client.post(f"/api/projects/{p['id']}/hire", json={"freelancer_id": fid}, headers=c)
    assert r.status_code == 200, r.text
    return c, f, r.json()


def test_hire_moves_no_money_and_needs_paypal(pp):
    c = _register("CLIENT")
    p = _project(c)
    _, no_pp = _freelancer(paypal=False)
    assert client.post(f"/api/projects/{p['id']}/hire", json={"freelancer_id": no_pp}, headers=c).status_code == 409
    _, fid = _freelancer()
    r = client.post(f"/api/projects/{p['id']}/hire", json={"freelancer_id": fid}, headers=c)
    assert r.json()["status"] == "ASSIGNED" and not pp.orders
    assert client.post(f"/api/projects/{p['id']}/hire", json={"freelancer_id": fid}, headers=c).status_code == 409


def test_cannot_fund_without_hire_or_out_of_order(pp):
    c = _register("CLIENT")
    p = _project(c)
    assert client.post(f"/api/milestones/{p['milestones'][0]['id']}/fund", headers=c).status_code == 409
    c, _, p = _setup()
    second = p["milestones"][1]["id"]
    assert client.post(f"/api/milestones/{second}/fund", headers=c).status_code == 409


def test_full_happy_path_pays_freelancer_once(pp):
    c, f, p = _setup()
    m1, m2 = [m["id"] for m in p["milestones"]]
    r = _fund(c, m1)
    assert r.status_code == 200 and r.json()["milestones"][0]["status"] == "FUNDED"
    assert client.post(f"/api/milestones/{m1}/capture", json={"order_id": "ORDER1XYZ"}, headers=c).status_code in (200, 404, 409)
    # freelancer submits, client releases
    assert client.post(f"/api/milestones/{m1}/submit", json={"note": "done"}, headers=f).status_code == 200
    rel = client.post(f"/api/milestones/{m1}/release", headers=c)
    assert rel.status_code == 200 and rel.json()["milestones"][0]["status"] == "RELEASED"
    assert client.post(f"/api/milestones/{m1}/release", headers=c).status_code == 409  # no double pay
    assert len(pp.payouts) == 1 and pp.payouts[0][1] == Decimal("200.00")
    # second milestone completes the project
    _fund(c, m2)
    client.post(f"/api/milestones/{m2}/submit", json={"note": "done"}, headers=f)
    done = client.post(f"/api/milestones/{m2}/release", headers=c).json()
    assert done["status"] == "COMPLETED"
    kinds = [p_["kind"] for p_ in client.get("/api/payments", headers=c).json()]
    assert kinds.count("FUND") == 2 and kinds.count("RELEASE") == 2
    assert [p_["kind"] for p_ in client.get("/api/payments", headers=f).json()] == ["RELEASE", "RELEASE"]


def test_runaway_freelancer_client_gets_refund_and_project_reopens(pp):
    c, f, p = _setup()
    m1 = p["milestones"][0]["id"]
    _fund(c, m1)
    r = client.post(f"/api/milestones/{m1}/refund", headers=c)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "OPEN" and body["freelancer_id"] is None and body["milestones"][0]["status"] == "PENDING"
    assert len(pp.refunds) == 1
    assert not pp.payouts


def test_client_cannot_refund_after_submission_only_dispute(pp):
    c, f, p = _setup()
    m1 = p["milestones"][0]["id"]
    _fund(c, m1)
    client.post(f"/api/milestones/{m1}/submit", json={"note": "work"}, headers=f)
    assert client.post(f"/api/milestones/{m1}/refund", headers=c).status_code == 409
    d = client.post(f"/api/milestones/{m1}/dispute", json={"reason": "Not what we agreed"}, headers=c)
    assert d.status_code == 200 and d.json()["milestones"][0]["status"] == "DISPUTED"
    assert client.post(f"/api/milestones/{m1}/release", headers=c).status_code == 409  # frozen


def test_payout_failure_leaves_milestone_funded(pp):
    c, f, p = _setup()
    m1 = p["milestones"][0]["id"]
    _fund(c, m1)
    pp.fail_next_payout = True
    r = client.post(f"/api/milestones/{m1}/release", headers=c)
    assert r.status_code == 502 and "balance" in r.json()["detail"]
    assert client.get(f"/api/projects/{p['id']}", headers=c).json()["milestones"][0]["status"] == "FUNDED"
    assert client.post(f"/api/milestones/{m1}/release", headers=c).status_code == 200  # retry works


def test_permissions_and_capture_guards(pp):
    c, f, p = _setup()
    m1 = p["milestones"][0]["id"]
    stranger = _register("CLIENT")
    assert client.post(f"/api/milestones/{m1}/fund", headers=stranger).status_code == 404
    assert client.post(f"/api/milestones/{m1}/submit", json={"note": "x"}, headers=f).status_code == 409  # unfunded
    assert client.post(f"/api/milestones/{m1}/release", headers=f).status_code == 403  # freelancer can't release
    # an order created for another milestone can't be captured against this one
    o = client.post(f"/api/milestones/{m1}/fund", headers=c).json()
    p2 = _project(c)
    assert client.post(f"/api/milestones/{p2['milestones'][0]['id']}/capture",
                       json={"order_id": o["order_id"]}, headers=c).status_code == 404
    # freelancer without a milestone assignment can't submit
    other, _ = _freelancer()
    assert client.post(f"/api/milestones/{m1}/submit", json={"note": "x"}, headers=other).status_code == 404


def test_freelancers_cannot_browse_the_directory(pp):
    assert client.get("/api/freelancers", headers=_register("FREELANCER")).status_code == 403


def test_client_pays_milestone_plus_10_percent_and_freelancer_gets_full_amount(pp):
    c, f, p = _setup()
    m1 = p["milestones"][0]
    assert p["currency"] == "PHP" and m1["amount"] == "200.00" and m1["fee"] == "20.00" and m1["total"] == "220.00"
    _fund(c, m1["id"])
    assert next(iter(pp.orders.values()))[0] == Decimal("220.00")  # PayPal charged amount + fee
    fund = next(x for x in client.get("/api/payments", headers=c).json() if x["kind"] == "FUND")
    assert fund["amount"] == "220.00" and fund["fee"] == "20.00"
    client.post(f"/api/milestones/{m1['id']}/submit", json={"note": "done"}, headers=f)
    client.post(f"/api/milestones/{m1['id']}/release", headers=c)
    assert pp.payouts[0][1] == Decimal("200.00")  # freelancer isn't charged the fee


def test_refund_returns_fee_too(pp):
    c, f, p = _setup()
    m1 = p["milestones"][0]["id"]
    _fund(c, m1)
    client.post(f"/api/milestones/{m1}/refund", headers=c)
    assert pp.refunds[0][1] == Decimal("220.00")


def test_dashboard_tracks_progress_escrow_and_next_action(pp):
    c, f, p = _setup()
    m1 = p["milestones"][0]["id"]

    def dash():
        d = client.get("/api/dashboard", headers=c).json()
        return d["totals"], next(x for x in d["projects"] if x["id"] == p["id"])

    t, row = dash()
    assert row["next_action"] == "Fund milestone 1" and row["needs_attention"] and Decimal(row["escrow_held"]) == 0
    _fund(c, m1)
    t, row = dash()
    assert row["escrow_held"] == "220.00" and not row["needs_attention"] and t["fees_paid"] == "20.00"
    client.post(f"/api/milestones/{m1}/submit", json={"note": "done"}, headers=f)
    t, row = dash()
    assert row["next_action"].startswith("Review milestone 1") and row["needs_attention"]
    client.post(f"/api/milestones/{m1}/release", headers=c)
    t, row = dash()
    assert row["paid_out"] == "200.00" and row["milestones_released"] == 1 and Decimal(row["escrow_held"]) == 0
    assert client.get("/api/dashboard", headers=f).status_code == 403


# ---- disputes, AI review, scope ----
def _login_admin():
    r = client.post("/api/auth/login", json={"email": "admin@demo.locim", "password": "demo12345"})
    assert r.status_code == 200, "run `python -m app.seed` first"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _disputed(pp):
    c, f, p = _setup()
    m1 = p["milestones"][0]["id"]
    _fund(c, m1)
    client.post(f"/api/milestones/{m1}/submit", json={"note": "Finished the work, see my link"}, headers=f)
    d = client.post(f"/api/milestones/{m1}/dispute", json={"reason": "The design is missing the menu page"}, headers=c)
    assert d.status_code == 200
    return c, f, p, m1


def test_dispute_needs_a_reason_and_freelancer_can_respond(pp):
    c, f, p = _setup()
    m1 = p["milestones"][0]["id"]
    _fund(c, m1)
    client.post(f"/api/milestones/{m1}/submit", json={"note": "Finished the work, see my link"}, headers=f)
    assert client.post(f"/api/milestones/{m1}/dispute", json={"reason": "x"}, headers=c).status_code == 422
    client.post(f"/api/milestones/{m1}/dispute", json={"reason": "The design is missing the menu page"}, headers=c)
    r = client.post(f"/api/milestones/{m1}/dispute/respond", json={"message": "The menu page is in the Figma link"}, headers=f)
    ms = r.json()["milestones"][0]
    assert ms["dispute_reason"].startswith("The design") and ms["dispute_response"].startswith("The menu")
    assert client.post(f"/api/milestones/{m1}/dispute/respond", json={"message": "hello"}, headers=c).status_code == 403


def test_only_admin_sees_and_resolves_disputes(pp):
    c, f, p, m1 = _disputed(pp)
    assert client.get("/api/admin/disputes", headers=c).status_code == 403
    assert client.get("/api/admin/disputes", headers=f).status_code == 403
    body = {"decision": "RELEASE", "note": "Work meets the brief"}
    assert client.post(f"/api/admin/milestones/{m1}/resolve", json=body, headers=c).status_code == 403
    admin = _login_admin()
    assert m1 in [d["milestone_id"] for d in client.get("/api/admin/disputes", headers=admin).json()]


def test_admin_can_pay_freelancer_after_dispute(pp):
    c, f, p, m1 = _disputed(pp)
    r = client.post(f"/api/admin/milestones/{m1}/resolve", json={"decision": "RELEASE", "note": "Work meets the brief"},
                    headers=_login_admin())
    assert r.status_code == 200 and r.json()["milestones"][0]["status"] == "RELEASED"
    assert r.json()["milestones"][0]["resolution_note"] == "Work meets the brief"
    assert pp.payouts[0][1] == Decimal("200.00") and not pp.refunds


def test_admin_can_refund_client_after_dispute(pp):
    c, f, p, m1 = _disputed(pp)
    r = client.post(f"/api/admin/milestones/{m1}/resolve", json={"decision": "REFUND", "note": "Menu page missing"},
                    headers=_login_admin())
    body = r.json()
    assert r.status_code == 200 and body["status"] == "OPEN" and body["freelancer_id"] is None
    assert pp.refunds[0][1] == Decimal("220.00") and not pp.payouts
    assert client.post(f"/api/admin/milestones/{m1}/resolve", json={"decision": "RELEASE", "note": "again please"},
                       headers=_login_admin()).status_code == 404  # already resolved


def test_submission_gets_an_advisory_ai_review(pp):
    c, f, p = _setup()
    m1 = p["milestones"][0]["id"]
    _fund(c, m1)
    r = client.post(f"/api/milestones/{m1}/submit", json={"note": "Delivered Design & Planning for the restaurant, all done and approved by me"}, headers=f)
    review = r.json()["milestones"][0]["ai_review"]
    assert review and review["verdict"] in {"MEETS", "PARTIAL", "UNCLEAR"} and "summary" in review
    # a vague note is flagged, and the review never blocks payment
    c2, f2, p2 = _setup()
    m = p2["milestones"][0]["id"]
    _fund(c2, m)
    vague = client.post(f"/api/milestones/{m}/submit", json={"note": "done"}, headers=f2).json()["milestones"][0]
    assert vague["ai_review"]["verdict"] == "UNCLEAR"
    assert client.post(f"/api/milestones/{m}/release", headers=c2).status_code == 200


def test_scope_check_and_adding_a_milestone(pp):
    c = _register("CLIENT")
    p = client.post("/api/projects", headers=c, json={"title": "Site", "budget": 300, "milestones": [
        {"title": "Design mockups", "description": "Figma mockups for the homepage", "amount": 200, "sequence": 1},
        {"title": "Build", "description": "Implement the pages", "amount": 100, "sequence": 2}]}).json()
    f, _ = _freelancer()
    covered = client.post(f"/api/projects/{p['id']}/scope-check", json={"request": "Can you also send the Figma mockups as a PDF?"}, headers=c)
    assert covered.status_code == 200 and covered.json()["verdict"] == "IN_SCOPE"
    extra = client.post(f"/api/projects/{p['id']}/scope-check", json={"request": "Please also build a mobile app with push notifications"}, headers=c).json()
    assert extra["verdict"] == "OUT_OF_SCOPE" and Decimal(extra["suggested_milestone"]["amount"]) > 0
    s = extra["suggested_milestone"]
    added = client.post(f"/api/projects/{p['id']}/milestones", json=s, headers=c)
    assert added.status_code == 201
    body = added.json()
    assert len(body["milestones"]) == 3 and body["milestones"][-1]["sequence"] == 3
    assert Decimal(body["budget"]) == Decimal("300") + Decimal(str(s["amount"]))
    assert client.post(f"/api/projects/{p['id']}/scope-check", json={"request": "anything goes here"}, headers=f).status_code == 403


def test_admin_overview_counts_money_correctly(pp):
    admin = _login_admin()
    before = client.get("/api/admin/overview", headers=admin).json()
    c, f, p = _setup()
    m1 = p["milestones"][0]["id"]
    _fund(c, m1)
    mid = client.get("/api/admin/overview", headers=admin).json()
    assert Decimal(mid["escrow_held"]) - Decimal(before["escrow_held"]) == Decimal("220.00")
    assert Decimal(mid["fees_earned"]) - Decimal(before["fees_earned"]) == Decimal("20.00")
    client.post(f"/api/milestones/{m1}/submit", json={"note": "done and delivered the work"}, headers=f)
    client.post(f"/api/milestones/{m1}/release", headers=c)
    after = client.get("/api/admin/overview", headers=admin).json()
    assert Decimal(after["paid_out"]) - Decimal(before["paid_out"]) == Decimal("200.00")
    assert Decimal(after["escrow_held"]) == Decimal(before["escrow_held"])
    assert Decimal(after["volume"]) - Decimal(before["volume"]) == Decimal("220.00")
    assert after["recent_activity"][0]["kind"] == "RELEASE"
    # a refunded funding returns its fee too: revenue only counts fees that stuck
    c2, f2, p2 = _setup()
    m2 = p2["milestones"][0]["id"]
    _fund(c2, m2)
    client.post(f"/api/milestones/{m2}/refund", headers=c2)
    end = client.get("/api/admin/overview", headers=admin).json()
    assert Decimal(end["fees_earned"]) == Decimal(after["fees_earned"])
    assert Decimal(end["refunded"]) - Decimal(after["refunded"]) == Decimal("220.00")


def test_admin_lists_and_permissions(pp):
    admin = _login_admin()
    c, f, p = _setup()
    assert any(x["id"] == p["id"] for x in client.get("/api/admin/projects", headers=admin).json())
    users = client.get("/api/admin/users", headers=admin).json()
    assert {"CLIENT", "FREELANCER", "ADMIN"} <= {u["role"] for u in users}
    assert "password_hash" not in str(users) and all("password" not in k for u in users for k in u)
    assert isinstance(client.get("/api/admin/payments", headers=admin).json(), list)
    for path in ("overview", "payments", "users", "projects"):
        assert client.get(f"/api/admin/{path}", headers=c).status_code == 403
        assert client.get(f"/api/admin/{path}", headers=f).status_code == 403


# ---- capacity: a freelancer runs at most 3 active projects ----
def _hire(c, fid):
    p = _project(c)
    return p, client.post(f"/api/projects/{p['id']}/hire", json={"freelancer_id": fid}, headers=c)


def _finish(c, f, p):
    for m in p["milestones"]:
        _fund(c, m["id"])
        client.post(f"/api/milestones/{m['id']}/submit", json={"note": "delivered everything as agreed"}, headers=f)
        assert client.post(f"/api/milestones/{m['id']}/release", headers=c).status_code == 200


def test_freelancer_is_capped_at_three_active_projects(pp):
    c = _register("CLIENT")
    f, fid = _freelancer()
    projects = []
    for _ in range(3):
        p, r = _hire(c, fid)
        assert r.status_code == 200, r.text
        projects.append(p)
    me = client.get("/api/freelancers/me", headers=f).json()
    assert me["active_projects"] == 3 and me["max_active_projects"] == 3
    _, fourth = _hire(c, fid)
    assert fourth.status_code == 409 and "3 active projects" in fourth.json()["detail"]
    listed = next(x for x in client.get("/api/freelancers", headers=c).json() if x["id"] == fid)
    assert listed["at_capacity"] and listed["active_projects"] == 3


def test_finishing_a_project_frees_a_slot(pp):
    c = _register("CLIENT")
    f, fid = _freelancer()
    projects = [_hire(c, fid)[0] for _ in range(3)]
    full = client.get(f"/api/projects/{projects[0]['id']}", headers=c).json()
    _finish(c, f, full)  # every milestone paid -> COMPLETED
    assert client.get(f"/api/projects/{projects[0]['id']}", headers=c).json()["status"] == "COMPLETED"
    assert client.get("/api/freelancers/me", headers=f).json()["active_projects"] == 2
    _, again = _hire(c, fid)
    assert again.status_code == 200


def test_refund_also_frees_a_slot(pp):
    c = _register("CLIENT")
    f, fid = _freelancer()
    p = _hire(c, fid)[0]
    _fund(c, p["milestones"][0]["id"])
    client.post(f"/api/milestones/{p['milestones'][0]['id']}/refund", headers=c)
    assert client.get("/api/freelancers/me", headers=f).json()["active_projects"] == 0
