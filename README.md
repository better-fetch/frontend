# better fetch — dashboard

Minimal Next.js (App Router) frontend for [Better Fetch](../backend/README.md):
magic-link sign-in (Supabase Auth), API key management, and Stripe
subscriptions. Built with Tailwind CSS v4 and [shadcn/ui](https://ui.shadcn.com)
(neutral theme; components live in `components/ui/`). Deployed on Fly.io at
`https://betterfetch.co`; the API itself runs on Fly.io at
`https://api.betterfetch.co`.

## How it fits together

- **Supabase Postgres** is the single source of truth for control-plane data:
  `api_keys`, `subscriptions`, `usage_counters`, and `browser_sessions`
  metadata (see `../supabase/migrations/`).
- **Supabase Storage** holds encrypted portable browser-session
  `storage_state` snapshots. Backend local profile directories are a
  machine-local cache, not the source of truth.
- The **Python backend** points its `DATABASE_URL` at the same database and
  enforces auth + quota per request via the `check_and_increment_usage`
  Postgres function.
- This app creates/revokes key rows (server routes, service-role client) and
  keeps `subscriptions` in sync with Stripe via webhook.
- Browsers only ever get RLS-guarded `SELECT` on their own rows; the
  `key_hash` column is excluded from the grant. Plaintext keys are shown
  exactly once at creation; only the SHA-256 hash is stored.

## Tiers

| tier | price | calls/mo | stored browser sessions |
|---|---|---:|---:|
| free | $0 | 50 | 1 |
| starter | $19 | 25,000 | 10 |
| pro | $49 | 100,000 | 50 |
| scale | $199 | 500,000 | 250 |

The free tier is a real $0 Stripe subscription with
`payment_method_collection: "always"`, so checkout still validates a card —
that's the bot/abuse gate for free signups.

Hard cap: over-quota calls get `429` until the next billing cycle. A call is
counted when accepted, regardless of fetch outcome. Plan changes are synced
from Stripe webhooks; usage resets when Stripe advances the billing period.

Stored browser sessions are account-scoped, sync encrypted cookie/localStorage
snapshots for multi-machine reuse, and expire after 7 idle days.

## Local development

```bash
# 1. From the repo root: start Supabase (applies migrations)
supabase start

# 2. Stripe test mode: forward webhooks (prints the whsec_... secret)
stripe listen --forward-to localhost:3000/api/stripe/webhook

# 3. Fill in frontend/.env.local (see .env.example):
#    - local Supabase URL/keys are printed by `supabase start`
#    - Stripe test secret key, the whsec from step 2, and the four price IDs

# 4. Run the app
npm install && npm run dev
```

Magic-link emails land in Mailpit at http://127.0.0.1:54324. To run the
backend against the same database:

```bash
cd ../backend
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
BETTER_FETCH_API_KEY= .venv/bin/python -c 'from betterfetch.api import main; main()'
```

## Stripe webhook events handled

`customer.subscription.created/updated/deleted` → idempotent upsert of the
`subscriptions` row keyed on `stripe_customer_id` (status, tier, quota,
billing period). Renewals arrive as `updated` with a new period start, which
is what resets usage — no cron needed. `/api/checkout` creates the Stripe
customer and the `subscriptions` row *before* redirecting, so webhook
ordering can't strand an event.

Note (basil+ Stripe API): `current_period_start/end` live on the
**subscription item**, not the subscription object.

## Production

Deployed as a second Fly.io app, **betterfetch-web** (syd, shared-cpu-1x,
512MB), alongside the **fetching-service** backend. `fly deploy` from this
directory builds the standalone Next.js image; `NEXT_PUBLIC_*` values are
build args in `fly.toml`, server secrets are Fly secrets.

Done already: Supabase project `vxctympqqqenfhqepnmo` linked and migrated
(`supabase db push`); Fly app deployed at betterfetch-web.fly.dev; TLS certs
and DNS are live for betterfetch.co and www.

Remaining manual steps:
- **Stripe live (dashboard)**: create the four products/prices (lookup keys
  `free`/`starter`/`pro`/`scale`; the free price is $0/mo), add webhook
  endpoint `https://betterfetch.co/api/stripe/webhook` with the
  `customer.subscription.created/updated/deleted` events, enable portal plan
  switching + cancellation. Then:
  `fly secrets set -a betterfetch-web STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... STRIPE_PRICE_FREE=... STRIPE_PRICE_STARTER=... STRIPE_PRICE_PRO=... STRIPE_PRICE_SCALE=...`
- **Supabase dashboard**: Auth → URL configuration: site URL
  `https://betterfetch.co`, redirect URL
  `https://betterfetch.co/auth/confirm`; configure **custom SMTP**
  (built-in email is rate-limited and free-tier templates are restricted).
  Settings → Database → reset/copy the password, then:
  `fly secrets set -a fetching-service DATABASE_URL='postgresql://postgres:<password>@db.vxctympqqqenfhqepnmo.supabase.co:5432/postgres?sslmode=require'`
  (direct connection; never the transaction pooler on port 6543).
  For portable multi-machine browser sessions, also set:
  `BETTER_FETCH_SUPABASE_URL='https://vxctympqqqenfhqepnmo.supabase.co'`,
  `BETTER_FETCH_SUPABASE_SERVICE_KEY='sb_secret_...'`, and
  `BETTER_FETCH_SESSION_SNAPSHOT_KEY='<separate random 32+ byte secret>'`
  on the `fetching-service` app.
- Rotate `SUPABASE_SECRET_KEY` on betterfetch-web from the legacy
  `service_role` JWT to the `sb_secret_...` key (dashboard → API keys)
  before legacy keys sunset in late 2026.
- **MCP connector (OAuth)**: `supabase db push` to apply the
  `mcp_oauth` migration, then `fly deploy`. No new secrets — the OAuth
  server and the MCP endpoint reuse `SUPABASE_SECRET_KEY` and
  `NEXT_PUBLIC_SITE_URL`. Users (Claude, Claude Cowork, Claude Desktop)
  add `https://betterfetch.co/api/mcp` as a custom connector; tokens it
  issues are ordinary `bf_` keys, revocable from /keys. Manual clients
  can still send `Authorization: Bearer bf_...` to the same endpoint.
- **Dashboard session cleanup**: set `BETTER_FETCH_API_KEY` on
  `betterfetch-web` to the same static ops key used by `fetching-service`.
  The dashboard uses it server-side only to ask the backend to clear stored
  sessions and rotate future browser profile state.
- **Blog**: `/blog` renders markdown posts fetched at request time from the
  separate content repo (`BLOG_REPO`, default `PaulCrossland1/betterfetch-blog`,
  `posts/*.md` — currently private; the publishing contract lives in that
  repo's README).
  Fetches are cached with the `blog` tag; the content repo's GitHub Action
  POSTs to `/api/revalidate` (`Authorization: Bearer $BLOG_REVALIDATE_SECRET`)
  on push so posts go live without a redeploy. Setup:
  `fly secrets set -a betterfetch-web BLOG_REVALIDATE_SECRET=...`
  (plus `BLOG_GITHUB_TOKEN=...` — fine-grained, read-only contents — only if
  the content repo is private). Local preview without pushing:
  `BLOG_LOCAL_DIR=path/to/posts npm run dev`.
- **Old MCP service retired** (2026-06-12): the standalone
  `betterfetch-mcp` Fly app behind `mcp.betterfetch.co` was destroyed —
  it had no users; the in-app `/api/mcp` is the only server. Delete the
  `mcp` DNS record if one still exists.
