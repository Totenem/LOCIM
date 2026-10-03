from decimal import ROUND_HALF_UP, Decimal

from app.core.config import settings

CENT = Decimal("0.01")


def platform_fee(amount: Decimal) -> Decimal:
    """LOCIM's fee on top of a milestone. The client pays amount + fee; the freelancer gets the full amount."""
    return (amount * settings.platform_fee_rate).quantize(CENT, ROUND_HALF_UP)
