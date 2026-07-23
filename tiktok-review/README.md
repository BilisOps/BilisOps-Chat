# TikTok Shop App Review — submission kit

Everything for the TikTok Partner Center app-review form. Field-by-field:

| TikTok form field | Use this |
|---|---|
| **Step-by-step Instructions For Product Testing** | Paste the contents of `testing-instructions.txt` |
| **Brief List Of Product Features** | Paste the contents of `feature-list.txt` |
| **Product Screenshots** (jpg/png, ≤10 files, ≤10MB) | Upload all 8 files in `screenshots/` (01–08, ordered to match the feature list) |
| **Product Video Recording** (mp4, ≤30MB) | Upload `BilisOps-Chat-Walkthrough.mp4` (37s, 0.7MB — login → store authorization → live AI-drafted reply sent in chat → product catalog → AI rules → knowledge pack → analytics) |
| **Required Product Design (PRD, pdf, ≤10MB)** | Upload `BilisOps-Chat-PRD.pdf` (5 pages: overview, architecture + data-flow diagram, key features, key use cases, API scopes & security) |

Test account shared with reviewers: `tester@bilisops.com` / `admin123` at https://chat.bilisops.com
(the account is pre-seeded with a connected TikTok sandbox shop, sample conversations, products, and AI rules).

## Screenshot ↔ feature mapping
1. `01-login` — secure login
2. `02-home-dashboard` — store connections + real-time snapshot
3. `03-unified-inbox` — unified chat inbox with buyer profile/order panel
4. `04-store-authorization` — official TikTok OAuth shop connection (multi-shop)
5. `05-product-catalog` — products the AI answers from (price/variants/stock/promo)
6. `06-ai-reply-rules` — seller rules enforced on every AI draft
7. `07-knowledge-pack` — per-shop knowledge pack with scope selector
8. `08-analytics` — response rate / conversion analytics

## Regenerating
- Screenshots: `node scratchpad/capture-screens.mjs` (headless Chrome against the live site)
- Video: `node scratchpad/capture-video.mjs` then the ffmpeg concat command
- PRD: `node scratchpad/make-prd.js`
