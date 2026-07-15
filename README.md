# Twitter 2020

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/vuyp/twitter-2020-demo?quickstart=1)

A self-hosted, multi-user recreation of Twitter's late-November 2020 web experience. It uses the
pre-X brand, the 2020 responsive three-column layout, weighted 280-character Tweets, profiles,
social interactions, search, notifications, Lists, Bookmarks, and realtime Messages.

> [!IMPORTANT]
> This is an unofficial educational recreation and is not affiliated with, endorsed by, or
> operated by Twitter/X. Twitter/X names, marks, and historical interface elements belong to their
> respective owners. For a public demo, use a made-up email address, a unique password, and no real
> personal information.

The application never creates sample users or content. A fresh migration produces an empty
platform and every screen has a deliberate first-run empty state.

## Quick start with Docker

1. Copy `.env.example` to `.env` and replace every `replace-with-...` secret with an independent
   random value of at least 32 characters.
2. Run `docker compose up --build`.
3. Open <http://localhost>. Mail sent during development appears at <http://localhost:8025> and
   the MinIO console is available at <http://localhost:9001>.
4. Create the first account through the UI. To make it a moderator, set
   `BOOTSTRAP_ADMIN_EMAIL` to that address before signup.

Set `GIPHY_API_KEY` to enable the built-in GIF search. Without a key, people can still upload GIF
files directly from the composer.

PostgreSQL, Redis, MinIO, Mailpit, the background worker, the realtime gateway, and Caddy are all
included. Persistent data lives in named Docker volumes.

### GitHub Codespaces

Click **Open in GitHub Codespaces**, choose **Create codespace**, and wait for the initial container
build to finish. The dev container starts the full Compose stack automatically on creation and
resume, then opens the app and makes port 80 public. Only the app gateway is exposed; PostgreSQL,
Redis, MinIO, and Mailpit stay private inside the Codespace.

Codespaces-specific secrets are generated once in the ignored `.devcontainer/.env.codespaces`
file. Email verification is disabled only in the Codespaces demo, so new accounts continue
straight to onboarding. If GitHub policy prevents automatic public visibility, open the **Ports**
panel, right-click port 80, choose **Port Visibility**, then **Public**. To restart manually, run
`bash .devcontainer/start.sh`; add `--build` after changing application code or dependencies.

To protect the shared demo machine, Codespaces limits images to 10 MB, videos to 50 MB, and each
account to 30 upload requests per hour. Normal self-hosted defaults retain the historical 15 MB
image and 512 MB video limits.

The Codespace uses a 4-core machine and consumes the repository owner's Codespaces allowance.
Stop it when nobody is testing and delete it when the demo is finished. Data persists in the
Codespace's Docker volumes until that Codespace is deleted; this is a temporary demo deployment,
not a production hosting setup.

## Local development

Node 22 or newer and pnpm 11 are required. Start PostgreSQL, Redis, an S3-compatible object store,
and an SMTP test server, then:

```powershell
Copy-Item .env.example .env
pnpm install
pnpm db:migrate
pnpm dev
```

The web application runs on <http://localhost:3000> and the realtime gateway on port 3001.

## Workspace

- `apps/web` — Next.js App Router application, REST API, authentication, and responsive UI.
- `apps/realtime` — authenticated Socket.IO gateway backed by Redis.
- `apps/worker` — BullMQ jobs for scheduled Tweets, notifications, trends, media, and email.
- `packages/contracts` — shared Zod request and response contracts.
- `packages/db` — Drizzle PostgreSQL schema and migrations.

All public JSON endpoints live below `/api/v1`; authentication endpoints live below `/api/auth`.
Pagination cursors are opaque and all public identifiers are serialized as strings.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm test:visual
```

Playwright covers desktop, tablet, and mobile layouts. The visual smoke check uses a fixed desktop
viewport and verifies the historical 2020 split-shell geometry after rendering a full-page capture.

## Production notes

- Replace all development secrets and enable TLS at the proxy.
- Replace Mailpit with an SMTP provider and configure the public S3 URL.
- Keep PostgreSQL, Redis, and object storage private from the public network.
- Back up the PostgreSQL and MinIO volumes together.
- Run migrations as a one-shot deployment job before rolling out web and worker containers.
- Scale realtime instances together with the Redis adapter; jobs are idempotent and safe to retry.

This project targets the consumer web product, not Twitter's advertising systems or planet-scale
infrastructure. Post-2020 features such as Spaces, Communities, edit history, views, Twitter Blue,
long posts, and Grok are intentionally absent.
