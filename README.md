# dev-maill

A fake **Resend** for development. Your app keeps using the official Resend SDK, but instead of the real API (and an API key per developer) it talks to this server. Emails are captured, shown in a mailbox UI, and webhooks are sent back to your app, signed exactly like Resend's.

- No real email is ever sent, and no real API key is needed (any key is accepted).
- Create fake end-user **inboxes** (`alice@gmail.com`, `bob@yahoo.com`, …) to test multi-user flows.
- Send mail **from an inbox to your app's domain** to trigger the `email.received` webhook.
- One container, SQLite storage, no auth on the UI.

## Run it

```bash
docker compose up --build        # UI + API on http://localhost:3000
```

or pull the published image (see [Publishing](#publishing-the-image)):

```bash
docker run -p 3000:3000 -v dev-maill-data:/data <your-dockerhub-user>/dev-maill
```

Local development without Docker:

```bash
npm install
npm run dev                      # generates the Prisma client, migrates, starts Next.js
```

## Set it up (once)

Open the UI → **Settings**:

1. **Add your app's domain**, e.g. `test.com`. It is verified instantly (no DNS). The API only accepts `from` addresses on registered domains, like Resend does.
2. **Set the webhook URL** of your app, e.g. `http://localhost:3000/api/webhooks/resend`, copy the **signing secret** into your app's env, and choose the events. Inside Docker, `localhost` URLs are automatically routed to your host machine.
3. In **Mailboxes**, create inboxes for your fake users. Inboxes must **not** use a registered app domain (they are end users, so use `gmail.com`, `yahoo.com`, …).

## Use it from your app

Only environment changes, no code changes:

```bash
RESEND_API_KEY=re_anything
RESEND_BASE_URL=http://localhost:3000     # read by the official Node SDK
```

or `new Resend(key, { baseUrl: "http://localhost:3000" })`. Other SDKs have an equivalent base-URL option.

## How mail flows

| Action | Result | Webhooks |
|---|---|---|
| App sends via SDK to `alice@gmail.com` | Appears in Alice's inbox and in **API activity** | `email.sent`, then `email.delivered` |
| App sends to an address with no inbox | Recorded in **API activity**, marked delivered | same |
| App sends to `bounced@resend.dev` / `complained@resend.dev` | Simulated outcome (use `+label` suffixes freely) | `email.sent`, then `email.bounced` / `email.complained` |
| Alice composes to `support@test.com` (registered domain) | Stored as received mail | `email.received` |
| Alice composes to Bob (both inboxes) | Appears in Bob's inbox | none |

Webhooks are signed with Standard Webhooks / Svix (`svix-*` and `webhook-*` headers), so `resend.webhooks.verify(...)` works unchanged. Failed deliveries are retried (2s, 10s, 30s); see **Webhook log** to inspect payloads and re-send.

## API compatibility

Implemented, matching the official Node SDK (`resend@6.x`) request/response shapes and error format:

- `POST /emails`, `GET /emails`, `GET /emails/:id` (incl. `Idempotency-Key`, tags, headers, attachments by content or `path` URL)
- `POST /emails/batch` (`x-batch-validation: strict | permissive`)
- `GET /emails/:id/attachments[/:id]`
- Receiving: `GET /emails/receiving[/:id]`, `.../attachments[/:id]`, plus the raw `.eml` download used by `emails.receiving.forward()`
- Domains: `POST/GET /domains`, `GET/PATCH/DELETE /domains/:id`, `POST /domains/:id/verify`

Not implemented (returns 404 or a validation error): scheduled sends (`scheduled_at` is accepted but the email is delivered immediately), templates, audiences/contacts/broadcasts, API-key management, and Resend's own webhook CRUD (configure the webhook in the UI instead).

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./data/dev-maill.db` (`file:/data/dev-maill.db` in Docker) | SQLite file |
| `WEBHOOK_SECRET` | generated on first start | fixed signing secret (`whsec_…`) |
| `PUBLIC_URL` | derived from the request | base of attachment/raw download URLs |
| `PORT` | `3000` | listen port |

## Publishing the image

```bash
docker login
DOCKER_USER=<your-dockerhub-user> npm run docker:publish   # builds linux/amd64 + linux/arm64 and pushes :latest
```

## Stack

Next.js (App Router, route handlers for the API) · Prisma 7 + SQLite (better-sqlite3 adapter) · Tailwind CSS. Migrations in `prisma/migrations` are applied at container start by `scripts/migrate.mjs`, so the runtime image does not need the Prisma CLI. To change the schema: edit `prisma/schema.prisma`, then generate SQL with `npx prisma migrate diff --from-schema <old> --to-schema prisma/schema.prisma --script` into a new `prisma/migrations/NNNN_name/migration.sql`.
