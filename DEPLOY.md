# Deploy BilisOps Chat — Supabase + Cloudflare Workers

This is the test-deployment path: the React frontend and the API both run on a
single **Cloudflare Worker** (static assets + a Worker entry), and all data lives
in **Supabase Postgres**. Platform webhooks / OAuth are **not** part of this build.

```
Browser ──► Cloudflare Worker ──► /api/*  Worker code (worker/index.js, Hono)
                               │             │
                               │             ▼
                               │        Supabase Postgres  (service-role key, HTTPS)
                               └─► /*     static React app (dist/) — SPA fallback
```

The frontend is unchanged — it calls `/api/*`, which the Worker handles on the
same domain (no CORS, no separate backend host). Everything else is served from
`dist/` with single-page-app fallback.

---

## 1. Create the Supabase project

1. Go to https://supabase.com → **New project**. Pick a name, a strong DB
   password, and the region closest to you (e.g. **Southeast Asia (Singapore)**).
2. When it finishes provisioning, open **SQL Editor → New query**, paste the
   entire contents of [`supabase/schema.sql`](supabase/schema.sql), and **Run**.
3. Open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret key → `SUPABASE_SERVICE_KEY`
     ⚠️ Server-only. It bypasses row-level security — never put it in frontend
     code or commit it.

---

## 2. Run it locally first (same code path as production)

```bash
npm install
cp .dev.vars.example .dev.vars      # then edit .dev.vars with your real values
npm run cf:dev                       # builds dist/ and serves app + API on http://localhost:8788
```

`.dev.vars`:
```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_KEY=YOUR-SERVICE-ROLE-KEY
ANTHROPIC_API_KEY=            # optional — blank = template drafts
```

> Requires **wrangler v4+** (pinned in package.json). v3 has a local-dev bug that
> makes the Worker's outbound fetch to Supabase fail with "internal error".

---

## 3. Deploy to Cloudflare

### Option A — Git-connected build (matches the dashboard "Import repository" flow)

In **Cloudflare dashboard → Workers & Pages → Create → Import a repository**, pick
`BilisOps/BilisOps-Chat`, then set:

- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`
- Leave "Builds for non-production branches" as you like.

Deploy once (it will fail to serve data until secrets are set), then add the
variables below and **re-deploy** (or push a commit).

### Option B — deploy from your machine

```bash
npx wrangler login
npm run cf:deploy
```

### Variables & Secrets (Worker → Settings → Variables & Secrets)

| Name | Value | Type | Required |
|---|---|---|---|
| `SUPABASE_URL` | your project URL | Variable | ✅ |
| `SUPABASE_SERVICE_KEY` | service_role key | **Secret** | ✅ |
| `ANTHROPIC_API_KEY` | Claude key | **Secret** | optional |
| `SHOPEE_*` … `META_*` | platform keys | Secret | optional* |

\* Optional keys only flip the "Live/Demo" readiness badges on the Settings page.

From the CLI you can set secrets instead:
```bash
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put ANTHROPIC_API_KEY
```
`SUPABASE_URL` is not secret — put it in the dashboard Variables, or add a
`[vars]` block to `wrangler.toml`.

After changing variables, **re-deploy** so the Worker picks them up.

---

## 4. Verify the live deploy

On your `*.workers.dev` URL (or custom domain):
1. Register a new seller → you should land in the app.
2. Settings → Store Authorization → add a store.
3. Home → 🧪 Test order / Chats → 🧪 Test message → reply → ✨ AI Draft.
4. Check the Supabase **Table Editor** — rows should appear in `sellers`,
   `stores`, `conversations`, `orders`.

If a call returns `{"error":"server_error","detail":"supabase: ..."}`, the detail
names the cause (usually a missing variable or the schema not run yet).

---

## What changed from the old backend

| | Old (`server.js`) | New (deploy) |
|---|---|---|
| Runtime | Node + Express | Cloudflare Worker |
| Entry | `server.js` | `worker/index.js` (Hono) |
| Data | `data/db.json` file | Supabase Postgres |
| Password hash | Node `scrypt` | Web Crypto `PBKDF2` |
| AI drafts | Anthropic SDK | Anthropic REST via `fetch` |
| Static + API | Express serves both | `[assets]` (dist/) + Worker for `/api/*` |
| API contract | `/api/*` | `/api/*` (identical — frontend untouched) |

The legacy Express `server.js` still runs (`npm run server`, JSON file) for
offline work, but the Worker is the deploy path.

## Not included yet (next milestone)
- Platform webhooks (`/api/platforms/:key/webhook`) and OAuth callbacks.
- Token refresh jobs and outbound send via each platform's API.
- These need publicly-registered, approved platform apps first.
