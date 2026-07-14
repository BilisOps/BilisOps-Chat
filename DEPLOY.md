# Deploy BilisOps Chat — Supabase + Cloudflare Pages

The React frontend and the API both run on **Cloudflare Pages** (the API as a
Pages Function), and all data lives in **Supabase Postgres**. Pages is used
(not Workers) so a custom domain attaches with a simple CNAME — no nameserver
move required. Platform webhooks / OAuth are **not** part of this build.

```
Browser ──► Cloudflare Pages ──► /*      static React app (dist/)
                              └─► /api/*  Pages Function (functions/api/[[route]].js, Hono)
                                            │
                                            ▼
                                      Supabase Postgres  (service-role key, HTTPS)
```

The frontend is unchanged — it calls `/api/*`, which Pages serves from the
Function on the same domain (no CORS, no separate backend host).

---

## 1. Create the Supabase project

1. https://supabase.com → **New project**. Pick a name, a strong DB password,
   and the closest region (e.g. **Southeast Asia (Singapore)**).
2. **SQL Editor → New query** → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Project Settings → API** → copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret key → `SUPABASE_SERVICE_KEY` (server-only; bypasses
     RLS; never commit it or use it in frontend code)

---

## 2. Run it locally first (same code path as production)

```bash
npm install
cp .dev.vars.example .dev.vars      # then edit with your real values
npm run pages:dev                    # builds dist/ and serves app + API on http://localhost:8788
```

`.dev.vars`:
```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_KEY=YOUR-SERVICE-ROLE-KEY
ANTHROPIC_API_KEY=            # optional — blank = template drafts
```

> Requires **wrangler v4+** (pinned in package.json). v3 has a local-dev bug that
> makes the Function's outbound fetch to Supabase fail with "internal error".

---

## 3. Deploy to Cloudflare Pages

### Option A — Git-connected (auto-deploy on push)

1. Cloudflare dashboard → **Workers & Pages → Create → Pages tab → Connect to Git**.
   (If you only see the Workers importer, use Option B — the CLI — instead.)
2. Pick `BilisOps/BilisOps-Chat`. Build settings:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - (The `functions/` folder is auto-detected as the API.)
3. Add the environment variables (below), then **Save and Deploy**.

### Option B — deploy from your machine (CLI)

```bash
npx wrangler login
npm run pages:deploy        # first run creates the Pages project "bilisops-chat"
```
Then set the variables in the dashboard and re-run `npm run pages:deploy`.

### Environment variables (Pages project → Settings → Environment variables → Production)

| Name | Value | Required |
|---|---|---|
| `SUPABASE_URL` | your project URL | ✅ |
| `SUPABASE_SERVICE_KEY` | service_role key (mark **Encrypted/Secret**) | ✅ |
| `ANTHROPIC_API_KEY` | Claude key (Secret) | optional |
| `SHOPEE_*` … `META_*` | platform keys | optional* |

\* Optional keys only flip the "Live/Demo" readiness badges on the Settings page.

After adding/changing variables, **re-deploy** — Pages only picks them up on a
fresh deployment.

---

## 4. Custom domain (Netlify-style — CNAME, no nameserver move)

Pages lets you attach a domain whose DNS still lives at Hostinger:

1. Pages project → **Custom domains → Set up a domain** → enter `app.yourdomain.com`.
2. Cloudflare shows a **CNAME target** like `bilisops-chat.pages.dev`.
3. Hostinger → **DNS Zone** → add: **CNAME**, name `app`, value `bilisops-chat.pages.dev`.
4. Wait a few minutes; Cloudflare issues the SSL cert automatically.

Your Netlify site and email stay untouched. (A subdomain like `app.` works
cleanly this way; the bare root domain is easier if the domain is on Cloudflare
DNS, but a subdomain needs nothing moved.)

---

## 5. Verify the live deploy

On your `*.pages.dev` URL (or custom domain):
1. Register a seller → you should land in the app.
2. Settings → Store Authorization → add a store.
3. Home → 🧪 Test order / Chats → 🧪 Test message → reply → ✨ AI Draft.
4. Supabase **Table Editor** should show rows in `sellers`, `stores`,
   `conversations`, `orders`.

`{"error":"server_error","detail":"supabase: ..."}` means a variable is missing
or the schema wasn't run yet — the detail names the cause.

---

## What changed from the old backend

| | Old (`server.js`) | New (deploy) |
|---|---|---|
| Runtime | Node + Express | Cloudflare Pages Function (Workers runtime) |
| Router | Express | Hono (`functions/api/[[route]].js`) |
| Data | `data/db.json` file | Supabase Postgres |
| Password hash | Node `scrypt` | Web Crypto `PBKDF2` |
| AI drafts | Anthropic SDK | Anthropic REST via `fetch` |
| API contract | `/api/*` | `/api/*` (identical — frontend untouched) |

The legacy Express `server.js` still runs (`npm run server`, JSON file) for
offline work, but Pages is the deploy path.

## Not included yet (next milestone)
- Platform webhooks (`/api/platforms/:key/webhook`) and OAuth callbacks.
- Token refresh jobs and outbound send via each platform's API.
- These need publicly-registered, approved platform apps first.
