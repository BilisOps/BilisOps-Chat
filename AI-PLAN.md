# BilisOps Chat — Plan to Make the AI Fully Functional

## Where AI stands today

| Piece | Status |
|---|---|
| AI Draft button (Chats) | **Wired to Claude** (`claude-opus-4-8`, adaptive thinking) via `POST /api/ai/draft`; sends last 12 messages + the seller's Knowledge Pack; falls back to keyword templates when no API key is set |
| Knowledge Pack editor (AI Chatbot page) | Working — saved per seller, injected into every draft prompt |
| AI Reply Rules / Product Recommendation rules | UI works, rules are **stored but nothing reads them yet** |
| Auto Reception / Handover toggles | UI works, **no engine behind them** |
| Auto-reply engine | Does not exist (the "Auto-reply" rows in analytics are honestly 0) |
| Review Analysis | Locked behind add-on; no review ingestion yet |

## Phase 0 — Turn on real drafts (30 minutes)
1. Get an Anthropic API key (console.anthropic.com).
2. Set `ANTHROPIC_API_KEY` where the server runs; restart. The draft endpoint switches from templates to Claude automatically.
3. Cost reality check: a draft is ~1–2K input + ~150 output tokens. On Opus 4.8 ($5/$25 per M) that is roughly PHP 1–2 per draft. Add **prompt caching** on the Knowledge Pack system block (`cache_control: ephemeral`) to cut input cost ~90% on repeat drafts.

## Phase 1 — Smarter drafts (1–2 days)
1. **Order context in the prompt**: when the conversation's buyer has a matching order, include its status/ref in the system prompt so "where is my order" gets a factual answer.
2. **Respect AI Reply Rules**: move the rules from localStorage to the server (`/api/ai/rules`), inject them into the draft system prompt ("shipping questions: auto-answer; price negotiation: draft only").
3. **Sensitive-word post-check server-side**: reject/regenerate any draft containing blocked words (client already blocks on send; add the server layer).
4. **Language matching QA**: verify Taglish output quality with real seller phrasing; tune the system prompt.

## Phase 2 — Draft-mode inbox (the Reply Review queue) (2–3 days)
When a buyer webhook arrives, the server generates a draft **in the background** and stores it on the conversation:
- Agent opens the chat → suggested reply is already waiting (one click: Use / Edit / Discard).
- The **Reply Review page becomes real**: a queue of AI drafts awaiting approval across all conversations.
- Track accept/edit/discard per draft → this becomes your quality metric (draft acceptance rate) and later your training signal for prompt tuning.

## Phase 3 — Bounded auto-reply (the "Auto-reply" analytics rows go live) (3–5 days)
1. **Template rules fire server-side**: welcome message on first contact, off-hours reply outside office hours, keyword → canned response. No AI needed; platform-policy safe.
2. **AI auto-answer, gated**: for intents the seller whitelisted in AI Reply Rules ("shipping", "stock"), Claude first **classifies** the message intent + confidence; only if intent ∈ whitelist AND confidence high does it auto-send — otherwise it degrades to a draft for human review.
3. Guardrails: sensitive-word check, one auto-reply per buyer per N minutes, never auto-send anything about refunds/payments/disputes, every auto-send tagged `sender: ai` in the message record and logged in Operating Record.
4. Tagging messages as `ai` vs `agent` is what makes the Auto-reply / Agents split in every dashboard real.

## Phase 4 — Handover intelligence (2 days)
On every inbound message, a cheap classification call scores: frustration, refund/dispute keywords, VIP/repeat buyer. If a Handover toggle is on and the score trips, the conversation is flagged priority, auto-reply is suppressed, and it jumps the queue. This makes the Human Handover Rules page functional.

## Phase 5 — Review Analysis (after platform review APIs are approved)
Ingest reviews per platform (each has a separate reviews API/scope — apply separately), then batch Claude jobs attribute reasons behind ≤3-star reviews (product quality / logistics / service) into the Review Analysis dashboard. Use the **Batches API** (50% cost) since this is not latency-sensitive.

## Cross-cutting (do alongside every phase)
- **Cost controls**: per-seller monthly AI quota tied to the AI Assist add-on; hard `max_tokens`; usage counter shown on the AI Monitor page (which then displays real numbers).
- **Observability**: log every AI call (tokens, latency, outcome) — AI Chatbot Monitor page reads from this.
- **Model strategy**: Opus 4.8 for drafts/auto-answers (quality in Taglish matters); consider Haiku for the Phase 4 classifier where volume is high and the task is simple.
- **Data protection**: knowledge pack + chat history only; never train on or share buyer data; state this in platform listings (already done).

## Suggested order of attack
Phase 0 today → Phase 1 this week → Phase 2 next (it's the biggest UX win and de-risks Phase 3) → Phase 3 only after acceptance rate in Phase 2 looks good (>70% drafts accepted unedited is a good bar) → Phase 4/5 opportunistically.
