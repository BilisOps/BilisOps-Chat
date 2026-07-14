# BilisOps Chat — Platform Open API Integration Guide

BilisOps Chat normalizes every marketplace's chat infrastructure into one canonical model.
The adapter layer lives in [`platforms.js`](platforms.js); each adapter knows its platform's
terminology, auth model, webhook signature scheme, and native payload shape.

## The core problem: every platform names things differently

| Canonical concept | Shopee | Lazada | TikTok Shop | Meta (FB/IG) |
|---|---|---|---|---|
| **Store** | Shop (`shop_id`) | Seller (`seller_id`) | Shop (`shop_id` + `shop_cipher`) | Page (`page_id`) |
| **Buyer** | Buyer (`buyer_user_id`) | Buyer (account in session) | **User** (`im_user_id`) | User (PSID — page-scoped ID) |
| **Chat unit** | Conversation (`conversation_id`) | **Session** (`session_id`, IM API) | Conversation (`conversation_id`) | Conversation / thread (`t_…`) |
| **Message** | Message (`message_id`) | Message (`message_id`) | Message (`message_id`) | Message (`mid`) |
| **Order** | Order (`order_sn`) | Order (`order_id` / `order_number`) | Order (`order_id`) | Commerce order |

Adapters translate each native webhook into one canonical message:

```json
{ "externalShopId": "...", "buyerExternalId": "...", "buyerName": "...", "text": "...", "sentAt": "ISO-8601" }
```

## Auth models per platform

| Platform | Developer console | Auth flow | Request signing |
|---|---|---|---|
| Shopee | open.shopee.com | Partner ID + Partner Key; per-shop `auth_partner` authorization | HMAC-SHA256, `partner_key` |
| Lazada | open.lazada.com | App Key + Secret; seller OAuth code flow at `auth.lazada.com` | HMAC-SHA256, `app_secret` |
| TikTok Shop | partner.tiktokshop.com | App Key + Secret; shop authorization returns `shop_cipher` | HMAC-SHA256, `app_secret` |
| Meta | developers.facebook.com | Meta App + Facebook Login → Page Access Token | `X-Hub-Signature-256` |

## Webhook endpoints (already live in this app)

| Platform | Method + URL | Verification |
|---|---|---|
| Shopee | `POST /api/platforms/shopee/webhook` | `Authorization` = HMAC-SHA256(partner_key, url \| body) |
| Lazada | `POST /api/platforms/lazada/webhook` | `Authorization` = HMAC-SHA256(app_secret, body) |
| TikTok Shop | `POST /api/platforms/tiktok/webhook` | `Authorization` = HMAC-SHA256(app_secret, app_key + body) |
| Meta | `GET + POST /api/platforms/fb/webhook` | GET `hub.challenge` handshake; POST `X-Hub-Signature-256` |

**Demo vs live mode:** with no keys configured, adapters accept unsigned payloads so the
pipeline can be tested locally. Set the env vars below and the same endpoint enforces
real signature verification — no code change.

```
SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY
LAZADA_APP_KEY / LAZADA_APP_SECRET
TIKTOK_APP_KEY / TIKTOK_APP_SECRET
META_APP_SECRET / META_VERIFY_TOKEN
ANTHROPIC_API_KEY            # Claude-powered AI drafts
```

## Store routing (multi-tenant)

When authorizing a store in Settings → Store Authorization, enter the **Platform ID**
(Shopee `shop_id`, Lazada `seller_id`, Meta `page_id`). Incoming webhooks
are routed to the store whose `externalId` matches the payload's shop identifier, falling
back to the first store on that platform.

## Going fully live — remaining steps per platform

1. Register a developer app on each platform console (approval takes days–weeks; apply early).
2. Implement the OAuth callback (`/api/platforms/:key/oauth/callback`) to exchange the code
   for access/refresh tokens and store them per store record.
3. Implement outbound send: replying via each platform's send-message API
   (Shopee `sendMessage`, Lazada IM `sendMessage`, TikTok `send_message`, Meta Send API).
4. Token refresh jobs (most platforms expire access tokens in hours–days).
5. Replace `data/db.json` with a real database before production traffic.
