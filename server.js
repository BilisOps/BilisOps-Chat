// BilisOps Chat — starter backend
// Serves the frontend, a multi-tenant REST API, a marketplace-style webhook
// endpoint, a mock-marketplace simulator, and a Claude-powered AI draft endpoint.
//
// Run:  npm install && npm start
// AI:   set ANTHROPIC_API_KEY to enable real Claude drafts (falls back to
//       template drafts without it).

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PLATFORMS } = require('./platforms');

const app = express();
// Keep the raw body — platform webhook signatures are computed over the exact bytes.
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));

const PORT = process.env.PORT || 5500;

// ---------- Claude client (optional — template fallback without a key) ----------
const hasClaudeKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
let anthropic = null;
if (hasClaudeKey) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    anthropic = new Anthropic();
  } catch {
    anthropic = null;
  }
}

// ---------- Tiny JSON persistence ----------
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

let db = {
  sellers: [],        // {id, email, name, salt, passHash, createdAt}
  sessions: {},       // token -> sellerId
  stores: [],         // {id, sellerId, platform, name, site, storeToken, authorizedAt, expiresAt}
  conversations: [],  // {id, sellerId, storeId, platform, buyerName, preview, unread, resolved, test, updatedAt, messages: [{direction, text, at}]}
  orders: [],         // {id, sellerId, storeId, platform, orderRef, status, amount, at}
  knowledge: {},      // sellerId -> text
};

function loadDb() {
  try {
    db = { ...db, ...JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) };
  } catch { /* first run */ }
}

let saveTimer = null;
function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  }, 100);
}

loadDb();

// ---------- Helpers ----------
function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function publicSeller(s) {
  return { id: s.id, email: s.email, name: s.name };
}

// ---------- Auth middleware (multi-tenant isolation) ----------
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const sellerId = db.sessions[token];
  const seller = sellerId && db.sellers.find(s => s.id === sellerId);
  if (!seller) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.seller = seller;
  next();
}

// ---------- Auth ----------
app.post('/api/auth/register', (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (db.sellers.some(s => s.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'account_exists' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const seller = {
    id: id('slr'),
    email,
    name: name || email.split('@')[0],
    salt,
    passHash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };
  db.sellers.push(seller);
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = seller.id;
  saveDb();
  res.json({ token, seller: publicSeller(seller) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const seller = db.sellers.find(s => s.email.toLowerCase() === String(email || '').toLowerCase());
  if (!seller) return res.status(404).json({ error: 'no_account' });
  if (hashPassword(password || '', seller.salt) !== seller.passHash) {
    return res.status(401).json({ error: 'bad_password' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = seller.id;
  saveDb();
  res.json({ token, seller: publicSeller(seller) });
});

// Demo "OAuth" login (placeholder for real marketplace OAuth)
app.post('/api/auth/demo', (req, res) => {
  const platform = String(req.body?.platform || 'shopee').toLowerCase();
  const email = `${platform}-seller@bilisops.local`;
  let seller = db.sellers.find(s => s.email === email);
  if (!seller) {
    const salt = crypto.randomBytes(16).toString('hex');
    seller = {
      id: id('slr'), email,
      name: `${platform[0].toUpperCase()}${platform.slice(1)} Seller`,
      salt, passHash: hashPassword(crypto.randomBytes(12).toString('hex'), salt),
      createdAt: new Date().toISOString(),
    };
    db.sellers.push(seller);
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = seller.id;
  saveDb();
  res.json({ token, seller: publicSeller(seller) });
});

app.get('/api/me', auth, (req, res) => res.json(publicSeller(req.seller)));

app.post('/api/auth/logout', auth, (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  delete db.sessions[token];
  saveDb();
  res.json({ ok: true });
});

// ---------- Stores (authorization) ----------
const PLATFORM_KEYS = { Shopee: 'shopee', Lazada: 'lazada', TikTok: 'tiktok', Facebook: 'fb' };

app.get('/api/stores', auth, (req, res) => {
  res.json(db.stores.filter(s => s.sellerId === req.seller.id).map(({ storeToken, sellerId, ...pub }) => pub));
});

app.post('/api/stores', auth, (req, res) => {
  const { platform, name, externalId } = req.body || {};
  if (!PLATFORM_KEYS[platform] || !name) {
    return res.status(400).json({ error: 'platform and name required' });
  }
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  const store = {
    id: id('str'),
    sellerId: req.seller.id,
    platform,
    key: PLATFORM_KEYS[platform],
    name: String(name).slice(0, 80),
    site: 'PH',
    externalId: externalId ? String(externalId).slice(0, 60) : null, // platform-side ID: shop_id / seller_id / page_id / shop domain
    storeToken: crypto.randomBytes(16).toString('hex'), // what a real marketplace webhook would present
    authorizedAt: new Date().toISOString(),
    expiresAt: expires.toISOString(),
  };
  db.stores.push(store);
  saveDb();
  const { storeToken, sellerId, ...pub } = store;
  res.json(pub);
});

app.delete('/api/stores/:id', auth, (req, res) => {
  const idx = db.stores.findIndex(s => s.id === req.params.id && s.sellerId === req.seller.id);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  db.stores.splice(idx, 1);
  saveDb();
  res.json({ ok: true });
});

// ---------- Incoming buyer messages ----------
function deliverBuyerMessage(store, buyerName, text, buyerExternalId) {
  let conv = db.conversations.find(c =>
    c.sellerId === store.sellerId && c.storeId === store.id && !c.resolved &&
    (buyerExternalId ? c.buyerExternalId === buyerExternalId : c.buyerName === buyerName));
  const now = new Date().toISOString();
  if (!conv) {
    conv = {
      id: id('cnv'),
      sellerId: store.sellerId,
      storeId: store.id,
      platform: store.key,
      buyerName,
      buyerExternalId: buyerExternalId || null,
      preview: '',
      unread: true,
      resolved: false,
      test: !buyerExternalId,
      updatedAt: now,
      messages: [],
    };
    db.conversations.push(conv);
  }
  conv.messages.push({ direction: 'in', text, at: now });
  conv.preview = text;
  conv.unread = true;
  conv.updatedAt = now;
  saveDb();
  return conv;
}

// ---------- Platform open-API layer ----------
// GET /api/platforms — terminology matrix + integration readiness per marketplace.
app.get('/api/platforms', auth, (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.json(Object.values(PLATFORMS).map(p => ({
    key: p.key,
    name: p.name,
    docs: p.docs,
    authModel: p.authModel,
    terms: p.terms,
    envVars: p.envVars,
    ready: p.hasKeys(),
    mode: p.hasKeys() ? 'live' : 'demo',
    webhookUrl: `${base}/api/platforms/${p.key}/webhook`,
    authorizeUrl: p.authorizeUrl(`${base}/api/platforms/${p.key}/oauth/callback`),
  })));
});

// OAuth callback — marketplaces redirect here with the authorization code
// after a seller approves the app (the "Redirect URL" you register in each
// developer console). Captures the code; exchanges it for tokens when the
// platform's app keys are configured.
app.get('/api/platforms/:key/oauth/callback', async (req, res) => {
  const adapter = PLATFORMS[req.params.key];
  if (!adapter) return res.status(404).send('Unknown platform');

  // Each platform names the code param differently
  const code = String(req.query.code || req.query.auth_code || req.query.authorization_code || '').slice(0, 300);
  const record = {
    id: id('oauth'),
    platform: req.params.key,
    code,
    receivedAt: new Date().toISOString(),
    exchanged: false,
  };

  // TikTok Shop: exchange auth_code for access/refresh tokens when keys are set
  if (req.params.key === 'tiktok' && code && process.env.TIKTOK_APP_KEY && process.env.TIKTOK_APP_SECRET) {
    try {
      const url = 'https://auth.tiktok-shops.com/api/v2/token/get' +
        `?app_key=${encodeURIComponent(process.env.TIKTOK_APP_KEY)}` +
        `&app_secret=${encodeURIComponent(process.env.TIKTOK_APP_SECRET)}` +
        `&auth_code=${encodeURIComponent(code)}&grant_type=authorized_code`;
      const data = await fetch(url).then(r => r.json());
      if (data?.data?.access_token) {
        record.exchanged = true;
        record.sellerName = data.data.seller_name || null;
        record.tokens = {
          access_token: data.data.access_token,
          refresh_token: data.data.refresh_token,
          expiresIn: data.data.access_token_expire_in,
        };
      } else {
        record.error = data?.message || 'token exchange failed';
      }
    } catch (e) {
      record.error = String(e.message || e);
    }
  }

  db.oauth = db.oauth || [];
  db.oauth.push(record);
  saveDb();

  res.send(`<!doctype html><html><body style="font-family:Inter,system-ui,sans-serif;padding:48px;color:#111827;background:#f9fafb">
    <div style="max-width:460px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
      <div style="width:32px;height:32px;border-radius:8px;background:#f97316;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">B</div>
      <h2 style="margin:14px 0 6px;font-size:18px">${adapter.name} authorization ${code ? 'received' : 'callback reached'}</h2>
      <p style="color:#6b7280;font-size:14px;line-height:1.6">${
        record.exchanged
          ? `Access token obtained${record.sellerName ? ` for <b>${record.sellerName}</b>` : ''} — the store is connected to BilisOps Chat.`
          : code
            ? 'Authorization code captured. Token exchange will run automatically once the platform app keys are configured on the server.'
            : 'No authorization code was included in this request.'
      }</p>
      <p style="color:#9ca3af;font-size:12.5px">You may close this window.</p>
    </div></body></html>`);
});

// Meta webhook GET verification (hub.challenge handshake).
app.get('/api/platforms/fb/webhook', (req, res) => {
  const verifyToken = process.env.META_VERIFY_TOKEN || 'bilisops';
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
    return res.send(req.query['hub.challenge']);
  }
  res.status(403).send('verification failed');
});

// Native platform webhooks: each marketplace POSTs its own payload shape here.
// The adapter verifies the signature (when live keys are set) and normalizes
// the payload into the canonical message model.
app.post('/api/platforms/:key/webhook', (req, res) => {
  const adapter = PLATFORMS[req.params.key];
  if (!adapter) return res.status(404).json({ error: 'unknown platform' });

  const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const check = adapter.verify(req, fullUrl);
  if (!check.ok) return res.status(401).json({ error: 'invalid signature' });

  const findStore = (externalShopId) =>
    db.stores.find(s => s.key === adapter.key && s.externalId && s.externalId === externalShopId) ||
    db.stores.find(s => s.key === adapter.key);

  // Chat message event?
  const msg = adapter.normalize(req.body);
  if (msg) {
    const store = findStore(msg.externalShopId);
    if (!store) return res.status(404).json({ error: 'no_store', message: `No authorized ${adapter.name} store` });
    const conv = deliverBuyerMessage(store, msg.buyerName, msg.text, msg.buyerExternalId);
    return res.json({ ok: true, kind: 'message', mode: check.mode, conversationId: conv.id });
  }

  // Order event?
  const evt = adapter.normalizeOrder ? adapter.normalizeOrder(req.body) : null;
  if (evt) {
    const store = findStore(evt.externalShopId);
    if (!store) return res.status(404).json({ error: 'no_store', message: `No authorized ${adapter.name} store` });
    const order = deliverOrderEvent(store, evt);
    return res.json({ ok: true, kind: 'order', mode: check.mode, orderId: order.id, status: order.status });
  }

  res.json({ ok: true, ignored: 'not a chat or order event' });
});

// ---------- Orders + stats (feeds the dashboards) ----------
app.get('/api/orders', auth, (req, res) => {
  res.json(db.orders.filter(o => o.sellerId === req.seller.id).map(({ sellerId, ...pub }) => pub));
});

const isCancelled = s => /CANCEL/i.test(s || '');

app.get('/api/stats', auth, (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 90));
  const sellerId = req.seller.id;
  const convs = db.conversations.filter(c => c.sellerId === sellerId);
  const orders = db.orders.filter(o => o.sellerId === sellerId);

  // daily buckets, oldest → newest
  const daily = [];
  const index = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    index[key] = daily.length;
    daily.push({ date: key, inquiries: 0, replies: 0, orders: 0, cancelled: 0, amount: 0 });
  }
  const bucket = iso => daily[index[String(iso).slice(0, 10)]];

  let firstResponseMins = [];
  convs.forEach(c => {
    const firstIn = c.messages.find(m => m.direction === 'in');
    if (firstIn) {
      const b = bucket(firstIn.at);
      if (b) b.inquiries++;
      const firstOut = c.messages.find(m => m.direction === 'out' && m.at >= firstIn.at);
      if (firstOut) firstResponseMins.push((new Date(firstOut.at) - new Date(firstIn.at)) / 60000);
    }
    c.messages.forEach(m => {
      if (m.direction === 'out') {
        const b = bucket(m.at);
        if (b) b.replies++;
      }
    });
  });
  orders.forEach(o => {
    const b = bucket(o.at);
    if (b) {
      b.orders++;
      if (o.amount) b.amount += o.amount;
      if (isCancelled(o.status)) b.cancelled++;
    }
  });

  const replied = convs.filter(c => c.messages.some(m => m.direction === 'out')).length;
  const cancelled = orders.filter(o => isCancelled(o.status));
  const amount = orders.reduce((s, o) => s + (o.amount || 0), 0);
  const avgFirst = firstResponseMins.length
    ? firstResponseMins.reduce((s, v) => s + v, 0) / firstResponseMins.length : null;

  res.json({
    daily,
    totals: {
      conversations: convs.length,
      replied,
      responseRatePct: convs.length ? Math.round((replied / convs.length) * 100) : null,
      avgFirstResponseMin: avgFirst != null ? Math.round(avgFirst * 10) / 10 : null,
      resolved: convs.filter(c => c.resolved).length,
      orders: orders.length,
      cancelled: cancelled.length,
      lossRatePct: orders.length ? Math.round((cancelled.length / orders.length) * 1000) / 10 : null,
      amount: Math.round(amount * 100) / 100,
      cancelledAmount: Math.round(cancelled.reduce((s, o) => s + (o.amount || 0), 0) * 100) / 100,
      conversionPct: convs.length ? Math.round((orders.length / convs.length) * 1000) / 10 : null,
    },
    perStore: db.stores.filter(s => s.sellerId === sellerId).map(s => ({
      storeId: s.id, name: s.name, platform: s.platform,
      conversations: convs.filter(c => c.storeId === s.id).length,
      replied: convs.filter(c => c.storeId === s.id && c.messages.some(m => m.direction === 'out')).length,
      orders: orders.filter(o => o.storeId === s.id).length,
      amount: Math.round(orders.filter(o => o.storeId === s.id).reduce((sm, o) => sm + (o.amount || 0), 0) * 100) / 100,
    })),
  });
});

// Mock marketplace: simulate an order webhook for one of the seller's stores.
const TEST_STATUSES = ['UNPAID', 'TO_SHIP', 'SHIPPED', 'COMPLETED', 'CANCELLED'];

app.post('/api/dev/simulate-order', auth, (req, res) => {
  const stores = db.stores.filter(s => s.sellerId === req.seller.id);
  if (!stores.length) return res.status(400).json({ error: 'no_stores', message: 'Authorize a store first' });
  const store = stores[Math.floor(Math.random() * stores.length)];
  const order = deliverOrderEvent(store, {
    orderRef: `TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    status: TEST_STATUSES[Math.floor(Math.random() * TEST_STATUSES.length)],
    amount: Math.round((99 + Math.random() * 1900) * 100) / 100,
    at: new Date().toISOString(),
  });
  res.json({ ok: true, platform: store.platform, orderRef: order.orderRef, status: order.status, amount: order.amount });
});

// ---------- Order events (from platform order webhooks) ----------
function deliverOrderEvent(store, evt) {
  let order = db.orders.find(o =>
    o.sellerId === store.sellerId && o.storeId === store.id && o.orderRef === evt.orderRef);
  if (order) {
    order.status = evt.status;
    if (evt.amount != null) order.amount = evt.amount;
    order.at = evt.at;
  } else {
    order = {
      id: id('ord'),
      sellerId: store.sellerId,
      storeId: store.id,
      platform: store.key,
      orderRef: evt.orderRef,
      status: evt.status,
      amount: evt.amount,
      at: evt.at,
    };
    db.orders.push(order);
  }
  saveDb();
  return order;
}

// Marketplace-style webhook: a platform pushes a buyer message with the store's token.
app.post('/api/webhooks/:platform', (req, res) => {
  const store = db.stores.find(s => s.storeToken === req.headers['x-store-token']);
  if (!store) return res.status(401).json({ error: 'invalid store token' });
  const { buyerName, text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  const conv = deliverBuyerMessage(store, String(buyerName || 'Buyer').slice(0, 60), String(text).slice(0, 2000));
  res.json({ ok: true, conversationId: conv.id });
});

// Mock marketplace: simulate a buyer message to one of the seller's stores.
const TEST_QUESTIONS = [
  'Hi po, available pa ba ito?',
  'Do you ship to Cebu?',
  'Pwede po ba palitan ang address ko?',
  'Is this available in size L?',
  'Can I get a discount for bulk orders?',
  'When will my order arrive po?',
];
const TEST_BUYERS = ['Maricel C.', 'John R.', 'Angel S.', 'Mark V.', 'Kristine U.', 'Paolo G.'];

app.post('/api/dev/simulate', auth, (req, res) => {
  const stores = db.stores.filter(s => s.sellerId === req.seller.id);
  if (!stores.length) return res.status(400).json({ error: 'no_stores', message: 'Authorize a store first' });
  const store = stores[Math.floor(Math.random() * stores.length)];
  const conv = deliverBuyerMessage(
    store,
    TEST_BUYERS[Math.floor(Math.random() * TEST_BUYERS.length)],
    TEST_QUESTIONS[Math.floor(Math.random() * TEST_QUESTIONS.length)],
  );
  res.json({ ok: true, platform: store.platform, conversationId: conv.id });
});

// ---------- Conversations ----------
function ownConv(req, res) {
  const conv = db.conversations.find(c => c.id === req.params.id && c.sellerId === req.seller.id);
  if (!conv) res.status(404).json({ error: 'not_found' });
  return conv;
}

app.get('/api/conversations', auth, (req, res) => {
  const list = db.conversations
    .filter(c => c.sellerId === req.seller.id)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  res.json(list.map(({ sellerId, ...pub }) => pub));
});

app.post('/api/conversations/:id/reply', auth, (req, res) => {
  const conv = ownConv(req, res);
  if (!conv) return;
  const text = String(req.body?.text || '').trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'text required' });
  const now = new Date().toISOString();
  conv.messages.push({ direction: 'out', text, at: now });
  conv.preview = text;
  conv.updatedAt = now;
  saveDb();
  res.json({ ok: true });
});

app.post('/api/conversations/:id/read', auth, (req, res) => {
  const conv = ownConv(req, res);
  if (!conv) return;
  conv.unread = false;
  saveDb();
  res.json({ ok: true });
});

app.post('/api/conversations/:id/resolve', auth, (req, res) => {
  const conv = ownConv(req, res);
  if (!conv) return;
  conv.resolved = Boolean(req.body?.resolved);
  saveDb();
  res.json({ ok: true, resolved: conv.resolved });
});

// ---------- Knowledge pack ----------
app.get('/api/knowledge', auth, (req, res) => {
  res.json({ text: db.knowledge[req.seller.id] || '' });
});

app.put('/api/knowledge', auth, (req, res) => {
  db.knowledge[req.seller.id] = String(req.body?.text || '').slice(0, 20000);
  saveDb();
  res.json({ ok: true });
});

// ---------- AI draft (Claude via RAG-lite: chat history + knowledge pack) ----------
function templateDraft(lastBuyerText) {
  const t = (lastBuyerText || '').toLowerCase();
  if (/(ship|deliver|arrive|cebu|davao|luzon)/.test(t)) {
    return 'Hi po! Yes, we ship nationwide 🚚 Orders are handed to the courier within 24 hours. Salamat po!';
  }
  if (/(available|stock|size|color)/.test(t)) {
    return "Hi po! Let me check that for you — it should be in stock. I'll confirm the exact variant right away. Salamat sa pag-message! 😊";
  }
  if (/(discount|bulk|wholesale|price)/.test(t)) {
    return 'Hi po! For bulk orders we can definitely work something out — how many pieces are you looking at? 😊';
  }
  if (/(address|change|palit)/.test(t)) {
    return "Hi po! No problem — please send the updated address and we'll change it before the parcel ships. 🙏";
  }
  return "Hi po! Thanks for reaching out — we'll get back to you with the details right away. Salamat! 😊";
}

app.post('/api/ai/draft', auth, async (req, res) => {
  const conv = db.conversations.find(c => c.id === req.body?.conversationId && c.sellerId === req.seller.id);
  if (!conv) return res.status(404).json({ error: 'not_found' });
  const lastIn = [...conv.messages].reverse().find(m => m.direction === 'in');
  if (!lastIn) return res.status(400).json({ error: 'no_buyer_message' });

  const fallback = () => res.json({
    draft: templateDraft(lastIn.text),
    engine: 'template',
    note: 'Set ANTHROPIC_API_KEY on the server to enable Claude-powered drafts.',
  });

  if (!anthropic) return fallback();

  try {
    const knowledge = db.knowledge[req.seller.id] || '(no knowledge pack yet)';
    const history = conv.messages.slice(-12).map(m => ({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.text,
    }));
    // Conversation must start with a user turn
    while (history.length && history[0].role !== 'user') history.shift();
    if (!history.length || history[history.length - 1].role !== 'user') {
      history.push({ role: 'user', content: lastIn.text });
    }

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      system: [
        'You are BilisBot, the customer-service assistant for a Philippine e-commerce seller using BilisOps Chat.',
        'Draft ONE reply to the buyer\'s latest message. Match the buyer\'s language (English, Tagalog, or Taglish).',
        'Be warm, concise (1-3 sentences), and helpful, like a friendly human seller. An emoji or two is fine.',
        'Only state facts found in the store knowledge pack below. If the answer is not in it, promise to check and follow up instead of inventing details.',
        `<store_knowledge_pack>\n${knowledge}\n</store_knowledge_pack>`,
        'Output ONLY the reply text, nothing else.',
      ].join('\n'),
      messages: history,
    });

    const draft = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();
    if (!draft) return fallback();
    res.json({ draft, engine: 'claude' });
  } catch (err) {
    console.error('AI draft failed, using template fallback:', err.message || err);
    fallback();
  }
});

// ---------- Static frontend (built React app) ----------
const DIST = path.join(__dirname, 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  // SPA fallback for any non-API route
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
} else {
  console.warn('dist/ not found — run "npm run build" first (or use "npm run dev" for the Vite dev server).');
}

app.listen(PORT, () => {
  console.log(`BilisOps Chat running at http://localhost:${PORT}`);
  console.log(`AI drafts: ${anthropic ? 'Claude enabled ✓' : 'template fallback — set ANTHROPIC_API_KEY to enable Claude'}`);
});
