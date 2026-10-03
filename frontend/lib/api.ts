export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Role = "CLIENT" | "FREELANCER" | "ADMIN";
export type User = { id: number; name: string; email: string; role: Role };
export type Milestone = {
  id?: number; title: string; description: string; amount: number | string; sequence: number; status?: string;
  submission_note?: string | null; submitted_at?: string | null; fee?: number | string; total?: number | string;
  ai_review?: AIReview | null; dispute_reason?: string | null; dispute_response?: string | null; resolution_note?: string | null;
};
export type Draft = {
  title: string; description: string; skills: string[]; budget: number | string; currency: string;
  deadline_days: number; milestones: Milestone[];
};
export type Project = Draft & {
  id: number; status: string; original_prompt: string; created_at: string;
  freelancer_id: number | null; freelancer_name: string | null; client_name: string;
};
export type ProjectSummary = { id: number; title: string; budget: string; currency: string; status: string; created_at: string };
export type Freelancer = {
  id: number; name: string; headline: string; bio: string; skills: string[];
  hourly_rate: string | null; availability: string; portfolio_url: string | null; payout_ready: boolean;
  active_projects: number; at_capacity: boolean;
};

export type FreelancerMatch = { freelancer: Freelancer; score: number; reasons: string[] };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const TOKEN_KEY = "locim_token";
export const tokenStore = {
  get: () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

function messageFrom(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return "Something went wrong";
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  } catch {
    throw new ApiError(0, "Can't reach the LOCIM server. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, messageFrom(data?.detail));
  return data as T;
}

export type Payment = {
  id: number; kind: "FUND" | "RELEASE" | "REFUND"; status: string; amount: string; fee: string; currency: string;
  project_id: number; project_title: string; milestone_title: string; created_at: string;
};
export type FreelancerMe = {
  headline: string; bio: string; skills: string[]; hourly_rate: string | null; availability: string; paypal_email: string | null;
  active_projects: number; max_active_projects: number;
};

export type DashboardProject = {
  id: number; title: string; status: string; currency: string; budget: string; freelancer_name: string | null;
  milestones_total: number; milestones_released: number; milestone_statuses: string[];
  escrow_held: string; paid_out: string; next_action: string; needs_attention: boolean; created_at: string;
};
export type Dashboard = {
  totals: {
    projects: number; active: number; completed: number; needs_attention: number; total_budget: string;
    escrow_held: string; paid_out: string; fees_paid: string; currency: string;
  };
  projects: DashboardProject[];
};

export type AIReview = { verdict: "MEETS" | "PARTIAL" | "UNCLEAR"; summary: string; checks: { requirement: string; met: boolean; comment: string }[] };
export type ScopeCheck = {
  verdict: "IN_SCOPE" | "OUT_OF_SCOPE" | "UNCLEAR"; explanation: string; matched_milestone: number | null;
  suggested_milestone: { title: string; description: string; amount: number | string } | null;
};
export type Dispute = {
  milestone_id: number; milestone_title: string; sequence: number; amount: string; total: string; currency: string;
  project_id: number; project_title: string; client_name: string; freelancer_name: string | null; milestone_description: string;
  submission_note: string | null; ai_review: AIReview | null; dispute_reason: string | null; dispute_response: string | null;
};

export type AdminActivity = {
  id: number; kind: "FUND" | "RELEASE" | "REFUND"; status: string; amount: string; fee: string; currency: string;
  project_id: number; project_title: string; milestone_title: string; client_name: string; freelancer_name: string | null; created_at: string;
};
export type AdminOverview = {
  currency: string; clients: number; freelancers: number; freelancers_payout_ready: number; projects: number;
  projects_by_status: Record<string, number>; open_disputes: number; volume: string; escrow_held: string; paid_out: string;
  refunded: string; fees_earned: string; recent_activity: AdminActivity[];
};
export type AdminUser = {
  id: number; name: string; email: string; role: Role; created_at: string; payout_ready: boolean | null; projects: number;
};
export type AdminProject = {
  id: number; title: string; status: string; currency: string; budget: string; client_name: string; freelancer_name: string | null;
  milestones_total: number; milestones_released: number; escrow_held: string; has_dispute: boolean; created_at: string;
};
