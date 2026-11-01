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

The default mode is `demo`. Google OAuth can establish a signed session and store one encrypted Gmail connection. The dashboard starts a sync after the first successful connection and checks for updates on later visits. The first sync searches up to the configured maximum of 60 recent days; later requests use Gmail history. Matching message metadata is stored with extracted company, role, and status fields; message bodies and unrelated mail are not stored. Classification uses message headers and Gmail snippets and can leave a role or company unidentified when the message does not say clearly.

## Google OAuth connection

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `FRONTEND_APP_URL`, `OPENAI_API_KEY`, and a high-entropy `APP_SECRET_KEY` in `.env`. Register the exact redirect URI with Google. The requested scopes are `openid`, `email`, `gmail.readonly`, and `gmail.send`; Gmail passwords are never collected. Existing users need to select **Reconnect for sending** and approve the added send permission. Google may require adding the account as a test user while the OAuth app is in testing. The browser can check the connection at `/api/v1/auth/google/status` and disconnect it at `/api/v1/auth/google/disconnect`.

Apply the Gmail connection table migration before connecting an account:

```bash
alembic -c backend/alembic.ini upgrade head
```

The connection stores the Google subject, verified email, granted scopes, and an encrypted refresh token. Keep `APP_SECRET_KEY` stable and secret: changing it makes existing refresh tokens unreadable and invalidates signed sessions. `OPENAI_API_KEY` is used only on the backend to generate the reply body.

## User-triggered Gmail sync

Apply all migrations before syncing. `GET /api/v1/gmail/sync/status` returns the user's imported message count and last sync time. `POST /api/v1/gmail/sync` starts the initial 60-day search or an incremental Gmail history sync. `GET /api/v1/gmail/applications` returns deduplicated company/role records derived from relevant mail. Google history cursors can expire; when that happens, the endpoint safely performs a new bounded 60-day search. Bodies are fetched transiently only when displayed or when a user submits an AI follow-up; bodies and résumé contents are not stored. The follow-up endpoint generates a reply and sends it in the original thread after the user presses **Generate & send**. Optional résumé attachments support PDF, DOCX, or TXT files up to 5 MB.
