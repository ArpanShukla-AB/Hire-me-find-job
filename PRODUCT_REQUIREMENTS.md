# JobPilot AI — Product direction

This document records the current user-approved product direction and takes precedence over older prototype notes where they conflict.

## Product experience

JobPilot is one workspace for the user's job search. The core workflow is connect once, then let the app discover and track applications automatically. Manual application entry is not the primary workflow; users can correct, exclude, or relink detected records.

### Sign-in and inbox connection

- Provide one JobPilot account sign-in flow, with secure email/password account sign-in and Google sign-in as options.
- Connect Gmail through Google OAuth. Never ask for, transmit, or store a Gmail password.
- Explain each requested permission before authorization. Keep initial inbox access read-only and request any additional permission only when its feature is enabled.
- On the first authorized sync, inspect at most the preceding 60 days. Thereafter, use an incremental sync cursor or Gmail change notifications rather than repeatedly scanning the whole mailbox.
- Process only relevant job-search conversations. Do not expose unrelated personal messages in the workspace.

### Automatic application tracking

- Detect application confirmations, recruiter and HR replies, interview invitations, assessments, offers, rejections, withdrawals, and status updates.
- Extract company, role, location, key dates, recruiter details, status, source message/thread, and last communication date.
- Merge messages from the same application. Let the user correct a classification, exclude an email, or relink a thread.
- Track portal status when a supported, user-authorized integration is available. Prefer official APIs and OAuth. Never ask users to hand over job-portal passwords or bypass a portal's access controls. Show which portal/source was checked and when; retain email-derived tracking when a portal connector is unavailable.
- Do not require manual application feeding for the normal workflow.

### AI assistance and drafts

- Ground suggestions in the user's authorized, relevant email threads and application records. Never invent job activity.
- Ask permission before processing a selected conversation for an AI-written follow-up draft. Show the draft in JobPilot for review and editing.
- If the user separately authorizes Gmail draft creation, save to Gmail Drafts. Do not send the message. Sending stays an explicit user action outside the automatic draft flow.
- Suppress inappropriate follow-ups after a reply, rejection, offer, or withdrawal.

### WhatsApp and n8n

- Offer an opt-in WhatsApp bot for concise application summaries, upcoming interview reminders, and user-requested status lookups.
- Use n8n for event-driven workflow orchestration behind authenticated, signed webhooks. Keep application data and provider credentials in the backend or secret store, not in workflow definitions or client code.
- Verify and link the user's WhatsApp number. Support immediate opt-out and avoid sending raw email contents unless the user explicitly enables that detail.
- Keep bot notifications separate from email draft creation and sending.

### Billing

- Offer subscription checkout through Stripe and Razorpay, selected for the user's region.
- Verify payment events server-side, make webhook handling idempotent, and store billing references rather than card data.
- Never claim payment success based only on a browser redirect.

## Architecture and privacy boundaries

- Frontend: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Lucide, and Recharts.
- Backend: FastAPI, PostgreSQL, SQLAlchemy/Alembic, Redis, and Celery; n8n handles selected event workflows.
- Keep OAuth tokens encrypted at rest; isolate every record by user; authorize on the server; validate inputs; rate-limit external integrations; keep audit trails and support disconnect/deletion controls.
- Use environment variables or a secret manager for credentials. Keep demo fixtures clearly labeled and separate from production data paths.
- Gmail OAuth replaces direct Gmail-password collection. OAuth scopes should be narrow and incremental; draft permission is separate from read-only sync.

## Acceptance path

1. User signs in to JobPilot and connects Gmail with Google OAuth.
2. JobPilot imports up to 60 days of relevant mail, groups messages into applications, and shows detected status with a source and last-sync time.
3. New relevant mail updates the existing application automatically; the user can correct or exclude detections.
4. The user selects a conversation, grants draft permission, and reviews/edits an AI-generated draft. JobPilot does not send it.
5. The user can optionally enable a WhatsApp bot and select which reminders or summaries it may send.
6. Subscription changes are confirmed by verified server-side Stripe or Razorpay events.
