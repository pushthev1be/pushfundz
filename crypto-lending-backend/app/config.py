import os

def get_env(name: str, default: str | None = None) -> str | None:
    return os.getenv(name, default)

PAYMENT_PROCESSOR = get_env("PAYMENT_PROCESSOR", "none")
STRIPE_SECRET_KEY = get_env("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = get_env("STRIPE_WEBHOOK_SECRET")
SUPPORTED_CURRENCIES = [c.strip().upper() for c in (get_env("SUPPORTED_CURRENCIES", "USD") or "").split(",") if c.strip()]

MERCHANT_WALLET_SOL = get_env("MERCHANT_WALLET_SOL")
MERCHANT_WALLET_SOL_NETWORK = get_env("MERCHANT_WALLET_SOL_NETWORK", "mainnet")
MERCHANT_WALLET_ETH = get_env("MERCHANT_WALLET_ETH")
MERCHANT_WALLET_ETH_NETWORK = get_env("MERCHANT_WALLET_ETH_NETWORK", "mainnet")
SIGNING_SECRET = get_env("SIGNING_SECRET")
ADMIN_EMAIL = get_env("ADMIN_EMAIL")
