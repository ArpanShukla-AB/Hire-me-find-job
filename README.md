# JobPilot AI

JobPilot AI is a single workspace for automatically tracking a user's job search from email, supported job portals, and optional WhatsApp updates. The current product direction is documented in [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## Current status

The project includes a responsive Next.js demo dashboard, a Google OAuth flow for read-only Gmail access, and an explicit Gmail sync action. OAuth state is validated, refresh tokens are encrypted at rest, and the first sync searches at most the preceding 60 days for relevant messages. Sync stores message and thread IDs plus sender, subject, and date metadata; it does not store message bodies or unrelated messages. Subsequent manual syncs use Gmail history. Application records remain clearly labeled demo data while classification and persistent application tracking are developed.

The intended normal workflow needs no manual application feeding: after the user connects Gmail through Google OAuth, JobPilot will import up to the last 60 days of relevant mail and keep application records updated. The product must never ask for or store a Gmail password. AI follow-up drafts require the user's permission and remain unsent for review.

### Roadmap

- [x] Establish the Next.js, TypeScript, Tailwind CSS, shadcn/ui, Lucide, and Recharts frontend.
- [x] Build the responsive dashboard shell and clearly labeled sample data.
- [x] Add working in-session application creation, search, status filtering, and demo assistant responses.
- [x] Establish the FastAPI configuration and health endpoint.
- [ ] Add database models, Alembic migrations, and user-scoped application APIs.
- [x] Establish Google OAuth sign-in, read-only Gmail connection, encrypted token storage, and disconnect controls.
- [x] Add a user-triggered 60-day first Gmail sync and incremental history sync, storing only relevant message metadata.
- [ ] Run incremental sync in the background and classify relevant messages into persistent application records.
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
- PostgreSQL for OAuth credential storage and persistent data; Redis for background tasks

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

Copy `.env.example` to `.env` and supply credentials only when implementing the corresponding server-side integration. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and a high-entropy `APP_SECRET_KEY` to enable the current Google OAuth connection. Register the redirect URI in Google Cloud and set `NEXT_PUBLIC_API_BASE_URL` in `frontend/.env.local` if the API is not at `http://localhost:8000`. Never commit `.env` or expose provider keys in frontend code. Gmail access uses Google OAuth with read-only permission; Gmail password collection is prohibited. The current connection does not import messages yet. AI draft creation requires consent for the selected conversation; drafts are not sent automatically. WhatsApp is opt-in, and payment confirmation must come from verified server-side webhooks.

### Local Google OAuth setup

1. Enable the Gmail API in Google Cloud, configure the OAuth consent screen, and create a **Web application** OAuth client.
2. Add this exact authorized redirect URI to that client: `http://localhost:8000/api/v1/auth/google/callback`. Add your Google account as a test user while the consent screen is in testing.
3. Put the client ID and secret in the root `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Generate a high-entropy `APP_SECRET_KEY`, for example with `python -c 'import secrets; print(secrets.token_urlsafe(48))'`. Keep these values private.
4. Start PostgreSQL, confirm `DATABASE_URL` points to it, and apply the schema from the repository root: `alembic -c backend/alembic.ini upgrade head`.
5. Start the FastAPI backend and Next.js frontend, then choose **Connect Gmail** and approve the read-only request in Google's consent screen. Copy `frontend/.env.example` to `frontend/.env.local` only if the API runs at a different origin; update `CORS_ORIGINS` in the backend `.env` to include the frontend origin too.

The OAuth redirect must match exactly. The app requests `openid`, `email`, and `gmail.readonly`; it does not request compose or send access. Gmail read scopes are sensitive/restricted and can require Google verification before general release. Read Google's [web server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) and [Gmail scope guide](https://developers.google.com/workspace/gmail/api/auth/scopes). OAuth currently links and stores the account only; email import and application tracking are a later step.

## Project layout

```text
frontend/   Next.js application
backend/    FastAPI application and Python dependencies
.env.example
PRODUCT_REQUIREMENTS.md
```
