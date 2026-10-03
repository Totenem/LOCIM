export const money = (v: number | string, currency = "PHP") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(v) || 0);

export const cents = (v: number | string) => Math.round((Number(v) || 0) * 100);

// Must match the backend's PLATFORM_FEE_RATE. Saved milestones carry the server's own fee; this is only for drafts.
export const FEE_RATE = 0.1;
export const feeOf = (amount: number | string) => Math.round(cents(amount) * FEE_RATE) / 100;
