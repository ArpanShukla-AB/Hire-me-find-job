# JobPilot AI API

FastAPI service foundation. The health route confirms the API process is responding; it does not claim that PostgreSQL, Redis, Gmail, or AI providers are connected.

## Local development

Use Python 3.11 or newer, create and activate a virtual environment from the repository root, then install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --app-dir backend
```

The health endpoint is `http://localhost:8000/api/v1/health`; interactive API docs are at `http://localhost:8000/docs`.

The default mode is `demo`. Google OAuth can establish a signed session and store one encrypted, read-only Gmail connection. After connecting, the user can explicitly start a sync through `POST /api/v1/gmail/sync`. The first sync searches up to the configured maximum of 60 recent days; later requests use Gmail history. Only IDs, thread IDs, sender, subject, and received date are persisted for matching messages. This sync does not classify or create application records.

## Google OAuth connection

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `FRONTEND_APP_URL`, and a high-entropy `APP_SECRET_KEY` in `.env`. Register the exact redirect URI with Google. The requested scopes are `openid`, `email`, and `gmail.readonly`; Gmail passwords are never collected. The browser can check the connection at `/api/v1/auth/google/status` and disconnect it at `/api/v1/auth/google/disconnect`.

Apply the Gmail connection table migration before connecting an account:

```bash
alembic -c backend/alembic.ini upgrade head
```

The connection stores the Google subject, verified email, granted scopes, and an encrypted refresh token. Keep `APP_SECRET_KEY` stable and secret: changing it makes existing refresh tokens unreadable and invalidates signed sessions.

## User-triggered Gmail sync

Apply migrations through `20261101_0002` before syncing. `GET /api/v1/gmail/sync/status` returns the user's imported message count and last sync time. `POST /api/v1/gmail/sync` starts the initial 60-day search or an incremental Gmail history sync. Google history cursors can expire; when that happens, the endpoint safely performs a new bounded 60-day search. Requesting this endpoint represents the user's explicit consent to import the matching email metadata. Bodies are not fetched or stored.
