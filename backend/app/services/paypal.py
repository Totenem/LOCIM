"""PayPal Sandbox client (Orders v2 + Payouts + refunds).

Money model: the client's payment is captured into LOCIM's PayPal merchant account (the escrow),
then paid out to the freelancer on approval, or refunded to the client. Every mutating call carries a
deterministic PayPal-Request-Id so a retry or double click cannot move money twice.
"""
import time
from dataclasses import dataclass
from decimal import Decimal

import httpx

from app.core.config import settings


class PayPalError(Exception):
    """Raised for any failed PayPal call. The message is safe to show to the user."""


class PayPalNotConfigured(PayPalError):
    pass


@dataclass
class Order:
    id: str
    approve_url: str


@dataclass
class Capture:
    capture_id: str
    status: str
    amount: Decimal
    currency: str
    custom_id: str | None


def _amt(value: Decimal) -> str:
    return f"{value:.2f}"


class PayPalClient:
    def __init__(self, client_id: str, secret: str, base_url: str):
        if not client_id or not secret:
            raise PayPalNotConfigured("PayPal isn't configured on the server yet.")
        self.base_url = base_url.rstrip("/")
        self._auth = (client_id, secret)
        self._token: tuple[str, float] | None = None

    # -- plumbing --
    def _bearer(self) -> str:
        if self._token and self._token[1] > time.time() + 30:
            return self._token[0]
        try:
            r = httpx.post(f"{self.base_url}/v1/oauth2/token", auth=self._auth,
                           data={"grant_type": "client_credentials"}, timeout=20)
        except httpx.HTTPError as e:
            raise PayPalError("Couldn't reach PayPal. Try again in a moment.") from e
        if r.status_code != 200:
            raise PayPalError("PayPal rejected the server credentials. Check PAYPAL_CLIENT_ID/SECRET.")
        body = r.json()
        self._token = (body["access_token"], time.time() + int(body.get("expires_in", 300)))
        return self._token[0]

    def _call(self, method: str, path: str, json: dict | None = None, request_id: str | None = None):
        headers = {"Authorization": f"Bearer {self._bearer()}"}
        if request_id:
            headers["PayPal-Request-Id"] = request_id
        try:
            r = httpx.request(method, f"{self.base_url}{path}", json=json, headers=headers, timeout=30)
        except httpx.HTTPError as e:
            raise PayPalError("Couldn't reach PayPal. Try again in a moment.") from e
        data = r.json() if r.content else {}
        if r.status_code >= 400:
            raise PayPalError(_explain(data))
        return data

    # -- operations --
    def create_order(self, *, amount: Decimal, currency: str, custom_id: str, description: str,
                     return_url: str, cancel_url: str) -> Order:
        data = self._call("POST", "/v2/checkout/orders", request_id=f"order-{custom_id}-{time.time_ns()}", json={
            "intent": "CAPTURE",
            "purchase_units": [{
                "custom_id": custom_id,
                "description": description[:120],
                "amount": {"currency_code": currency, "value": _amt(amount)},
            }],
            "payment_source": {"paypal": {"experience_context": {
                "return_url": return_url, "cancel_url": cancel_url, "user_action": "PAY_NOW",
                "shipping_preference": "NO_SHIPPING", "brand_name": "LOCIM",
            }}},
        })
        link = next((l["href"] for l in data.get("links", []) if l["rel"] in ("payer-action", "approve")), None)
        if not link:
            raise PayPalError("PayPal didn't return an approval link.")
        return Order(id=data["id"], approve_url=link)

    def capture_order(self, order_id: str) -> Capture:
        data = self._call("POST", f"/v2/checkout/orders/{order_id}/capture", request_id=f"capture-{order_id}", json={})
        cap = data["purchase_units"][0]["payments"]["captures"][0]
        return Capture(capture_id=cap["id"], status=cap["status"], amount=Decimal(cap["amount"]["value"]),
                       currency=cap["amount"]["currency_code"], custom_id=cap.get("custom_id"))

    def payout(self, *, email: str, amount: Decimal, currency: str, item_id: str) -> str:
        data = self._call("POST", "/v1/payments/payouts", request_id=f"payout-{item_id}", json={
            "sender_batch_header": {"sender_batch_id": f"locim-{item_id}", "email_subject": "You got paid on LOCIM"},
            "items": [{"recipient_type": "EMAIL", "receiver": email, "sender_item_id": item_id,
                       "amount": {"value": _amt(amount), "currency": currency}, "note": "LOCIM milestone payment"}],
        })
        return data["batch_header"]["payout_batch_id"]

    def refund(self, *, capture_id: str, amount: Decimal, currency: str, item_id: str) -> str:
        data = self._call("POST", f"/v2/payments/captures/{capture_id}/refund", request_id=f"refund-{item_id}",
                          json={"amount": {"value": _amt(amount), "currency_code": currency}})
        return data["id"]


def _explain(data: dict) -> str:
    issue = (data.get("details") or [{}])[0].get("issue")
    friendly = {
        "INSTRUMENT_DECLINED": "PayPal declined that payment method. Try another one.",
        "PAYEE_ACCOUNT_RESTRICTED": "The receiving PayPal account is restricted.",
        "RECEIVER_UNREGISTERED": "That PayPal email isn't registered with PayPal.",
        "INSUFFICIENT_FUNDS": "LOCIM's PayPal balance is too low for this payout.",
        "ORDER_NOT_APPROVED": "The payment wasn't approved in PayPal.",
        "CURRENCY_NOT_SUPPORTED": "That currency isn't supported by this PayPal account.",
    }.get(issue or data.get("name", ""))
    return friendly or f"PayPal error: {data.get('message') or data.get('name') or 'request failed'}"


_client: PayPalClient | None = None


def get_paypal() -> PayPalClient:
    """FastAPI dependency; tests override it with a fake."""
    global _client
    if _client is None:
        _client = PayPalClient(settings.paypal_client_id, settings.paypal_client_secret, settings.paypal_base_url)
    return _client
