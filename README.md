# LOCIM

An AI-native freelance marketplace that turns a client's idea into a structured, funded, and trackable freelance project.

> From idea → freelancer → milestone → payment, with AI in the middle.

See [LOCIM_PayPal_AI_Hackathon_Plan.md](LOCIM_PayPal_AI_Hackathon_Plan.md) for the full build plan.

## Status

| Area | State |
| --- | --- |
| Auth (client / freelancer roles) | Done |
| AI Project Architect (prompt → project + milestones, with refine) | Done |
| Projects and milestones | Done |
| Freelancer directory | Done |
| Freelancer matching (explainable score on each project) | Done |
| Hiring + PayPal Sandbox escrow (fund, submit, release, refund, dispute) | Done (needs your Sandbox keys) |
| Payments ledger | Done |
| Client dashboard (progress, escrow, next action) | Done |
| Freelancer capacity: max 3 active projects (frees up when all milestones are paid) | Done |
| AI review of submitted work (advisory) | Done |
| Scope-change check, extra work becomes a new milestone | Done |
| Dispute resolution (admin rules: pay freelancer or refund client) | Done |
| Admin overview (fees earned, escrow, users, projects, all payments) | Done |

## Run it (Docker only)

```bash
cp .env.example .env        # then set GROQ_API_KEY (optional)
docker compose up --build
```

- App: http://localhost:3000
- API docs: http://localhost:8000/docs
- Demo login: `client@demo.locim` / `demo12345` (freelancers: `sofia@demo.locim`, etc.; admin: `admin@demo.locim`; same password)

Without `GROQ_API_KEY` the backend uses a deterministic mock AI so the UI works offline.
With a key it calls Groq (`GROQ_MODEL`, default `openai/gpt-oss-120b`). On startup the backend
checks the model ID against Groq's model list and logs a warning if it was retired.

## Tests

```bash
docker compose exec backend pytest
docker compose exec frontend npx tsc --noEmit
```

## Stack

Next.js 15 · TypeScript · Tailwind v4 · FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL · Groq · PayPal Sandbox (planned)

## Notes

- The AI only suggests: `/api/ai/project` returns a draft, the client edits it, and saving goes through `POST /api/projects`, which re-validates that milestones sum to the budget.
- The session token is kept in `localStorage` for hackathon speed. Use an httpOnly cookie before any production use.
- PayPal runs in Sandbox only. No real money moves.

## License

MIT

## Payments (PayPal Sandbox escrow)

Hiring moves no money. The client funds one milestone at a time; PayPal captures it into LOCIM's
merchant account, and it is paid out to the freelancer only when the client approves the work.
Before the freelancer submits, the client can refund (the project reopens). After, it's approve or dispute.
Set `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` in `.env`, then `docker compose up -d --force-recreate backend`
(env_file is only read when the container is created). Freelancers connect their PayPal email on their home page.

Money is in `DEFAULT_CURRENCY` (PHP). A `PLATFORM_FEE_RATE` (10%) is added on top of every milestone and covers PayPal's fees;
the freelancer is paid the full milestone amount. AI review and scope check are advisory: the client always decides.
Disputes freeze the funds until the admin account rules. Tests never call Groq (a conftest fixture forces the mock AI).
