# SellerHub — Multi-Platform E-Commerce Customer Service System
### Implementation Blueprint (v1.0)

> **Working name:** "SellerHub" is a placeholder. Pick your own original brand name and verify it is not trademarked (check IPOPHL for the Philippines and the platform app stores).

---

## 1. Legal Ground Rules (Read First)

Building a product with the *same functionality* as an existing app is legal. Copyright protects **expression**, not **ideas**. To stay safe:

| ✅ Allowed | ❌ Not Allowed |
|---|---|
| Same feature set (unified inbox, auto-reply, AI agent, translation) | Copying their source code or decompiling their app |
| Your own UI built from scratch | Copying their screens pixel-for-pixel, icons, or illustrations |
| Your own brand name and logo | Using "Duoke" or a confusingly similar name/logo |
| Writing your own descriptions and docs | Copy-pasting their website/app-store text |
| Integrating the same public platform APIs (Shopee, Lazada, TikTok) | Scraping their servers or reusing their API keys/infrastructure |
| Studying their features to make a comparison table | Reproducing their help articles or templates verbatim |

**Practical rule:** never open their app while designing your screens. Design from your feature list, not from their layout.

---

## 2. Product Definition

**One-liner:** A unified inbox that lets online sellers manage customer chats from Shopee, Lazada, TikTok Shop, and Facebook in one app — with auto-replies, AI answers, and built-in translation.

**Target users:** Small and mid-size sellers in Southeast Asia running 2+ stores across platforms.

**Core value:** Stop switching between seller apps; answer faster; never miss a sale.

---

## 3. MVP Feature Set (Phase 1 — ~8-12 weeks)

1. **Account & store linking**
   - Email/password + OAuth login
   - Connect stores via official open-platform APIs (start with **one** platform, e.g., Shopee)
2. **Unified inbox**
   - Real-time message list across connected stores
   - Conversation view with buyer profile, order context, and images
   - Read/unread, assignment, and tagging
3. **Quick replies (templates)**
   - User-created canned responses with variables: `{{buyer_name}}`, `{{order_id}}`, `{{tracking_no}}`
   - One-tap insert
4. **Basic auto-reply**
   - Welcome message, away message (office hours), keyword-triggered replies
5. **Web dashboard + responsive mobile web** (native apps come later)

## 4. Phase 2 Features (differentiators)

- **AI agent**: LLM-powered answers grounded in a product knowledge base (RAG); human-handoff button
- **Real-time translation**: inline original + translated text (buyer language ↔ seller language)
- **Order automation**: payment reminders, shipping notifications, review requests triggered by order-status webhooks
- **Multi-agent teams**: roles, assignment rules, internal notes
- **Analytics**: response time, resolution rate, missed chats, per-store volume
- **Native mobile apps** (iOS/Android) with push notifications

---

## 5. Platform Integrations (all official, all legal)

| Platform | API Program | Key APIs |
|---|---|---|
| Shopee | Shopee Open Platform | Chat API (get/send messages), Order API, webhooks |
| Lazada | Lazada Open Platform | IM API, Order API |
| TikTok Shop | TikTok Shop Partner Center | Customer Service Message API, Order API |
| Facebook/Instagram | Meta for Developers | Messenger Platform, Instagram Messaging (webhooks + Send API) |
| Shopify (optional) | Shopify App Store | Inbox/Admin APIs |

**Notes:**
- Each requires a **developer/partner account application** — apply early; approval can take weeks.
- Respect each platform's rate limits and data policies (buyer PII handling is strictly regulated).
- Use **webhooks** for incoming messages where offered; poll only as fallback.

---

## 6. System Architecture

```
[Shopee] [Lazada] [TikTok] [Meta]
    │        │        │       │        (webhooks / polling)
    ▼        ▼        ▼       ▼
┌────────────────────────────────────┐
│   Channel Adapters (one per        │   normalize every platform's
│   platform, isolated services)     │   message into ONE schema
└──────────────────┬─────────────────┘
                   ▼
         ┌──────────────────┐
         │  Message Queue    │  (Redis Streams / RabbitMQ / SQS)
         └────────┬─────────┘
                  ▼
┌────────────────────────────────────┐
│  Core API (REST + WebSocket)       │
│  - Conversations service           │
│  - Automation engine (rules)       │
│  - AI service (LLM + RAG)          │
│  - Translation service             │
└──────────────────┬─────────────────┘
                   ▼
     PostgreSQL  +  Redis  +  S3-compatible storage
                   │
                   ▼
      Web app (React) / Mobile app (React Native or Flutter)
```

**Key design decision — the unified message schema:**

```json
{
  "id": "msg_01H...",
  "conversation_id": "conv_01H...",
  "channel": "shopee",
  "store_id": "store_123",
  "direction": "inbound",
  "sender": { "type": "buyer", "external_id": "sp_998", "name": "Maria" },
  "content": { "type": "text", "text": "May stock pa po ba?" },
  "order_ref": "SP240701ABC",
  "external_message_id": "shopee_msg_555",
  "created_at": "2026-07-03T09:12:00Z",
  "translated": { "lang": "en", "text": "Is this still in stock?" }
}
```

Every channel adapter converts platform-specific payloads into this schema. The rest of the app never cares which platform a message came from — this is the single most important abstraction in the whole system.

---

## 7. Suggested Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **Node.js (NestJS)** or **Python (FastAPI)** | Great SDK/webhook ecosystems |
| Real-time | WebSocket (Socket.IO) or SSE | Live inbox updates |
| Database | **PostgreSQL** | Relational fit for conversations/orders; JSONB for payloads |
| Cache/queue | **Redis** (+ BullMQ if Node) | Queues, rate-limit buckets, presence |
| Frontend | **React + TypeScript** (Vite) | Fast, huge ecosystem |
| Mobile (Phase 2) | **React Native** or **Flutter** | One codebase, both stores |
| AI | Anthropic/OpenAI API + **pgvector** for RAG | Grounded answers from your KB |
| Translation | DeepL API / Google Cloud Translation | Quality across SEA languages |
| Hosting | Fly.io / Railway / AWS Lightsail → scale later | Cheap start |
| Auth | Your own JWT or Clerk/Auth0 | Don't roll crypto yourself |

---

## 8. Data Model (core tables)

```
users(id, email, password_hash, name, role, team_id)
teams(id, name, plan, created_at)
stores(id, team_id, channel, external_shop_id, access_token_enc, refresh_token_enc, status)
conversations(id, store_id, buyer_external_id, buyer_name, last_message_at,
              status, assignee_id, unread_count, tags jsonb)
messages(id, conversation_id, direction, sender jsonb, content jsonb,
         external_message_id, order_ref, translated jsonb, created_at)
templates(id, team_id, title, body, variables jsonb)
automation_rules(id, team_id, trigger, conditions jsonb, action jsonb, enabled)
kb_documents(id, team_id, title, content, embedding vector)
orders_cache(id, store_id, external_order_id, status, buyer_external_id, payload jsonb)
```

**Security requirements:**
- Encrypt platform access/refresh tokens at rest (AES-256, key in a secrets manager)
- Row-level isolation by `team_id` on every query
- Never log message bodies or tokens in plaintext

---

## 9. Automation Engine (Phase 1 rules)

Simple trigger → condition → action model:

```
TRIGGER: message.received
CONDITION: outside office_hours (Mon–Sat 9:00–18:00 Asia/Manila)
ACTION: send_template("away_message")

TRIGGER: message.received
CONDITION: text contains any ["stock", "available", "meron"]
ACTION: send_template("stock_inquiry")

TRIGGER: order.status = "unpaid" AND age > 12h
ACTION: send_template("payment_reminder")   // Phase 2, needs order webhooks

TRIGGER: order.status = "delivered" AND age > 48h
ACTION: send_template("review_request")     // Phase 2
```

Store rules as JSON in `automation_rules`; evaluate in a queue worker so slow rules never block the inbox.

---

## 10. AI Agent Design (Phase 2)

1. **Knowledge base**: seller uploads FAQs, product specs, shipping/return policies → chunk → embed → store in pgvector.
2. **On new buyer message**: retrieve top-k relevant chunks → build prompt: system persona + store policies + retrieved context + conversation history → call LLM.
3. **Guardrails**:
   - If confidence low or question involves refunds/disputes → tag conversation "needs human" and stay silent or send a holding message
   - Hard cap: AI never promises discounts, refunds, or delivery dates not present in the KB
   - Every AI reply labeled internally so agents can audit
4. **Human handoff**: buyer keyword ("agent", "human", "tao po") or agent taps "Take over" — AI pauses on that conversation.

---

## 11. Build Roadmap

| Weeks | Milestone |
|---|---|
| 1–2 | Apply for Shopee Open Platform access; set up repo, CI, database, auth |
| 3–4 | Shopee adapter: OAuth store linking, receive messages via webhook, send replies |
| 5–6 | Unified inbox UI: conversation list, chat view, real-time updates |
| 7–8 | Templates + basic auto-replies + office hours |
| 9–10 | Second channel (Lazada or TikTok Shop) — proves the adapter abstraction |
| 11–12 | Polish, team invites, beta with 5–10 real sellers |
| Phase 2 | AI agent, translation, order automations, analytics, native mobile apps |

---

## 12. Branding & App Store Checklist (avoiding IP problems)

- [ ] Original name — search IPOPHL, Google Play, and the App Store for conflicts
- [ ] Original logo and color scheme (commission or generate; keep source files)
- [ ] All app-store descriptions, screenshots, and website copy written from scratch
- [ ] UI designed from wireframes you drew, not from competitor screenshots
- [ ] No competitor names in your keywords/metadata ("alternative to X" in ads is a gray area — get advice before doing it)
- [ ] Privacy policy + terms of service (required by Meta/Shopee/TikTok API programs and both app stores)
- [ ] Comply with PH Data Privacy Act (RA 10173) since you'll store buyer PII

---

## 13. Monetization Ideas

- **Free tier**: 1 store, 1 user, basic auto-replies (this is how you compete for adoption)
- **Pro**: multiple stores/platforms, templates with variables, analytics
- **AI add-on**: pay-per-conversation or monthly AI credit bundle (AI has real per-message cost — price it separately)

---

## 14. First 5 Tasks to Do This Week

1. Register a developer account on **Shopee Open Platform** (longest lead time).
2. Pick and reserve your **brand name + domain**.
3. Sketch 3 screens on paper: store-connect flow, inbox list, chat view.
4. Scaffold the backend (NestJS/FastAPI) with the `messages`/`conversations` schema above.
5. Get 3 seller friends to commit as beta testers — build for their exact pain points.
