// Platform adapters — one per marketplace open platform.
//
// Each marketplace models the same concepts with different names, IDs, auth,
// and webhook formats. Adapters translate every platform's native shape into
// ONE canonical message: { externalShopId, buyerExternalId, buyerName, text, sentAt }.
//
// Canonical model          Shopee              Lazada              TikTok Shop         Meta (FB/IG)
// ────────────────────────────────────────────────────────────────────────────────────────────────
// Store                    shop (shop_id)      seller (seller_id)  shop (shop_id +     page (page_id)
//                                                                  shop_cipher)
// Buyer                    buyer               buyer               USER (im_user_id)   user (PSID — page-
//                          (buyer_user_id)     (account in session)                    scoped ID)
// Chat unit                conversation        SESSION             conversation        conversation/thread
//                          (conversation_id)   (session_id)        (conversation_id)   (t_…)
// Message                  message             message             message             message (mid)
//                          (message_id)        (message_id)
// Order                    ORDER (order_sn)    order (order_id /   order (order_id)    commerce order
//                                              order_number)                           (chat-first platform)
//
// With real credentials in env vars the webhook signatures are verified; without
// them each adapter runs in demo mode (accepts unsigned payloads) so the whole
// pipeline can be exercised locally.

const crypto = require('crypto');

function hmac256(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

const PLATFORMS = {
  // ─────────────────────────── Shopee Open Platform ───────────────────────────
  shopee: {
    key: 'shopee',
    name: 'Shopee',
    docs: 'https://open.shopee.com',
    authModel: 'Partner ID + Partner Key; per-shop authorization (auth_partner flow), HMAC-SHA256 signed requests',
    terms: {
      store: 'Shop (shop_id)',
      buyer: 'Buyer (buyer_user_id)',
      chat: 'Conversation (conversation_id)',
      message: 'Message (message_id)',
      order: 'Order (order_sn)',
    },
    envVars: ['SHOPEE_PARTNER_ID', 'SHOPEE_PARTNER_KEY'],
    hasKeys: () => Boolean(process.env.SHOPEE_PARTNER_ID && process.env.SHOPEE_PARTNER_KEY),
    authorizeUrl(redirect) {
      const id = process.env.SHOPEE_PARTNER_ID || '{PARTNER_ID}';
      return `https://partner.shopeemobile.com/api/v2/shop/auth_partner?partner_id=${id}&redirect=${encodeURIComponent(redirect)}`;
    },
    // Push mechanism: Authorization header = HMAC-SHA256(partner_key, url + '|' + body)
    verify(req, fullUrl) {
      if (!this.hasKeys()) return { ok: true, mode: 'demo' };
      const expected = hmac256(process.env.SHOPEE_PARTNER_KEY, `${fullUrl}|${req.rawBody || ''}`);
      return { ok: safeEqual(req.headers.authorization, expected), mode: 'live' };
    },
    // Example push: { shop_id, code: 10, data: { type: 'message', content: {
    //   message_id, conversation_id, from_id, from_user_name,
    //   message_type: 'text', content: { text }, created_timestamp } } }
    normalize(body) {
      const c = body?.data?.content;
      if (!c || body?.data?.type !== 'message') return null;
      const text = c.message_type === 'text' ? c.content?.text : `[${c.message_type || 'attachment'}]`;
      if (!text) return null;
      return {
        externalShopId: String(body.shop_id || ''),
        buyerExternalId: String(c.from_id || ''),
        buyerName: c.from_user_name || `Buyer ${c.from_id || ''}`.trim(),
        text,
        sentAt: c.created_timestamp ? new Date(c.created_timestamp * 1000).toISOString() : new Date().toISOString(),
      };
    },
    // Order push (code 3/4): { shop_id, code: 3, data: { ordersn, status, update_time } }
    normalizeOrder(body) {
      const d = body?.data;
      if (!d?.ordersn || body?.data?.type === 'message') return null;
      return {
        externalShopId: String(body.shop_id || ''),
        orderRef: String(d.ordersn),                     // Shopee: order_sn
        status: String(d.status || 'UNKNOWN').toUpperCase(),
        amount: d.total_amount ? Number(d.total_amount) : null,
        at: d.update_time ? new Date(d.update_time * 1000).toISOString() : new Date().toISOString(),
      };
    },
  },

  // ─────────────────────────── Lazada Open Platform ───────────────────────────
  lazada: {
    key: 'lazada',
    name: 'Lazada',
    docs: 'https://open.lazada.com',
    authModel: 'App Key + App Secret; seller authorization-code OAuth (auth.lazada.com), HMAC-SHA256 signed requests',
    terms: {
      store: 'Seller (seller_id)',
      buyer: 'Buyer (account in session)',
      chat: 'Session (session_id) — Lazada IM',
      message: 'Message (message_id)',
      order: 'Order (order_id / order_number)',
    },
    envVars: ['LAZADA_APP_KEY', 'LAZADA_APP_SECRET'],
    hasKeys: () => Boolean(process.env.LAZADA_APP_KEY && process.env.LAZADA_APP_SECRET),
    authorizeUrl(redirect) {
      const key = process.env.LAZADA_APP_KEY || '{APP_KEY}';
      return `https://auth.lazada.com/oauth/authorize?response_type=code&client_id=${key}&redirect_uri=${encodeURIComponent(redirect)}`;
    },
    // Message push: Authorization header = HMAC-SHA256(app_secret, body)
    verify(req) {
      if (!this.hasKeys()) return { ok: true, mode: 'demo' };
      const expected = hmac256(process.env.LAZADA_APP_SECRET, req.rawBody || '');
      return { ok: safeEqual(req.headers.authorization, expected), mode: 'live' };
    },
    // Example push: { seller_id, message_type: 2, data: { session_id, message_id,
    //   from_account_type: 1, sender_nick, content: '{"txt":"..."}', send_time } }
    normalize(body) {
      const d = body?.data;
      if (!d) return null;
      if (d.from_account_type && Number(d.from_account_type) !== 1) return null; // 1 = buyer
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
    // Order push: { seller_id, message_type: 0, data: { trade_order_id, order_status, statuses, update_time } }
    normalizeOrder(body) {
      const d = body?.data;
      const ref = d?.trade_order_id || d?.order_id;
      if (!ref) return null;
      return {
        externalShopId: String(body.seller_id || ''),
        orderRef: String(ref),                           // Lazada: order_id / order_number
        status: String(d.order_status || (Array.isArray(d.statuses) ? d.statuses[0] : '') || 'UNKNOWN').toUpperCase(),
        amount: d.price ? Number(d.price) : null,
        at: d.update_time ? new Date(Number(d.update_time)).toISOString() : new Date().toISOString(),
      };
    },
  },

  // ─────────────────────── TikTok Shop Partner Center ───────────────────────
  tiktok: {
    key: 'tiktok',
    name: 'TikTok Shop',
    docs: 'https://partner.tiktokshop.com',
    authModel: 'App Key + App Secret; shop authorization returns shop_cipher used on every call',
    terms: {
      store: 'Shop (shop_id + shop_cipher)',
      buyer: 'User (im_user_id) — TikTok calls buyers "users"',
      chat: 'Conversation (conversation_id)',
      message: 'Message (message_id)',
      order: 'Order (order_id)',
    },
    envVars: ['TIKTOK_APP_KEY', 'TIKTOK_APP_SECRET'],
    hasKeys: () => Boolean(process.env.TIKTOK_APP_KEY && process.env.TIKTOK_APP_SECRET),
    authorizeUrl(redirect) {
      const key = process.env.TIKTOK_APP_KEY || '{APP_KEY}';
      return `https://services.tiktokshop.com/open/authorize?app_key=${key}&redirect_uri=${encodeURIComponent(redirect)}`;
    },
    // Webhook: Authorization header = HMAC-SHA256(app_secret, app_key + body)
    verify(req) {
      if (!this.hasKeys()) return { ok: true, mode: 'demo' };
      const expected = hmac256(process.env.TIKTOK_APP_SECRET, `${process.env.TIKTOK_APP_KEY}${req.rawBody || ''}`);
      return { ok: safeEqual(req.headers.authorization, expected), mode: 'live' };
    },
    // Example push: { type: 'IM_MESSAGE', shop_id, data: { conversation_id, message_id,
    //   sender: { im_user_id, nickname, role: 'BUYER' }, content: { text }, create_time } }
    normalize(body) {
      const d = body?.data;
      if (!d || (d.sender?.role && d.sender.role !== 'BUYER')) return null;
      const text = d.content?.text || d.content?.content || '';
      if (!text) return null;
      return {
        externalShopId: String(body.shop_id || ''),
        buyerExternalId: String(d.sender?.im_user_id || ''),
        buyerName: d.sender?.nickname || 'TikTok User',
        text,
        sentAt: d.create_time ? new Date(Number(d.create_time) * 1000).toISOString() : new Date().toISOString(),
      };
    },
    // Order push: { type: 'ORDER_STATUS_CHANGE', shop_id, data: { order_id, order_status, update_time } }
    normalizeOrder(body) {
      const d = body?.data;
      if (!d?.order_id || !(body?.type || '').includes('ORDER')) return null;
      return {
        externalShopId: String(body.shop_id || ''),
        orderRef: String(d.order_id),                    // TikTok: order_id
        status: String(d.order_status || 'UNKNOWN').toUpperCase(),
        amount: d.payment?.total_amount ? Number(d.payment.total_amount) : null,
        at: d.update_time ? new Date(Number(d.update_time) * 1000).toISOString() : new Date().toISOString(),
      };
    },
  },

  // ───────────────────── Meta (Messenger / Instagram) ─────────────────────
  fb: {
    key: 'fb',
    name: 'Facebook / Instagram',
    docs: 'https://developers.facebook.com/docs/messenger-platform',
    authModel: 'Meta App + Page Access Token via Facebook Login OAuth; webhook GET verification + X-Hub-Signature-256',
    terms: {
      store: 'Page (page_id)',
      buyer: 'User (PSID — page-scoped user ID)',
      chat: 'Conversation / thread (t_…)',
      message: 'Message (mid)',
      order: 'Commerce order (chat-first platform)',
    },
    envVars: ['META_APP_SECRET', 'META_VERIFY_TOKEN'],
    hasKeys: () => Boolean(process.env.META_APP_SECRET),
    authorizeUrl(redirect) {
      return `https://www.facebook.com/v21.0/dialog/oauth?client_id={APP_ID}&redirect_uri=${encodeURIComponent(redirect)}&scope=pages_messaging,pages_show_list`;
    },
    // X-Hub-Signature-256: 'sha256=' + HMAC-SHA256(app_secret, body)
    verify(req) {
      if (!this.hasKeys()) return { ok: true, mode: 'demo' };
      const expected = 'sha256=' + hmac256(process.env.META_APP_SECRET, req.rawBody || '');
      return { ok: safeEqual(req.headers['x-hub-signature-256'], expected), mode: 'live' };
    },
    // Example push: { object: 'page', entry: [{ id: pageId, messaging: [{
    //   sender: { id: PSID }, timestamp, message: { mid, text } }] }] }
    normalize(body) {
      if (body?.object !== 'page' && body?.object !== 'instagram') return null;
      const entry = body?.entry?.[0];
      const msg = entry?.messaging?.[0];
      if (!msg?.message?.text) return null;
      return {
        externalShopId: String(entry.id || ''),
        buyerExternalId: String(msg.sender?.id || ''),
        buyerName: `User ${String(msg.sender?.id || '').slice(-4)}`, // PSID is opaque; real name needs a Graph API profile call
        text: msg.message.text,
        sentAt: msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString(),
      };
    },
  },

};

module.exports = { PLATFORMS };
