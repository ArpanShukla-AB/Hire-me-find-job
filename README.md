# JobPilot AI

JobPilot AI is a job-search workspace for keeping applications, interview activity, and follow-ups together. The repository is being built feature by feature from the product brief in the project attachments.

## Current status

The first implementation slice establishes a responsive Next.js dashboard, a demo-only application list, Recharts analytics, shadcn/ui components, and a FastAPI service shell. Search and status filters work; adding an application updates the current browser session. Gmail, AI, authentication, billing, and database persistence are not connected yet. The dashboard labels all sample records as demo data and does not access Gmail or send messages.

### Roadmap

- [x] Establish the Next.js, TypeScript, Tailwind CSS, shadcn/ui, Lucide, and Recharts frontend.
- [x] Build the responsive dashboard shell and clearly labeled sample data.
- [x] Add working in-session application creation, search, status filtering, and demo assistant responses.
- [x] Establish the FastAPI configuration and health endpoint.
- [ ] Add database models, Alembic migrations, and user-scoped application APIs.
- [ ] Implement secure authentication, onboarding, session handling, and account deletion.
- [ ] Add Gmail OAuth with minimum scopes, encrypted token storage, and consent-first synchronization.
- [ ] Add email classification, duplicate detection, application linking, and user correction flows.
- [ ] Add approval-first follow-up drafts, scheduling rules, send history, limits, and emergency pause.
- [ ] Add persistent analytics, email intelligence, and the data-grounded career assistant.
- [ ] Add subscription flows and server-verified payment webhooks.
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

Copy `.env.example` to `.env` and supply credentials only when implementing the corresponding server-side integration. Never commit `.env` or expose provider keys in frontend code. Gmail access must use Google OAuth and explain requested permissions. Sending follow-ups must stay disabled until the user explicitly configures rules and approves messages.

## Project layout

```text
frontend/   Next.js application
backend/    FastAPI application and Python dependencies
.env.example
```
