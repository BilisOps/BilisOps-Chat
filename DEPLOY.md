# Deploy BilisOps Chat — Supabase + Cloudflare Pages

This is the test-deployment path: the React frontend and the API both run on
**Cloudflare Pages** (the API as a Pages Function), and all data lives in
**Supabase Postgres**. Platform webhooks / OAuth are **not** part of this build.

```
Browser ──► Cloudflare Pages ──► /*      static React app (dist/)
                              └─► /api/*  Pages Function (functions/api/[[route]].js)
                                            │
                                            ▼
                                      Supabase Postgres  (service-role key, HTTPS)
```

The frontend is unchanged — it still calls `/api/*`, which on Pages is served by
the Function on the same domain (no CORS, no separate backend host).

---

## 1. Create the Supabase project

1. Go to https://supabase.com → **New project**. Pick a name, a strong DB
   password, and the region closest to you (e.g. **Southeast Asia (Singapore)**).
2. When it finishes provisioning, open **SQL Editor → New query**, paste the
   entire contents of [`supabase/schema.sql`](supabase/schema.sql), and **Run**.
   You should see the tables created under **Table Editor**.
3. Open **Project Settings → API** and copy two values:
   - **Project URL** → `SUPABASE_URL` (e.g. `https://abcd1234.supabase.co`)
   - **service_role** secret key → `SUPABASE_SERVICE_KEY`
     ⚠️ This key bypasses row-level security. It is server-only — never put it
     in frontend code or commit it. The Pages Function is the only thing using it.

---

## 2. Run it locally first (recommended)

This uses the exact same code path as production.

```bash
npm install
cp .dev.vars.example .dev.vars      # then edit .dev.vars with your real values
npm run pages:dev                    # builds dist/ and serves app + API on http://localhost:8788
```

Fill `.dev.vars`:
```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_KEY=YOUR-SERVICE-ROLE-KEY
ANTHROPIC_API_KEY=            # optional — leave blank to use template drafts
```

Open http://localhost:8788, register a seller, authorize a store, use the
🧪 test buttons to push a message/order, reply, try ✨ AI Draft, and check the
dashboards. Data now persists in Supabase (see it live in the Table Editor).

> `.dev.vars` is git-ignored. The legacy Express server (`npm run server`, JSON
> file) still exists for offline work but is **not** the deploy path.

---

## 3. Deploy to Cloudflare Pages

### Option A — direct upload from your machine (fastest)

```bash
npx wrangler login                   # opens browser, authorize once
npm run pages:deploy                 # builds dist/ and uploads app + Function
```

The first deploy creates a project named `bilisops-chat` and prints a URL like
`https://bilisops-chat.pages.dev`. **Set the environment variables** (below),
then run `npm run pages:deploy` again so the Function can see them.

### Option B — connect your Git repo (auto-deploy on push)

1. Push this folder to a GitHub repo (secrets are already git-ignored).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - Framework preset: **None** (the `functions/` folder is auto-detected).
4. Add the environment variables (below) and deploy.

### Environment variables (Cloudflare Pages → Settings → Environment variables)

Add these to **Production** (and Preview if you use it):

| Name | Value | Required |
|---|---|---|
| `SUPABASE_URL` | your project URL | ✅ |
| `SUPABASE_SERVICE_KEY` | service_role key (mark as **Secret**) | ✅ |
| `ANTHROPIC_API_KEY` | Claude key (mark as **Secret**) | optional |
| `SHOPEE_PARTNER_ID` … `META_VERIFY_TOKEN` | platform keys | optional* |

\* Optional keys only flip the "Live/Demo" readiness badges on the Settings page
in this build; webhooks aren't wired yet.

After setting variables, **re-deploy** (Pages only picks up new vars on a fresh
deployment).

---

## 4. Verify the live deploy

On your `*.pages.dev` URL:
1. Register a new seller → you should land in the app.
2. Settings → Store Authorization → add a store.
3. Home → 🧪 Test order / Chats → 🧪 Test message.
4. Reply to the conversation; try ✨ AI Draft.
5. Check the Supabase **Table Editor** — you should see rows in `sellers`,
   `stores`, `conversations`, `orders`.

If a call returns `{"error":"server_error","detail":"supabase: ..."}`, the detail
tells you what failed (usually a missing env var or the schema not being run yet).

---

## What changed from the old backend

| | Old (`server.js`) | New (deploy) |
|---|---|---|
| Runtime | Node + Express | Cloudflare Pages Function (Workers) |
| Router | Express | Hono (`functions/api/[[route]].js`) |
| Data | `data/db.json` file | Supabase Postgres |
| Password hash | Node `scrypt` | Web Crypto `PBKDF2` |
| AI drafts | Anthropic SDK | Anthropic REST via `fetch` |
| API contract | `/api/*` | `/api/*` (identical — frontend untouched) |

## Not included yet (next milestone)
- Platform webhooks (`/api/platforms/:key/webhook`) and OAuth callbacks.
- Token refresh jobs and outbound send via each platform's API.
- These need publicly-registered, approved platform apps first.
