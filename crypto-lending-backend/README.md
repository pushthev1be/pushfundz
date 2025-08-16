Backend (FastAPI) - PushFundz

Setup
- Python 3.12
- pip install -r requirements.txt
- Configure environment (Render or local) using .env.example:
  - PAYMENT_PROCESSOR=stripe
  - STRIPE_SECRET_KEY
  - STRIPE_WEBHOOK_SECRET
  - SUPPORTED_CURRENCIES=USD
  - MERCHANT_WALLET_SOL, MERCHANT_WALLET_SOL_NETWORK
  - MERCHANT_WALLET_ETH, MERCHANT_WALLET_ETH_NETWORK
  - SIGNING_SECRET
  - ADMIN_EMAIL

Run
PAYMENT_PROCESSOR=stripe STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... uvicorn app.main:app --host 0.0.0.0 --port 8000

Health
GET /healthz -> { status: ok }

Stripe
- Webhook URL: https://pushfundz.onrender.com/api/payments/webhook
- Events: checkout.session.completed, payment_intent.succeeded
- Success URL: https://pushfundz.onrender.com/payments/success
- Cancel URL: https://pushfundz.onrender.com/payments/cancel

Payments
- POST /api/payments/checkout -> { checkout_url, transaction_id }
  - body: { purpose, amount, currency, meta: { user_id, membership_code|loan_id|rp_bundle } }
- POST /api/payments/webhook -> Stripe signs; server updates Transaction and applies side-effects by purpose:
  - membership: create/extend active UserMembership (30 days)
  - rp_purchase: credit PointsLedger (RP_PURCHASE)
  - wallet_funding: credit fiat_balance
  - loan_payment: mark approved loan ACTIVE
  - loan_repayment: mark loan REPAID and bump credit score

Auth & Admin
- POST /api/auth/login { email } -> { access_token, role }
- Admin endpoints require Bearer token with role=admin:
  - POST /api/loans/{loan_id}/approve
  - GET /api/admin/negative-balances

Memberships & Loans
- GET /api/memberships -> tiers (Starter/Standard/Premium)
- Loans require active membership; amount must be within tier limit
- GET /api/users/{user_id} -> user summary + loans

Games (RP)
- Daily drip: POST /api/games/daily-drip
- RPS: POST /api/games/rps (biased: house favored ~60% CPU win)
- Spin: POST /api/games/spin (heavily reduced high reward odds)
- Whot: POST /api/games/whot (~12% player win)
All game endpoints debit/credit RP via PointsLedger and return { rp_won, new_rp_balance } fields.

Security
- Do not log secrets
- Use SIGNING_SECRET and ADMIN_EMAIL envs
- Add rate limiting at the proxy (Render) or app layer as needed

Verification
- Create a Checkout for membership; pay with 4242 test card; verify membership active afterward
- Attempt loan without membership should 403; with membership should pass within tier limit
- Admin-only endpoints reject non-admin and accept admin
- Play games and verify RP movements and biased outcomes
