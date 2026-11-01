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

The default mode is `demo`. Live provider integrations and database-backed user records are not implemented yet.
