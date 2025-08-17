# PushFundz

End-to-end MVP for crypto lending with memberships, Stripe payments, admin RBAC, RP games, and wallet-aware config.

Public backend base URL
- https://pushfundz.onrender.com

Stripe Webhook
- URL: https://pushfundz.onrender.com/api/payments/webhook
- Events: checkout.session.completed, payment_intent.succeeded
- Signing secret: configure via env STRIPE_WEBHOOK_SECRET

Repos
- crypto-lending-backend (FastAPI)
- crypto-lending-frontend (Vite/React)
- backend/microservices/games-service (legacy; consolidated into backend)

Quick Start
- Backend: see crypto-lending-backend/README.md
- Frontend: see crypto-lending-frontend/README.md

Key Flows
- Memberships: GET /api/memberships, POST /api/memberships/purchase?user_id=... -> Stripe Checkout; webhook activates 30-day membership
- Loans: require active membership; admin approval; payment via Checkout; repayment updates credit score
- Admin: POST /api/auth/login returns JWT; protected endpoints:
  - POST /api/loans/{loan_id}/approve
  - GET /api/admin/negative-balances
- Games: RPS/Spin/Whot via backend with house-biased RNG and RP ledger

Configuration
- Wallets:
  - MERCHANT_WALLET_SOL: 5fruTPA9LFbbSS8GmbhELfv5o8zucRmCVnM7xp5kRCVd
  - MERCHANT_WALLET_ETH: 0x87b5DcB8D247960627963917685B6C0b8501Ba35
- Stripe:
  - STRIPE_SECRET_KEY
  - STRIPE_WEBHOOK_SECRET
- Auth:
  - SIGNING_SECRET
  - ADMIN_EMAIL
- Frontend:
  - VITE_API_URL=https://pushfundz.onrender.com
  - VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_id

Security
- Admin endpoints require JWT with role=admin
- Stripe signatures verified on webhook
- No secrets committed; use environment variables only

Links
- PR: https://github.com/pushthev1be/pushfundz/pull/4
- Link to Devin run: https://app.devin.ai/sessions/b7ddef165c7346dcb642e5113dd0abc0

## Deploy on Render (Backend)

1) Set environment variables (Render → Service → Environment):
- PAYMENT_PROCESSOR=stripe
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- SUPPORTED_CURRENCIES=USD
- MERCHANT_WALLET_SOL=5fruTPA9LFbbSS8GmbhELfv5o8zucRmCVnM7xp5kRCVd
- MERCHANT_WALLET_SOL_NETWORK=mainnet
- MERCHANT_WALLET_ETH=0x87b5DcB8D247960627963917685B6C0b8501Ba35
- MERCHANT_WALLET_ETH_NETWORK=mainnet
- SIGNING_SECRET=Generate a strong random string (>=32 chars)
- ADMIN_EMAIL=admin email (matches the account you want as admin)

2) Redeploy the backend.

3) Stripe webhook (Dashboard → Developers → Webhooks):
- Endpoint URL: https://pushfundz.onrender.com/api/payments/webhook
- Events: checkout.session.completed, payment_intent.succeeded
- Use your signing secret in STRIPE_WEBHOOK_SECRET

4) Verify:
- GET https://pushfundz.onrender.com/healthz returns {"status":"ok"}
- GET https://pushfundz.onrender.com/api/memberships returns the seeded tiers
- POST https://pushfundz.onrender.com/api/auth/login issues a JWT
- POST /api/memberships/purchase redirects to Stripe Checkout; webhook activates membership

Frontend:
- Set VITE_API_URL=https://pushfundz.onrender.com
- Build with pnpm build and deploy your static site as desired
