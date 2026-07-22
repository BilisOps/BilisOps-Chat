// BilisOps Chat — API on Cloudflare Pages Functions (Workers runtime).
// Same /api/* contract as the old Express server.js, but data lives in Supabase
// Postgres (reached over HTTPS with the service-role key) and password hashing
// uses Web Crypto (PBKDF2) instead of Node scrypt.
//
// Bindings expected (set in Cloudflare Pages → Settings → Environment variables,
// and in .dev.vars for `wrangler pages dev`):
//   SUPABASE_URL          e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  the service_role key (SECRET — server only)
//   ANTHROPIC_API_KEY     optional — enables Claude drafts (template fallback without it)
//   SHOPEE_* / LAZADA_* / TIKTOK_* / META_*   optional — only affect readiness flags
//
// The built React app (dist/) is served by Pages automatically; this Function
// only handles /api/*. Webhooks + OAuth callbacks are not included in this build.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/cloudflare-pages';
import { createClient } from '@supabase/supabase-js';

const app = new Hono();

app.use('/api/*', cors({
  origin: '*',
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// ---------- helpers ----------
const sbFrom = (c) => createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  // On the Workers runtime, hand supabase-js the native fetch — otherwise it
  // may select a node-fetch shim (via nodejs_compat) whose subrequests fail.
  global: { fetch: (...args) => fetch(...args) },
});

const enc = new TextEncoder();
function randHex(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const id = (prefix) => `${prefix}_${randHex(8)}`;

function hexToBytes(hex) {
  const a = new Uint8Array(hex.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16);
  return a;
}
async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: 100000 },
    key, 512,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// constant-time-ish compare
function eq(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

const publicSeller = (s) => ({ id: s.id, email: s.email, name: s.name });
const bearer = (c) => (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '');

// ---------- signed OAuth state (stateless CSRF token tying a flow to a seller) ----------
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const b64url = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlDec = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));
async function signState(secret, payload) {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${await hmacHex(secret, body)}`;
}
async function verifyState(secret, state) {
  const [body, mac] = String(state || '').split('.');
  if (!body || !mac || (await hmacHex(secret, body)) !== mac) return null;
  let p; try { p = JSON.parse(b64urlDec(body)); } catch { return null; }
  if (!p.iat || Date.now() - p.iat > 15 * 60 * 1000) return null; // 15-min validity
  return p;
}

// Await a Supabase query and throw on error so writes never fail silently.
async function w(q) {
  const { data, error } = await q;
  if (error) throw new Error(`supabase: ${error.message}`);
  return data;
}

async function sellerFromToken(c, sb) {
  const token = bearer(c);
  if (!token) return null;
  const { data: sess } = await sb.from('sessions').select('seller_id').eq('token', token).maybeSingle();
  if (!sess) return null;
  const { data: row } = await sb.from('sellers').select('data').eq('id', sess.seller_id).maybeSingle();
  return row ? row.data : null;
}

// ---------- auth gate for everything except the public auth routes ----------
const PUBLIC = new Set(['/api/auth/register', '/api/auth/login', '/api/auth/demo']);
// Platform OAuth callbacks/consent pages and webhooks are reached by the platform
// (or the seller's browser mid-redirect), so they carry no Bearer token.
const OPEN_RE = /^\/api\/platforms\/[^/]+\/(oauth|webhook)/;
app.use('/api/*', async (c, next) => {
  if (c.req.method === 'OPTIONS' || PUBLIC.has(c.req.path) || OPEN_RE.test(c.req.path)) return next();
  const sb = sbFrom(c);
  const seller = await sellerFromToken(c, sb);
  if (!seller) return c.json({ error: 'unauthorized' }, 401);
  c.set('seller', seller);
  c.set('sb', sb);
  await next();
});

async function newSession(sb, sellerId) {
  const token = randHex(24);
  await w(sb.from('sessions').insert({ token, seller_id: sellerId }));
  return token;
}

// ---------- auth ----------
app.post('/api/auth/register', async (c) => {
  const sb = sbFrom(c);
  const { email, password, name } = (await c.req.json().catch(() => ({}))) || {};
  if (!email || !password) return c.json({ error: 'email and password required' }, 400);
  const emailLower = String(email).toLowerCase();
  const { data: existing } = await sb.from('sellers').select('id').eq('email_lower', emailLower).maybeSingle();
  if (existing) return c.json({ error: 'account_exists' }, 409);
  const salt = randHex(16);
  const seller = {
    id: id('slr'), email, name: name || String(email).split('@')[0],
    salt, passHash: await hashPassword(password, salt), createdAt: new Date().toISOString(),
  };
  await w(sb.from('sellers').insert({ id: seller.id, email_lower: emailLower, data: seller }));
  const token = await newSession(sb, seller.id);
  return c.json({ token, seller: publicSeller(seller) });
});

app.post('/api/auth/login', async (c) => {
  const sb = sbFrom(c);
  const { email, password } = (await c.req.json().catch(() => ({}))) || {};
  const { data: row } = await sb.from('sellers').select('data')
    .eq('email_lower', String(email || '').toLowerCase()).maybeSingle();
  if (!row) return c.json({ error: 'no_account' }, 404);
  const seller = row.data;
  const hash = await hashPassword(password || '', seller.salt);
  if (!eq(hash, seller.passHash)) return c.json({ error: 'bad_password' }, 401);
  const token = await newSession(sb, seller.id);
  return c.json({ token, seller: publicSeller(seller) });
});

app.post('/api/auth/demo', async (c) => {
  const sb = sbFrom(c);
  const platform = String((await c.req.json().catch(() => ({})))?.platform || 'shopee').toLowerCase();
  const email = `${platform}-seller@bilisops.local`;
  const emailLower = email.toLowerCase();
  let { data: row } = await sb.from('sellers').select('data').eq('email_lower', emailLower).maybeSingle();
  let seller = row?.data;
  if (!seller) {
    const salt = randHex(16);
    seller = {
      id: id('slr'), email,
      name: `${platform[0].toUpperCase()}${platform.slice(1)} Seller`,
      salt, passHash: await hashPassword(randHex(12), salt), createdAt: new Date().toISOString(),
    };
    await w(sb.from('sellers').insert({ id: seller.id, email_lower: emailLower, data: seller }));
  }
  const token = await newSession(sb, seller.id);
  return c.json({ token, seller: publicSeller(seller) });
});

app.get('/api/me', (c) => c.json(publicSeller(c.get('seller'))));

app.post('/api/auth/logout', async (c) => {
  await c.get('sb').from('sessions').delete().eq('token', bearer(c));
  return c.json({ ok: true });
});

// ---------- stores ----------
const PLATFORM_KEYS = { Shopee: 'shopee', Lazada: 'lazada', TikTok: 'tiktok', Facebook: 'fb' };
const storePub = (s) => { const { storeToken, sellerId, ...pub } = s; return pub; };

app.get('/api/stores', async (c) => {
  const seller = c.get('seller');
  const { data } = await c.get('sb').from('stores').select('data').eq('seller_id', seller.id);
  return c.json((data || []).map((r) => storePub(r.data)));
});

app.post('/api/stores', async (c) => {
  const seller = c.get('seller');
  const { platform, name, externalId } = (await c.req.json().catch(() => ({}))) || {};
  if (!PLATFORM_KEYS[platform] || !name) return c.json({ error: 'platform and name required' }, 400);
  const expires = new Date(); expires.setFullYear(expires.getFullYear() + 1);
  const store = {
    id: id('str'), sellerId: seller.id, platform, key: PLATFORM_KEYS[platform],
    name: String(name).slice(0, 80), site: 'PH',
    externalId: externalId ? String(externalId).slice(0, 60) : null,
    storeToken: randHex(16),
    authorizedAt: new Date().toISOString(), expiresAt: expires.toISOString(),
  };
  await w(c.get('sb').from('stores').insert({ id: store.id, seller_id: seller.id, data: store }));
  return c.json(storePub(store));
});

app.delete('/api/stores/:id', async (c) => {
  const seller = c.get('seller');
  const { data } = await c.get('sb').from('stores').delete()
    .eq('id', c.req.param('id')).eq('seller_id', seller.id).select('id');
  if (!data || !data.length) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

// ---------- platform readiness matrix (Settings page) ----------
const PLATFORM_META = [
  { key: 'shopee', name: 'Shopee', docs: 'https://open.shopee.com',
    authModel: 'Partner ID + Partner Key; per-shop auth_partner authorization; HMAC-SHA256',
    terms: { store: 'Shop (shop_id)', buyer: 'Buyer (buyer_user_id)', chat: 'Conversation (conversation_id)', message: 'Message (message_id)', order: 'Order (order_sn)' },
    envVars: ['SHOPEE_PARTNER_ID', 'SHOPEE_PARTNER_KEY'],
    authorize: (r) => `https://partner.shopee.com/api/v2/shop/auth_partner?partner_id={PARTNER_ID}&redirect=${encodeURIComponent(r)}` },
  { key: 'lazada', name: 'Lazada', docs: 'https://open.lazada.com',
    authModel: 'App Key + Secret; seller OAuth code flow at auth.lazada.com; HMAC-SHA256',
    terms: { store: 'Seller (seller_id)', buyer: 'Buyer (account in session)', chat: 'Session (session_id, IM API)', message: 'Message (message_id)', order: 'Order (order_id / order_number)' },
    envVars: ['LAZADA_APP_KEY', 'LAZADA_APP_SECRET'],
    authorize: (r) => `https://auth.lazada.com/oauth/authorize?response_type=code&client_id={APP_KEY}&redirect_uri=${encodeURIComponent(r)}` },
  { key: 'tiktok', name: 'TikTok Shop', docs: 'https://partner.tiktokshop.com',
    authModel: 'App Key + Secret; shop authorization returns shop_cipher; HMAC-SHA256',
    terms: { store: 'Shop (shop_id + shop_cipher)', buyer: 'User (im_user_id)', chat: 'Conversation (conversation_id)', message: 'Message (message_id)', order: 'Order (order_id)' },
    envVars: ['TIKTOK_APP_KEY', 'TIKTOK_APP_SECRET'],
    authorize: () => 'https://services.tiktokshop.com/open/authorize?app_key={APP_KEY}' },
  { key: 'fb', name: 'Facebook / Instagram', docs: 'https://developers.facebook.com',
    authModel: 'Meta App + Facebook Login → Page Access Token; X-Hub-Signature-256',
    terms: { store: 'Page (page_id)', buyer: 'User (PSID — page-scoped)', chat: 'Conversation / thread', message: 'Message (mid)', order: 'Commerce order' },
    envVars: ['META_APP_SECRET', 'META_VERIFY_TOKEN'],
    authorize: (r) => `https://www.facebook.com/v19.0/dialog/oauth?client_id={APP_ID}&redirect_uri=${encodeURIComponent(r)}&scope=pages_messaging` },
];

app.get('/api/platforms', (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json(PLATFORM_META.map((p) => {
    const ready = p.envVars.every((v) => Boolean(c.env[v]));
    const redirect = `${origin}/api/platforms/${p.key}/oauth/callback`;
    return {
      key: p.key, name: p.name, docs: p.docs, authModel: p.authModel,
      terms: p.terms, envVars: p.envVars, ready, mode: ready ? 'live' : 'demo',
      webhookUrl: `${origin}/api/platforms/${p.key}/webhook`,
      authorizeUrl: p.authorize(redirect),
    };
  }));
});

// ---------- Store connection (OAuth "Authorize" flow) ----------
// A seller clicks Connect → we send them to the platform (or a demo consent page)
// → the platform redirects back to the callback → we create/refresh a store.
// A seller can connect ANY number of shops per platform; each authorization with a
// new shop id adds a new store, re-authorizing the same shop just refreshes it.
const UI_NAME = { shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok', fb: 'Facebook' };

function liveAuthorizeUrl(key, env, redirect, state) {
  const r = encodeURIComponent(redirect), s = encodeURIComponent(state);
  if (key === 'shopee') return `https://partner.shopeemobile.com/api/v2/shop/auth_partner?partner_id=${env.SHOPEE_PARTNER_ID}&redirect=${r}`;
  if (key === 'lazada') return `https://auth.lazada.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=${r}&client_id=${env.LAZADA_APP_KEY}&state=${s}`;
  if (key === 'tiktok') {
    // TikTok Shop seller authorization uses a SERVICE ID (from Partner Center),
    // not the app_key. Prefer a full pasted URL, then service_id, then app_key.
    if (env.TIKTOK_AUTH_URL) return `${env.TIKTOK_AUTH_URL}${env.TIKTOK_AUTH_URL.includes('?') ? '&' : '?'}state=${s}`;
    if (env.TIKTOK_SERVICE_ID) return `https://services.tiktokshop.com/open/authorize?service_id=${env.TIKTOK_SERVICE_ID}&state=${s}`;
    return `https://services.tiktokshop.com/open/authorize?app_key=${env.TIKTOK_APP_KEY}&state=${s}`;
  }
  if (key === 'fb') return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${env.META_APP_ID || ''}&redirect_uri=${r}&scope=pages_messaging,pages_manage_metadata,pages_show_list&state=${s}`;
  return null;
}

function consentPage(title, inner) {
  return `<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
    body{font-family:Inter,system-ui,sans-serif;background:#f9fafb;color:#111827;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
    .card{max-width:420px;width:100%;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;box-shadow:0 8px 30px rgba(0,0,0,.06)}
    .b{width:38px;height:38px;border-radius:10px;background:#f97316;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:20px}
    h2{font-size:18px;margin:16px 0 4px} p{color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 4px}
    label{font-size:12px;font-weight:600;color:#374151;display:block;margin:14px 0 6px}
    input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e5e7eb;border-radius:9px;font-size:14px}
    .btn{width:100%;margin-top:18px;padding:11px;border:0;border-radius:9px;background:#f97316;color:#fff;font-weight:600;font-size:14px;cursor:pointer}
    .muted{font-size:12px;color:#9ca3af;margin-top:14px;text-align:center}
    .pill{display:inline-block;background:#ffedd5;color:#c2410c;font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;margin-left:6px;vertical-align:middle}
  </style></head><body><div class="card">${inner}</div></body></html>`;
}

// Start the flow: mint signed state, return the URL to send the seller to.
app.get('/api/connect/:key/start', async (c) => {
  const seller = c.get('seller');
  const key = c.req.param('key');
  const meta = PLATFORM_META.find((p) => p.key === key);
  if (!meta) return c.json({ error: 'unknown platform' }, 400);
  const origin = new URL(c.req.url).origin;
  const redirect = `${origin}/api/platforms/${key}/oauth/callback`;
  const state = await signState(c.env.SUPABASE_SERVICE_KEY, { sid: seller.id, key, iat: Date.now() });
  const live = meta.envVars.every((v) => Boolean(c.env[v]));
  const url = live
    ? liveAuthorizeUrl(key, c.env, redirect, state)
    : `${origin}/api/platforms/${key}/oauth/mock?state=${encodeURIComponent(state)}`;
  return c.json({ url, mode: live ? 'live' : 'demo', platform: UI_NAME[key] || meta.name });
});

// Demo consent page (stands in for the platform's own login screen until live keys are set).
app.get('/api/platforms/:key/oauth/mock', (c) => {
  const key = c.req.param('key');
  const meta = PLATFORM_META.find((p) => p.key === key);
  if (!meta) return c.text('Unknown platform', 404);
  const state = c.req.query('state') || '';
  const name = UI_NAME[key] || meta.name;
  const action = `${new URL(c.req.url).origin}/api/platforms/${key}/oauth/callback`;
  return c.html(consentPage(`Authorize ${name}`, `
    <div class="b">⚡</div>
    <h2>Authorize BilisOps Chat<span class="pill">DEMO</span></h2>
    <p><b>BilisOps Chat</b> is requesting permission to manage buyer messages for your <b>${name}</b> shop.</p>
    <p>In live mode, ${name} shows its own login &amp; consent screen here.</p>
    <form method="GET" action="${action}">
      <input type="hidden" name="state" value="${state}">
      <input type="hidden" name="demo" value="1">
      <input type="hidden" name="shop_id" value="demo-${randHex(4)}">
      <label>Name this shop</label>
      <input name="shop_name" placeholder="e.g. ${name} Main Store" required autofocus>
      <button class="btn" type="submit">Authorize &amp; connect</button>
    </form>
    <div class="muted">Connecting several ${name} shops? Repeat this for each one.</div>
  `));
});

async function exchangeTikTok(env, code) {
  const url = 'https://auth.tiktok-shops.com/api/v2/token/get'
    + `?app_key=${encodeURIComponent(env.TIKTOK_APP_KEY)}&app_secret=${encodeURIComponent(env.TIKTOK_APP_SECRET)}`
    + `&auth_code=${encodeURIComponent(code)}&grant_type=authorized_code`;
  const d = await fetch(url).then((r) => r.json()).catch(() => null);
  if (d && d.data && d.data.access_token) {
    return {
      shopName: d.data.seller_name || 'TikTok Shop',
      shopId: String(d.data.open_id || d.data.seller_name || randHex(6)),
      tokens: { access_token: d.data.access_token, refresh_token: d.data.refresh_token, expiresIn: d.data.access_token_expire_in },
    };
  }
  return null;
}

// Callback: the platform (or demo page) redirects here. Verify state → create/refresh store.
app.get('/api/platforms/:key/oauth/callback', async (c) => {
  const key = c.req.param('key');
  const meta = PLATFORM_META.find((p) => p.key === key);
  const fail = (msg) => c.html(consentPage('Authorization failed',
    `<div class="b">⚡</div><h2>Couldn't connect</h2><p>${msg}</p><p style="margin-top:10px"><a href="/">Return to BilisOps Chat</a></p>`), 400);
  if (!meta) return fail('Unknown platform.');
  const q = c.req.query();
  const payload = await verifyState(c.env.SUPABASE_SERVICE_KEY, q.state);
  if (!payload || payload.key !== key) return fail('This authorization link expired. Go back and click Connect again.');

  const sellerId = payload.sid;
  const sb = sbFrom(c);
  const live = meta.envVars.every((v) => Boolean(c.env[v]));

  const code = q.code || q.auth_code || q.authorization_code;
  let shopName, shopId, tokens = null;
  if (live && !q.demo) {
    let res = null;
    if (key === 'tiktok' && code) res = await exchangeTikTok(c.env, code).catch(() => null);
    // Shopee / Lazada / Meta token exchange slot in here as each goes live.
    if (res) { shopName = res.shopName; shopId = res.shopId; tokens = res.tokens; }
    else { shopName = `${UI_NAME[key]} Shop`; shopId = String(q.shop_id || q.shop_cipher || randHex(6)); }
  } else {
    shopName = String(q.shop_name || `${UI_NAME[key]} Shop`).slice(0, 80);
    shopId = String(q.shop_id || `demo-${randHex(4)}`);
  }

  const { data: rows } = await sb.from('stores').select('data').eq('seller_id', sellerId);
  let store = (rows || []).map((r) => r.data).find((s) => s.key === key && s.externalId === shopId);
  const now = new Date().toISOString();
  if (store) {
    store.name = shopName; store.authorizedAt = now; if (tokens) store.tokens = tokens;
  } else {
    const expires = new Date(); expires.setFullYear(expires.getFullYear() + 1);
    store = {
      id: id('str'), sellerId, platform: UI_NAME[key] || meta.name, key,
      name: shopName, site: 'PH', externalId: shopId, storeToken: randHex(16),
      tokens: tokens || null, authorizedAt: now, expiresAt: expires.toISOString(),
    };
  }
  await w(sb.from('stores').upsert({ id: store.id, seller_id: sellerId, data: store }));
  // TikTok: resolve shop_cipher + real shop_id right away (best-effort — the
  // chat sync also repairs this lazily if it fails here).
  if (key === 'tiktok' && tokens) {
    if (/^SANDBOX/i.test(store.name)) store.sandbox = true;
    await ttEnsureShop(c.env, sb, store).catch(() => {});
  }
  return c.redirect(`/?connected=${key}&shop=${encodeURIComponent(store.name)}`, 302);
});

// ---------- TikTok chat PULL sync (signed Shop API) ----------
// Webhooks push new messages in real time, but existing conversations must be
// PULLED from the TikTok customer-service API. Signing scheme (same as OMS):
//   plain = app_secret + path + (sorted key+value pairs, excl. sign/access_token) + app_secret
//   sign  = HMAC-SHA256(plain, app_secret) → lowercase hex
// Access token rides in the x-tts-access-token header; shop_cipher as a param.
const TT_PROD = 'https://open-api.tiktokglobalshop.com';
const TT_SANDBOX = 'https://open-api-sandbox.tiktokglobalshop.com';

async function ttFetch(env, store, path, extraQuery = {}, rawBody = null) {
  const params = {
    app_key: env.TIKTOK_APP_KEY,
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...(store.shopCipher ? { shop_cipher: store.shopCipher } : {}),
    ...extraQuery,
  };
  const plain = env.TIKTOK_APP_SECRET + path
    + Object.keys(params).sort().map((k) => k + params[k]).join('')
    + (rawBody || '')
    + env.TIKTOK_APP_SECRET;
  const sign = await hmacHex(env.TIKTOK_APP_SECRET, plain);
  const qs = new URLSearchParams({ ...params, sign }).toString();
  const base = store.sandbox ? TT_SANDBOX : TT_PROD;
  return fetch(`${base}${path}?${qs}`, {
    method: rawBody ? 'POST' : 'GET',
    headers: { 'x-tts-access-token': store.tokens.access_token, 'content-type': 'application/json' },
    body: rawBody || undefined,
  }).then((r) => r.json()).catch((e) => ({ code: -1, message: String(e && e.message || e) }));
}

// Send a seller reply out to the TikTok buyer (conversation id = conv.buyerExternalId).
async function ttSendMessage(env, sb, store, conv, text) {
  await ttEnsureShop(env, sb, store);
  const body = JSON.stringify({ type: 'TEXT', content: JSON.stringify({ content: text }) });
  const res = await ttFetch(env, store, `/customer_service/202309/conversations/${conv.buyerExternalId}/messages`, {}, body);
  if (res?.code !== 0) throw new Error(res?.message || `send failed (${res?.code})`);
}

// Resolve shop_cipher (+ real shop id/name) once after authorization. Sandbox
// shops only answer on the sandbox host — detect by trying both.
async function ttEnsureShop(env, sb, store) {
  if (store.shopCipher) return store;
  let res = await ttFetch(env, store, '/authorization/202309/shops');
  if (res?.code !== 0 && !store.sandbox) {
    const trySandbox = await ttFetch(env, { ...store, sandbox: true }, '/authorization/202309/shops');
    if (trySandbox?.code === 0) { store.sandbox = true; res = trySandbox; }
  }
  const shop = res?.data?.shops && res.data.shops[0];
  if (!shop) throw new Error(res?.message || 'could not fetch authorized shop');
  store.shopCipher = shop.cipher;
  if (shop.id) store.externalId = String(shop.id);      // webhooks route by shop_id
  if (shop.name) store.name = shop.name;
  store.region = shop.region || store.region || null;
  await w(sb.from('stores').upsert({ id: store.id, seller_id: store.sellerId, data: store }));
  return store;
}

function ttMessageText(m) {
  let t = '';
  try { const j = JSON.parse(m.content || '{}'); t = j.content || j.text || ''; }
  catch { t = String(m.content || ''); }
  if (!t && m.type && m.type !== 'TEXT') t = `[${String(m.type).toLowerCase()}]`;
  return t;
}

async function ttSyncChats(env, sb, store) {
  await ttEnsureShop(env, sb, store);
  const convRes = await ttFetch(env, store, '/customer_service/202309/conversations', { page_size: '10' });
  if (convRes?.code !== 0) throw new Error(convRes?.message || `conversations failed (${convRes?.code})`);
  const list = convRes.data?.conversations || [];

  const { data: rows } = await sb.from('conversations').select('data').eq('seller_id', store.sellerId);
  const existing = (rows || []).map((r) => r.data);

  for (const cv of list) {
    const msgRes = await ttFetch(env, store, `/customer_service/202309/conversations/${cv.id}/messages`, { page_size: '10' });
    if (msgRes?.code !== 0) continue;
    const buyer = (cv.participants || []).find((p) => (p.role || '').toUpperCase() === 'BUYER') || {};
    let conv = existing.find((x) => x.storeId === store.id && x.buyerExternalId === String(cv.id));
    if (!conv) {
      conv = {
        id: id('cnv'), sellerId: store.sellerId, storeId: store.id, platform: store.key,
        buyerName: buyer.nickname || 'TikTok User', buyerExternalId: String(cv.id),
        preview: '', unread: false, resolved: false, test: false,
        updatedAt: new Date().toISOString(), messages: [],
      };
      existing.push(conv);
    }
    if (buyer.nickname) conv.buyerName = buyer.nickname;
    const seen = new Set(conv.messages.map((m) => m.extId).filter(Boolean));
    let added = 0;
    const incoming = (msgRes.data?.messages || [])
      .filter((m) => (m.type || 'TEXT') !== 'SYSTEM')
      .map((m) => ({
        extId: String(m.id || ''),
        direction: ((m.sender && m.sender.role) || '').toUpperCase() === 'BUYER' ? 'in' : 'out',
        text: ttMessageText(m),
        at: m.create_time ? new Date(Number(m.create_time) * 1000).toISOString() : new Date().toISOString(),
      }))
      .filter((m) => m.text && !seen.has(m.extId));
    if (incoming.length) {
      conv.messages = conv.messages.concat(incoming).sort((a, b) => (a.at < b.at ? -1 : 1));
      added = incoming.length;
    }
    if (conv.messages.length) {
      const last = conv.messages[conv.messages.length - 1];
      conv.preview = last.text;
      conv.updatedAt = last.at;
      if (added && last.direction === 'in') conv.unread = true;
    }
    await w(sb.from('conversations').upsert({ id: conv.id, seller_id: conv.sellerId, updated_at: conv.updatedAt, data: conv }));
  }

  store.lastChatSyncAt = new Date().toISOString();
  store.lastChatSyncError = null;
  await w(sb.from('stores').upsert({ id: store.id, seller_id: store.sellerId, data: store }));
}

// Throttled: at most one pull per store per minute, piggybacked on inbox reads.
async function maybeSyncTikTok(c, sb, sellerId) {
  if (!c.env.TIKTOK_APP_KEY || !c.env.TIKTOK_APP_SECRET) return;
  const { data } = await sb.from('stores').select('data').eq('seller_id', sellerId);
  for (const r of data || []) {
    const store = r.data;
    if (store.key !== 'tiktok' || !store.tokens || !store.tokens.access_token) continue;
    const last = store.lastChatSyncAt ? Date.parse(store.lastChatSyncAt) : 0;
    if (Date.now() - last < 60 * 1000) continue;
    try {
      await ttSyncChats(c.env, sb, store);
    } catch (e) {
      store.lastChatSyncAt = new Date().toISOString();
      store.lastChatSyncError = String(e && e.message || e).slice(0, 300);
      await sb.from('stores').upsert({ id: store.id, seller_id: store.sellerId, data: store });
    }
  }
}

// ---------- Platform webhooks: normalize every marketplace into ONE model ----------
// Each platform names & shapes things differently. These translate the native
// push payload into the canonical message { externalShopId, buyerExternalId,
// buyerName, text, sentAt } or order { externalShopId, orderRef, status, amount, at }
// that the unified inbox and dashboards consume.
const NORMALIZE = {
  // Shopee — buyer=buyer_user_id, chat=conversation_id, order=order_sn
  shopee: {
    message(body) {
      const c = body && body.data && body.data.content;
      if (!c || body.data.type !== 'message') return null;
      const text = c.message_type === 'text' ? (c.content && c.content.text) : `[${c.message_type || 'attachment'}]`;
      if (!text) return null;
      return {
        externalShopId: String(body.shop_id || ''),
        buyerExternalId: String(c.from_id || ''),
        buyerName: c.from_user_name || `Buyer ${c.from_id || ''}`.trim(),
        text,
        sentAt: c.created_timestamp ? new Date(c.created_timestamp * 1000).toISOString() : new Date().toISOString(),
      };
    },
    order(body) {
      const d = body && body.data;
      if (!d || !d.ordersn || d.type === 'message') return null;
      return {
        externalShopId: String(body.shop_id || ''),
        orderRef: String(d.ordersn),
        status: String(d.status || 'UNKNOWN').toUpperCase(),
        amount: d.total_amount != null ? Number(d.total_amount) : null,
        at: d.update_time ? new Date(d.update_time * 1000).toISOString() : new Date().toISOString(),
      };
    },
  },
  // Lazada — chat unit=SESSION (session_id), content is JSON string, buyer=from_account_type 1
  lazada: {
    message(body) {
      const d = body && body.data;
      if (!d) return null;
      if (d.from_account_type && Number(d.from_account_type) !== 1) return null;
      let text = '';
      try { text = JSON.parse(d.content || '{}').txt || ''; } catch { text = String(d.content || ''); }
      if (!text) return null;
      return {
        externalShopId: String(body.seller_id || ''),
        buyerExternalId: String(d.session_id || ''),
        buyerName: d.sender_nick || 'Lazada Buyer',
        text,
        sentAt: d.send_time ? new Date(Number(d.send_time)).toISOString() : new Date().toISOString(),
      };
    },
    order(body) {
      const d = body && body.data;
      const ref = d && (d.trade_order_id || d.order_id);
      if (!ref) return null;
      return {
        externalShopId: String(body.seller_id || ''),
        orderRef: String(ref),
        status: String(d.order_status || (Array.isArray(d.statuses) ? d.statuses[0] : '') || 'UNKNOWN').toUpperCase(),
        amount: d.price != null ? Number(d.price) : null,
        at: d.update_time ? new Date(Number(d.update_time)).toISOString() : new Date().toISOString(),
      };
    },
  },
  // TikTok Shop — buyer is called "USER" (im_user_id); role must be BUYER
  tiktok: {
    message(body) {
      const d = body && body.data;
      if (!d || (d.sender && d.sender.role && d.sender.role !== 'BUYER')) return null;
      const text = (d.content && (d.content.text || d.content.content)) || '';
      if (!text) return null;
      return {
        externalShopId: String(body.shop_id || ''),
        // Key by conversation_id (same key the pull-sync uses) so webhook pushes
        // and API pulls land in ONE conversation instead of duplicating.
        buyerExternalId: String(d.conversation_id || (d.sender && d.sender.im_user_id) || ''),
        buyerName: (d.sender && d.sender.nickname) || 'TikTok User',
        text,
        sentAt: d.create_time ? new Date(Number(d.create_time) * 1000).toISOString() : new Date().toISOString(),
      };
    },
    order(body) {
      const d = body && body.data;
      if (!d || !d.order_id || !String(body.type || '').includes('ORDER')) return null;
      return {
        externalShopId: String(body.shop_id || ''),
        orderRef: String(d.order_id),
        status: String(d.order_status || 'UNKNOWN').toUpperCase(),
        amount: d.payment && d.payment.total_amount != null ? Number(d.payment.total_amount) : null,
        at: d.update_time ? new Date(Number(d.update_time) * 1000).toISOString() : new Date().toISOString(),
      };
    },
  },
  // Meta (Messenger/Instagram) — page=page_id, buyer=PSID (opaque), message=mid
  fb: {
    message(body) {
      if (body.object !== 'page' && body.object !== 'instagram') return null;
      const entry = body.entry && body.entry[0];
      const msg = entry && entry.messaging && entry.messaging[0];
      if (!msg || !msg.message || !msg.message.text) return null;
      return {
        externalShopId: String(entry.id || ''),
        buyerExternalId: String((msg.sender && msg.sender.id) || ''),
        buyerName: `User ${String((msg.sender && msg.sender.id) || '').slice(-4)}`,
        text: msg.message.text,
        sentAt: msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString(),
      };
    },
  },
};

// Per-platform signature verification (demo mode accepts unsigned until keys are set).
async function verifyWebhook(key, env, headers, rawBody, fullUrl) {
  const has = (vars) => vars.every((v) => Boolean(env[v]));
  if (key === 'shopee') {
    if (!has(['SHOPEE_PARTNER_ID', 'SHOPEE_PARTNER_KEY'])) return { ok: true, mode: 'demo' };
    return { ok: eq(headers.authorization || '', await hmacHex(env.SHOPEE_PARTNER_KEY, `${fullUrl}|${rawBody}`)), mode: 'live' };
  }
  if (key === 'lazada') {
    if (!has(['LAZADA_APP_KEY', 'LAZADA_APP_SECRET'])) return { ok: true, mode: 'demo' };
    return { ok: eq(headers.authorization || '', await hmacHex(env.LAZADA_APP_SECRET, rawBody)), mode: 'live' };
  }
  if (key === 'tiktok') {
    if (!has(['TIKTOK_APP_KEY', 'TIKTOK_APP_SECRET'])) return { ok: true, mode: 'demo' };
    return { ok: eq(headers.authorization || '', await hmacHex(env.TIKTOK_APP_SECRET, `${env.TIKTOK_APP_KEY}${rawBody}`)), mode: 'live' };
  }
  if (key === 'fb') {
    if (!has(['META_APP_SECRET'])) return { ok: true, mode: 'demo' };
    return { ok: eq(headers['x-hub-signature-256'] || '', `sha256=${await hmacHex(env.META_APP_SECRET, rawBody)}`), mode: 'live' };
  }
  return { ok: false, mode: 'unknown' };
}

// Route an incoming webhook to the right connected shop (by platform + shop id),
// falling back to the first shop of that platform.
async function findStoreByShop(sb, key, shopId) {
  if (shopId) {
    const { data } = await sb.from('stores').select('data').eq('data->>key', key).eq('data->>externalId', String(shopId)).limit(1);
    if (data && data.length) return data[0].data;
  }
  const { data } = await sb.from('stores').select('data').eq('data->>key', key).limit(1);
  return data && data.length ? data[0].data : null;
}

// Meta webhook GET verification (hub.challenge handshake).
app.get('/api/platforms/fb/webhook', (c) => {
  const verifyToken = c.env.META_VERIFY_TOKEN || 'bilisops';
  if (c.req.query('hub.mode') === 'subscribe' && c.req.query('hub.verify_token') === verifyToken) {
    return c.text(c.req.query('hub.challenge') || '');
  }
  return c.text('verification failed', 403);
});

// Native platform webhook → canonical model → unified inbox / dashboards.
app.post('/api/platforms/:key/webhook', async (c) => {
  const key = c.req.param('key');
  const norm = NORMALIZE[key];
  if (!norm) return c.json({ error: 'unknown platform' }, 404);
  const rawBody = await c.req.text();
  const check = await verifyWebhook(key, c.env, {
    authorization: c.req.header('authorization'),
    'x-hub-signature-256': c.req.header('x-hub-signature-256'),
  }, rawBody, c.req.url);
  if (!check.ok) return c.json({ error: 'invalid signature' }, 401);
  let body; try { body = JSON.parse(rawBody || '{}'); } catch { body = {}; }
  const sb = sbFrom(c);

  const msg = norm.message ? norm.message(body) : null;
  if (msg) {
    const store = await findStoreByShop(sb, key, msg.externalShopId);
    if (!store) return c.json({ error: 'no_store', message: `No connected ${key} shop` }, 404);
    const conv = await deliverBuyerMessage(sb, store, msg.buyerName, msg.text, msg.buyerExternalId);
    return c.json({ ok: true, kind: 'message', mode: check.mode, conversationId: conv.id });
  }
  const evt = norm.order ? norm.order(body) : null;
  if (evt) {
    const store = await findStoreByShop(sb, key, evt.externalShopId);
    if (!store) return c.json({ error: 'no_store' }, 404);
    const order = await deliverOrderEvent(sb, store, evt);
    return c.json({ ok: true, kind: 'order', mode: check.mode, orderId: order.id, status: order.status });
  }
  return c.json({ ok: true, ignored: 'not a chat or order event' });
});

// ---------- orders + stats ----------
app.get('/api/orders', async (c) => {
  const seller = c.get('seller');
  const { data } = await c.get('sb').from('orders').select('data').eq('seller_id', seller.id);
  return c.json((data || []).map((r) => { const { sellerId, ...pub } = r.data; return pub; }));
});

const isCancelled = (s) => /CANCEL/i.test(s || '');

app.get('/api/stats', async (c) => {
  const seller = c.get('seller');
  const sb = c.get('sb');
  const days = Math.min(90, Math.max(1, Number(c.req.query('days')) || 90));
  const [{ data: cr }, { data: or }, { data: sr }] = await Promise.all([
    sb.from('conversations').select('data').eq('seller_id', seller.id),
    sb.from('orders').select('data').eq('seller_id', seller.id),
    sb.from('stores').select('data').eq('seller_id', seller.id),
  ]);
  const convs = (cr || []).map((r) => r.data);
  const orders = (or || []).map((r) => r.data);
  const stores = (sr || []).map((r) => r.data);

  const daily = []; const index = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    index[key] = daily.length;
    daily.push({ date: key, inquiries: 0, replies: 0, orders: 0, cancelled: 0, amount: 0 });
  }
  const bucket = (iso) => daily[index[String(iso).slice(0, 10)]];

  const firstResponseMins = [];
  convs.forEach((cv) => {
    const firstIn = cv.messages.find((m) => m.direction === 'in');
    if (firstIn) {
      const b = bucket(firstIn.at); if (b) b.inquiries++;
      const firstOut = cv.messages.find((m) => m.direction === 'out' && m.at >= firstIn.at);
      if (firstOut) firstResponseMins.push((new Date(firstOut.at) - new Date(firstIn.at)) / 60000);
    }
    cv.messages.forEach((m) => { if (m.direction === 'out') { const b = bucket(m.at); if (b) b.replies++; } });
  });
  orders.forEach((o) => {
    const b = bucket(o.at);
    if (b) { b.orders++; if (o.amount) b.amount += o.amount; if (isCancelled(o.status)) b.cancelled++; }
  });

  const replied = convs.filter((cv) => cv.messages.some((m) => m.direction === 'out')).length;
  const cancelled = orders.filter((o) => isCancelled(o.status));
  const amount = orders.reduce((s, o) => s + (o.amount || 0), 0);
  const avgFirst = firstResponseMins.length
    ? firstResponseMins.reduce((s, v) => s + v, 0) / firstResponseMins.length : null;

  return c.json({
    daily,
    totals: {
      conversations: convs.length, replied,
      responseRatePct: convs.length ? Math.round((replied / convs.length) * 100) : null,
      avgFirstResponseMin: avgFirst != null ? Math.round(avgFirst * 10) / 10 : null,
      resolved: convs.filter((cv) => cv.resolved).length,
      orders: orders.length, cancelled: cancelled.length,
      lossRatePct: orders.length ? Math.round((cancelled.length / orders.length) * 1000) / 10 : null,
      amount: Math.round(amount * 100) / 100,
      cancelledAmount: Math.round(cancelled.reduce((s, o) => s + (o.amount || 0), 0) * 100) / 100,
      conversionPct: convs.length ? Math.round((orders.length / convs.length) * 1000) / 10 : null,
    },
    perStore: stores.map((s) => ({
      storeId: s.id, name: s.name, platform: s.platform,
      conversations: convs.filter((cv) => cv.storeId === s.id).length,
      replied: convs.filter((cv) => cv.storeId === s.id && cv.messages.some((m) => m.direction === 'out')).length,
      orders: orders.filter((o) => o.storeId === s.id).length,
      amount: Math.round(orders.filter((o) => o.storeId === s.id).reduce((sm, o) => sm + (o.amount || 0), 0) * 100) / 100,
    })),
  });
});

// ---------- shared delivery helpers ----------
async function deliverBuyerMessage(sb, store, buyerName, text, buyerExternalId) {
  const { data: rows } = await sb.from('conversations').select('data').eq('seller_id', store.sellerId);
  let conv = (rows || []).map((r) => r.data).find((cv) =>
    cv.storeId === store.id && !cv.resolved &&
    (buyerExternalId ? cv.buyerExternalId === buyerExternalId : cv.buyerName === buyerName));
  const now = new Date().toISOString();
  if (!conv) {
    conv = {
      id: id('cnv'), sellerId: store.sellerId, storeId: store.id, platform: store.key,
      buyerName, buyerExternalId: buyerExternalId || null, preview: '',
      unread: true, resolved: false, test: !buyerExternalId, updatedAt: now, messages: [],
    };
  }
  conv.messages.push({ direction: 'in', text, at: now });
  conv.preview = text; conv.unread = true; conv.updatedAt = now;
  await w(sb.from('conversations').upsert({ id: conv.id, seller_id: conv.sellerId, updated_at: now, data: conv }));
  return conv;
}

async function deliverOrderEvent(sb, store, evt) {
  const { data: rows } = await sb.from('orders').select('data').eq('seller_id', store.sellerId);
  let order = (rows || []).map((r) => r.data).find((o) => o.storeId === store.id && o.orderRef === evt.orderRef);
  if (order) {
    order.status = evt.status; if (evt.amount != null) order.amount = evt.amount; order.at = evt.at;
  } else {
    order = {
      id: id('ord'), sellerId: store.sellerId, storeId: store.id, platform: store.key,
      orderRef: evt.orderRef, status: evt.status, amount: evt.amount, at: evt.at,
    };
  }
  await w(sb.from('orders').upsert({ id: order.id, seller_id: order.sellerId, data: order }));
  return order;
}

// ---------- dev simulators ----------
const TEST_STATUSES = ['UNPAID', 'TO_SHIP', 'SHIPPED', 'COMPLETED', 'CANCELLED'];
const TEST_QUESTIONS = [
  'Hi po, available pa ba ito?', 'Do you ship to Cebu?', 'Pwede po ba palitan ang address ko?',
  'Is this available in size L?', 'Can I get a discount for bulk orders?', 'When will my order arrive po?',
];
const TEST_BUYERS = ['Maricel C.', 'John R.', 'Angel S.', 'Mark V.', 'Kristine U.', 'Paolo G.'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function sellerStores(sb, sellerId) {
  const { data } = await sb.from('stores').select('data').eq('seller_id', sellerId);
  return (data || []).map((r) => r.data);
}

app.post('/api/dev/simulate', async (c) => {
  const seller = c.get('seller'); const sb = c.get('sb');
  const stores = await sellerStores(sb, seller.id);
  if (!stores.length) return c.json({ error: 'no_stores', message: 'Authorize a store first' }, 400);
  const store = pick(stores);
  const conv = await deliverBuyerMessage(sb, store, pick(TEST_BUYERS), pick(TEST_QUESTIONS));
  return c.json({ ok: true, platform: store.platform, conversationId: conv.id });
});

app.post('/api/dev/simulate-order', async (c) => {
  const seller = c.get('seller'); const sb = c.get('sb');
  const stores = await sellerStores(sb, seller.id);
  if (!stores.length) return c.json({ error: 'no_stores', message: 'Authorize a store first' }, 400);
  const store = pick(stores);
  const order = await deliverOrderEvent(sb, store, {
    orderRef: `TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    status: pick(TEST_STATUSES),
    amount: Math.round((99 + Math.random() * 1900) * 100) / 100,
    at: new Date().toISOString(),
  });
  return c.json({ ok: true, platform: store.platform, orderRef: order.orderRef, status: order.status, amount: order.amount });
});

// ---------- conversations ----------
async function ownConv(c, sb) {
  const seller = c.get('seller');
  const { data } = await sb.from('conversations').select('data').eq('id', c.req.param('id'))
    .eq('seller_id', seller.id).maybeSingle();
  return data ? data.data : null;
}

app.get('/api/conversations', async (c) => {
  const seller = c.get('seller');
  const sb = c.get('sb');
  // Pull fresh TikTok chats (throttled to once/min per store) before answering.
  await maybeSyncTikTok(c, sb, seller.id).catch(() => {});
  const { data } = await sb.from('conversations').select('data')
    .eq('seller_id', seller.id).order('updated_at', { ascending: false });
  return c.json((data || []).map((r) => { const { sellerId, ...pub } = r.data; return pub; }));
});

app.post('/api/conversations/:id/reply', async (c) => {
  const sb = c.get('sb');
  const conv = await ownConv(c, sb);
  if (!conv) return c.json({ error: 'not_found' }, 404);
  const text = String((await c.req.json().catch(() => ({})))?.text || '').trim().slice(0, 2000);
  if (!text) return c.json({ error: 'text required' }, 400);
  const now = new Date().toISOString();
  conv.messages.push({ direction: 'out', text, at: now });
  conv.preview = text; conv.updatedAt = now;

  // Best-effort outbound: push the reply to the real platform when connected.
  let delivered = null;
  if (conv.platform === 'tiktok' && c.env.TIKTOK_APP_KEY && c.env.TIKTOK_APP_SECRET) {
    const { data: sr } = await sb.from('stores').select('data').eq('id', conv.storeId).maybeSingle();
    const store = sr && sr.data;
    if (store && store.tokens && store.tokens.access_token && !conv.test) {
      try {
        await ttSendMessage(c.env, sb, store, conv, text);
        delivered = true;
        conv.lastSendError = null;
      } catch (e) {
        delivered = false;
        conv.lastSendError = String(e && e.message || e).slice(0, 300);
      }
    }
  }

  await w(sb.from('conversations').update({ updated_at: now, data: conv }).eq('id', conv.id));
  return c.json({ ok: true, delivered });
});

app.post('/api/conversations/:id/read', async (c) => {
  const sb = c.get('sb');
  const conv = await ownConv(c, sb);
  if (!conv) return c.json({ error: 'not_found' }, 404);
  conv.unread = false;
  await w(sb.from('conversations').update({ data: conv }).eq('id', conv.id));
  return c.json({ ok: true });
});

app.post('/api/conversations/:id/resolve', async (c) => {
  const sb = c.get('sb');
  const conv = await ownConv(c, sb);
  if (!conv) return c.json({ error: 'not_found' }, 404);
  conv.resolved = Boolean((await c.req.json().catch(() => ({})))?.resolved);
  await w(sb.from('conversations').update({ data: conv }).eq('id', conv.id));
  return c.json({ ok: true, resolved: conv.resolved });
});

// ---------- knowledge pack ----------
app.get('/api/knowledge', async (c) => {
  const seller = c.get('seller');
  const { data } = await c.get('sb').from('knowledge').select('text').eq('seller_id', seller.id).maybeSingle();
  return c.json({ text: (data && data.text) || '' });
});

app.put('/api/knowledge', async (c) => {
  const seller = c.get('seller');
  const text = String((await c.req.json().catch(() => ({})))?.text || '').slice(0, 20000);
  await w(c.get('sb').from('knowledge').upsert({ seller_id: seller.id, text }));
  return c.json({ ok: true });
});

// ---------- Per-store knowledge pack (each shop has its own facts) ----------
app.get('/api/stores/:id/knowledge', async (c) => {
  const seller = c.get('seller');
  const { data } = await c.get('sb').from('stores').select('data')
    .eq('id', c.req.param('id')).eq('seller_id', seller.id).maybeSingle();
  if (!data) return c.json({ error: 'not_found' }, 404);
  return c.json({ text: data.data.knowledge || '' });
});

app.put('/api/stores/:id/knowledge', async (c) => {
  const seller = c.get('seller');
  const sb = c.get('sb');
  const { data } = await sb.from('stores').select('data')
    .eq('id', c.req.param('id')).eq('seller_id', seller.id).maybeSingle();
  if (!data) return c.json({ error: 'not_found' }, 404);
  const store = data.data;
  store.knowledge = String((await c.req.json().catch(() => ({})))?.text || '').slice(0, 20000);
  await w(sb.from('stores').upsert({ id: store.id, seller_id: seller.id, data: store }));
  return c.json({ ok: true });
});

// ---------- AI config: product catalog + seller rules (feeds every draft) ----------
const clampStr = (s, n) => String(s ?? '').slice(0, n);
const STOCK_VALUES = new Set(['in', 'low', 'out', 'preorder']);

function sanitizeProducts(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, 60).map((p) => ({
    id: clampStr(p.id, 24) || id('prd'),
    name: clampStr(p.name, 80),
    price: clampStr(p.price, 60),
    variants: clampStr(p.variants, 140),
    stock: STOCK_VALUES.has(p.stock) ? p.stock : 'in',
    promo: clampStr(p.promo, 140),
    notes: clampStr(p.notes, 240),
    active: p.active !== false,
  })).filter((p) => p.name);
}

function sanitizeRules(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, 30).map((r) => ({
    id: clampStr(r.id, 24) || id('rul'),
    title: clampStr(r.title, 90),
    detail: clampStr(r.detail, 500),
    active: r.active !== false,
  })).filter((r) => r.title);
}

app.get('/api/ai/config', (c) => {
  const seller = c.get('seller');
  return c.json({ products: seller.aiProducts || [], rules: seller.aiRules || [] });
});

app.put('/api/ai/config', async (c) => {
  const seller = c.get('seller');
  const sb = c.get('sb');
  const body = (await c.req.json().catch(() => ({}))) || {};
  const { data: row } = await sb.from('sellers').select('data').eq('id', seller.id).maybeSingle();
  if (!row) return c.json({ error: 'not_found' }, 404);
  const fresh = row.data;
  const products = sanitizeProducts(body.products);
  const rules = sanitizeRules(body.rules);
  if (products) fresh.aiProducts = products;
  if (rules) fresh.aiRules = rules;
  await w(sb.from('sellers').update({ data: fresh }).eq('id', seller.id));
  return c.json({ products: fresh.aiProducts || [], rules: fresh.aiRules || [] });
});

const STOCK_LABEL = { in: 'in stock', low: 'low stock', out: 'OUT OF STOCK', preorder: 'pre-order' };

function productCatalogPrompt(products) {
  const act = (products || []).filter((p) => p.active);
  if (!act.length) return '';
  const lines = act.map((p) => {
    let l = p.name;
    if (p.price) l += ` — ${p.price}`;
    if (p.variants) l += `; variants: ${p.variants}`;
    l += `; ${STOCK_LABEL[p.stock] || 'in stock'}`;
    if (p.promo) l += `; promo: ${p.promo}`;
    if (p.notes) l += `; ${p.notes}`;
    return `- ${l}`;
  });
  return `<product_catalog>\n${lines.join('\n')}\n</product_catalog>\n` +
    'When the buyer asks about a product, answer ONLY from the product catalog (price, variants, stock, promos). ' +
    'If a product is OUT OF STOCK, say so and suggest an in-stock alternative from the catalog. ' +
    'If the product is not in the catalog, say you will check and follow up.';
}

function sellerRulesPrompt(rules) {
  const act = (rules || []).filter((r) => r.active);
  if (!act.length) return '';
  const lines = act.map((r, i) => `${i + 1}. ${r.title}${r.detail ? ` — ${r.detail}` : ''}`);
  return `<seller_rules>\n${lines.join('\n')}\n</seller_rules>\n` +
    'You MUST follow every seller rule above in every reply, without exception.';
}

// ---------- AI draft (DeepSeek/Claude via REST, template fallback) ----------
function templateDraft(t0) {
  const t = (t0 || '').toLowerCase();
  if (/(ship|deliver|arrive|cebu|davao|luzon)/.test(t)) return 'Hi po! Yes, we ship nationwide 🚚 Orders are handed to the courier within 24 hours. Salamat po!';
  if (/(available|stock|size|color)/.test(t)) return "Hi po! Let me check that for you — it should be in stock. I'll confirm the exact variant right away. Salamat sa pag-message! 😊";
  if (/(discount|bulk|wholesale|price)/.test(t)) return 'Hi po! For bulk orders we can definitely work something out — how many pieces are you looking at? 😊';
  if (/(address|change|palit)/.test(t)) return "Hi po! No problem — please send the updated address and we'll change it before the parcel ships. 🙏";
  return "Hi po! Thanks for reaching out — we'll get back to you with the details right away. Salamat! 😊";
}

app.post('/api/ai/draft', async (c) => {
  const seller = c.get('seller'); const sb = c.get('sb');
  const body = (await c.req.json().catch(() => ({}))) || {};
  const { data: row } = await sb.from('conversations').select('data')
    .eq('id', body.conversationId).eq('seller_id', seller.id).maybeSingle();
  if (!row) return c.json({ error: 'not_found' }, 404);
  const conv = row.data;
  const lastIn = [...conv.messages].reverse().find((m) => m.direction === 'in');
  if (!lastIn) return c.json({ error: 'no_buyer_message' }, 400);

  const fallback = () => c.json({
    draft: templateDraft(lastIn.text), engine: 'template',
    note: 'Add DEEPSEEK_API_KEY (or ANTHROPIC_API_KEY) on the server to enable real AI replies.',
  });
  const hasDeepSeek = Boolean(c.env.DEEPSEEK_API_KEY);
  const hasClaude = Boolean(c.env.ANTHROPIC_API_KEY);
  if (!hasDeepSeek && !hasClaude) return fallback();

  try {
    // Knowledge = this shop's own pack first, then account-wide facts.
    const { data: kr } = await sb.from('knowledge').select('text').eq('seller_id', seller.id).maybeSingle();
    const { data: str } = await sb.from('stores').select('data').eq('id', conv.storeId).maybeSingle();
    const convStore = str && str.data;
    const knowledge = [
      convStore && convStore.knowledge
        ? `Shop-specific facts for "${convStore.name}" (${convStore.platform}):\n${convStore.knowledge}` : '',
      kr && kr.text ? `Account-wide facts (all shops):\n${kr.text}` : '',
    ].filter(Boolean).join('\n\n') || '(no knowledge pack yet)';
    const catalogSection = productCatalogPrompt(seller.aiProducts);
    const rulesSection = sellerRulesPrompt(seller.aiRules);
    const system = [
      'You are BilisBot, the customer-service assistant for a Philippine e-commerce seller using BilisOps Chat.',
      "Draft ONE reply to the buyer's latest message. Match the buyer's language (English, Tagalog, or Taglish).",
      'Be warm, concise (1-3 sentences), and helpful, like a friendly human seller. An emoji or two is fine.',
      ...(rulesSection ? [rulesSection] : []),
      ...(catalogSection ? [catalogSection] : []),
      'Only state facts found in the product catalog and store knowledge pack. If the answer is not in them, promise to check and follow up instead of inventing details.',
      `<store_knowledge_pack>\n${knowledge}\n</store_knowledge_pack>`,
      'Output ONLY the reply text, nothing else.',
    ].join('\n');
    const history = conv.messages.slice(-12).map((m) => ({
      role: m.direction === 'in' ? 'user' : 'assistant', content: m.text,
    }));
    while (history.length && history[0].role !== 'user') history.shift();
    if (!history.length || history[history.length - 1].role !== 'user') {
      history.push({ role: 'user', content: lastIn.text });
    }

    // Engine 1: DeepSeek (OpenAI-compatible chat completions)
    if (hasDeepSeek) {
      try {
        const resp = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${c.env.DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            max_tokens: 512,
            temperature: 1.1,
            messages: [{ role: 'system', content: system }, ...history],
          }),
        });
        const raw = await resp.text();
        let data = null; try { data = JSON.parse(raw); } catch { }
        const draft = data?.choices?.[0]?.message?.content?.trim();
        if (draft) return c.json({ draft, engine: 'deepseek' });
        console.log('deepseek draft failed —', `HTTP ${resp.status}: ${raw.slice(0, 200)}`);
      } catch (e) {
        console.log('deepseek draft failed —', String(e && e.message || e));
      }
      if (!hasClaude) return fallback();
    }

    // Engine 2: Claude
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': c.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 1024, system, messages: history }),
    });
    const data = await resp.json();
    const draft = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!draft) return fallback();
    return c.json({ draft, engine: 'claude' });
  } catch (err) {
    return fallback();
  }
});

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

// Surface unexpected errors (incl. Supabase write failures) as clean JSON.
app.onError((err, c) => c.json({ error: 'server_error', detail: String(err?.message || err) }, 500));

export const onRequest = handle(app);
