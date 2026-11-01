# JobPilot AI

JobPilot AI is a single workspace for automatically tracking a user's job search from email, supported job portals, and optional WhatsApp updates. The current product direction is documented in [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## Current status

The first implementation slice establishes a responsive Next.js dashboard, a demo-only application list, Recharts analytics, shadcn/ui components, and a FastAPI service shell. Search and status filters work. Gmail, AI, account authentication, portal connectors, WhatsApp/n8n, billing, and database persistence are not connected yet. The dashboard labels sample records as demo data and does not access Gmail or send messages.

The intended normal workflow needs no manual application feeding: after the user connects Gmail through Google OAuth, JobPilot will import up to the last 60 days of relevant mail and keep application records updated. The product must never ask for or store a Gmail password. AI follow-up drafts require the user's permission and remain unsent for review.

### Roadmap

- [x] Establish the Next.js, TypeScript, Tailwind CSS, shadcn/ui, Lucide, and Recharts frontend.
- [x] Build the responsive dashboard shell and clearly labeled sample data.
- [x] Add working in-session application creation, search, status filtering, and demo assistant responses.
- [x] Establish the FastAPI configuration and health endpoint.
- [ ] Add database models, Alembic migrations, and user-scoped application APIs.
- [ ] Implement the single-workspace sign-in flow and secure account/session management.
- [ ] Add Gmail OAuth, encrypted token storage, a consented 60-day first sync, and incremental background sync.
- [ ] Automatically classify relevant mail, deduplicate applications, and support correction/exclusion without manual feeding.
- [ ] Add permission-gated AI drafts for user-selected conversations; save drafts only and leave sending to the user.
- [ ] Add supported, user-authorized job-portal status connectors with source and last-checked details.
- [ ] Add opt-in WhatsApp tracking and reminders through signed n8n workflows.
- [ ] Add persistent analytics, email intelligence, and the data-grounded career assistant.
- [ ] Add Stripe and Razorpay checkout with server-verified, idempotent payment webhooks.
- [ ] Complete accessibility, responsive, security, and integration checks; document deployment.

## Requirements

- Node.js 20.9 or newer and npm
- Python 3.11 or newer
- PostgreSQL and Redis for later database-backed and background-task features

No API credentials are needed to preview the dashboard. The sample workspace is separate from live integrations.

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The starter dashboard uses local demo data and session-only edits.

## Run the API

From the repository root:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --app-dir backend
```

The API health route is `http://localhost:8000/api/v1/health`; interactive docs are at `http://localhost:8000/docs`. A healthy response confirms the API process is running; it does not imply database or provider connectivity.

## Configuration and privacy

Copy `.env.example` to `.env` and supply credentials only when implementing the corresponding server-side integration. Never commit `.env` or expose provider keys in frontend code. Gmail access must use Google OAuth with narrow permissions. Gmail password collection is prohibited. AI draft creation requires consent for the selected conversation; drafts are not sent automatically. WhatsApp is opt-in, and payment confirmation must come from verified server-side webhooks.

## Project layout

```text
frontend/   Next.js application
backend/    FastAPI application and Python dependencies
.env.example
PRODUCT_REQUIREMENTS.md
```
