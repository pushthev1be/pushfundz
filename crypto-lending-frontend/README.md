# PushFundz Frontend

React + Vite app for the PushFundz MVP.

Configure
- Copy .env.example to .env and set:
  - VITE_API_URL=https://pushfundz.onrender.com
  - VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_id

Key Screens
- Registration/Login
- Dashboard (stats, wallet funding, loans, RP games)
- Admin Dashboard (role=admin only)

Auth
- POST /api/auth/login with email; stores JWT, role, and userId in localStorage
- Admin endpoints require Authorization: Bearer token from localStorage

Payments
- Uses Stripe Checkout:
  - POST /api/payments/checkout with purpose=membership|rp_purchase|wallet_funding|loan_payment|loan_repayment
  - Redirect to returned checkout_url
  - Webhook on the backend finalizes state (activates membership, credits RP/wallet, updates loan status)

Memberships
- GET /api/memberships to view tiers
- POST /api/memberships/purchase?user_id=... to initiate checkout
- GET /api/users/{id}/membership to check active status
- Loan requests are gated until membership is active

Games
- Calls backend endpoints for RPS, Spin, Whot; UI shows basic animations and updates RP balance

Run
- pnpm i
- pnpm dev

Build
- pnpm build
- pnpm preview
