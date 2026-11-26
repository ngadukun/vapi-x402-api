// vapi-x402-api — a tiny x402-paywalled Web3 snapshot API.
//
// One paid endpoint (GET /snapshot) sits behind the official x402 Express
// middleware (@x402/express v2). Unpaid requests get a proper HTTP 402
// x402 payment challenge (USDC, "exact" scheme). Free routes: / and /health.
//
// Config via env (defaults = Base mainnet):
//   PORT            listen port (Railway sets this)
//   PAYTO_ADDRESS   wallet that receives payments (public address only)
//   X402_NETWORK    CAIP-2 network id, default eip155:8453 (Base mainnet)
//   X402_PRICE      price string, default "$0.001"
//   FACILITATOR_URL default https://facilitator.payai.network — a free public
//                   facilitator that supports x402 v2 "exact" on Base mainnet
//                   (the x402.org facilitator only supports Base Sepolia for
//                   EVM "exact", which makes mainnet routes fail to start)

import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const PAYTO = process.env.PAYTO_ADDRESS || "0x8FF7cAC1527C61bdFA60e5fb2cB20cdf512AfC28";
const NETWORK = process.env.X402_NETWORK || "eip155:8453";
const PRICE = process.env.X402_PRICE || "$0.001";
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://facilitator.payai.network";
const PORT = process.env.PORT || 3000;

const app = express();

// Compatibility shim: x402 v2 carries the challenge in the PAYMENT-REQUIRED
// header and sends only {"error": ...} as the body. Some listing checkers
// (v1-style) look for the challenge JSON in the body instead — so for unpaid
// 402 responses on /snapshot, merge the decoded challenge into the JSON body
// as well. Paid requests and the header itself are untouched.
app.use("/snapshot", (req, res, next) => {
  const mergeChallenge = (payload) => {
    if (res.statusCode !== 402) return payload;
    const header = res.getHeader("PAYMENT-REQUIRED");
    if (!header) return payload;
    try {
      const challenge = JSON.parse(Buffer.from(String(header), "base64").toString("utf8"));
      const bodyObj = typeof payload === "string" ? JSON.parse(payload) : payload;
      if (!bodyObj || typeof bodyObj !== "object" || !("error" in bodyObj)) return payload;
      const merged = { ...challenge, error: bodyObj.error };
      return typeof payload === "string" ? JSON.stringify(merged) : merged;
    } catch {
      return payload;
    }
  };
  const origJson = res.json.bind(res);
  res.json = (body) => origJson(mergeChallenge(body));
  const origSend = res.send.bind(res);
  res.send = (body) => origSend(mergeChallenge(body));
  next();
});

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  NETWORK,
  new ExactEvmScheme(),
);

app.use(
  paymentMiddleware(
    {
      "GET /snapshot": {
        accepts: [
          {
            scheme: "exact",
            price: PRICE,
            network: NETWORK,
            payTo: PAYTO,
          },
        ],
        description: "Web3 snapshot: live ETH/USD spot price and Base chain status, as JSON",
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

// ---- Free routes -----------------------------------------------------------

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "vapi-x402-api", network: NETWORK, payTo: PAYTO });
});

app.get("/", (req, res) => {
  res.json({
    service: "vapi-x402-api",
    description:
      "A tiny x402-paywalled Web3 snapshot API. GET /snapshot returns a small JSON snapshot (ETH/USD spot + timestamp) and costs " +
      PRICE +
      " in USDC via the x402 protocol.",
    endpoints: {
      "GET /health": "free — liveness check",
      "GET /snapshot": "paid — " + PRICE + " USDC via x402 (" + NETWORK + ")",
    },
    payTo: PAYTO,
    network: NETWORK,
  });
});

// ---- Paid route ------------------------------------------------------------

async function fetchEthUsd() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    const amt = Number(j?.data?.amount);
    return Number.isFinite(amt) ? amt : null;
  } catch {
    return null;
  }
}

app.get("/snapshot", async (req, res) => {
  const ethUsd = await fetchEthUsd();
  res.json({
    service: "vapi-x402-api",
    snapshot: {
      asset: "ETH",
      quote: "USD",
      spot: ethUsd,
      chain: "base",
      network: NETWORK,
      timestamp: new Date().toISOString(),
    },
    note: "Delivered via x402 — paid with USDC on Base.",
  });
});

app.listen(PORT, () => {
  console.log(`vapi-x402-api listening on :${PORT} (network ${NETWORK}, payTo ${PAYTO})`);
});
