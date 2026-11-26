# vapi-x402-api

A tiny **x402-paywalled Web3 snapshot API**, built so its owner can complete the
vAPI Network quest **"List your API on vAPI"**. It uses the official x402
Express middleware (`@x402/express` v2) — unpaid calls to the paid route get a
proper **HTTP 402 x402 payment challenge**; payment settles in **USDC on Base
mainnet** via a public facilitator.

## Endpoints

| Route           | Price                     | What it returns                                   |
| --------------- | ------------------------- | ------------------------------------------------- |
| `GET /`         | free                      | Service info / discovery JSON                     |
| `GET /health`   | free                      | `{ ok: true, ... }` liveness check                |
| `GET /snapshot` | **$0.001 USDC via x402**  | JSON snapshot: live ETH/USD spot price + timestamp |

## The 402 challenge (verified live)

`GET /snapshot` without payment returns HTTP 402 with the challenge in the
`PAYMENT-REQUIRED` header **and** merged into the JSON body:

```json
{
  "x402Version": 2,
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "1000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0x8FF7cAC1527C61bdFA60e5fb2cB20cdf512AfC28",
      "maxTimeoutSeconds": 300,
      "extra": { "name": "USD Coin", "version": "2" }
    }
  ]
}
```

- `asset` = USDC on Base mainnet; `amount` = 1000 atomic units = $0.001.
- `payTo` is a public receive-only address — **no private key exists anywhere
  in this project** (x402 servers never need one; the facilitator settles).

## Configuration (env vars)

| Var               | Default                              | Notes |
| ----------------- | ------------------------------------ | ----- |
| `PORT`            | `3000`                               | Railway sets this automatically |
| `PAYTO_ADDRESS`   | `0x8FF7...Cf28`                      | Payment recipient |
| `X402_NETWORK`    | `eip155:8453`                        | Base mainnet |
| `X402_PRICE`      | `$0.001`                             | Per-call price |
| `FACILITATOR_URL` | `https://facilitator.payai.network`  | See note below |

**Facilitator note:** the public `x402.org/facilitator` only supports the
"exact" scheme on Base *Sepolia* for EVM — with it, a Base-mainnet route fails
to start (`Facilitator does not support scheme "exact" on network
"eip155:8453"`). PayAI's free public facilitator supports x402 v2 "exact" on
`eip155:8453`, so it is the default. No facilitator account or API key is used.

## Run locally

```bash
npm install
npm start          # node server.js
curl -i http://127.0.0.1:3000/health    # 200
curl -i http://127.0.0.1:3000/snapshot  # 402 + x402 challenge
```

## Deployment (Railway)

Deployed the same way as this account's other services (ProofCheck /
NGADUKUN-1): from this GitHub repo into the existing Railway project
**calm-clarity** as a **new, separate service**.

1. Railway dashboard → project `calm-clarity` → **New Service → GitHub Repo →
   `ngadukun/vapi-x402-api`** (Nixpacks detects Node; `railway.json` pins the
   start command `node server.js`).
2. Service → **Settings → Networking → Generate Domain** (the app listens on
   Railway's `$PORT`, no other config needed; no env vars required — defaults
   are production-correct).
3. Verify: `curl -i https://<domain>/health` → 200, and
   `curl -i https://<domain>/snapshot` → 402 with the challenge above.
   The URL to submit on vAPI is `https://<domain>/snapshot`.

To redeploy after a code change: push to `main` and use **Check for updates /
Redeploy** in the service's Source settings (auto-deploy on push was not
enabled on this account's other services).

## Stack

Node ≥18 · Express · `@x402/express` + `@x402/evm` + `@x402/core` (v2.32) ·
PayAI public facilitator · Railway (Nixpacks)
