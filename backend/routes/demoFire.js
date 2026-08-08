const express = require("express");
const { ethers } = require("ethers");
const router = express.Router();

// In-memory session tracker so repeat clicks in the same session don't
// spam new transactions, and so each visitor's result is isolated to them.
const sessionTxCache = new Map(); // sessionId -> { txHash, firedAt }
const RATE_LIMIT_MS = 15_000; // don't let one session fire more than once per 15s

const XLAYER_TESTNET_RPC = process.env.XLAYER_TESTNET_RPC || "https://testrpc.xlayer.tech";
const DEMO_SIGNER_PRIVATE_KEY = process.env.DEMO_SIGNER_PRIVATE_KEY; // testnet key ONLY, funded with testnet OKB

if (!DEMO_SIGNER_PRIVATE_KEY) {
  console.warn("[demo-fire] DEMO_SIGNER_PRIVATE_KEY is not set — /api/demo-fire will fail until it is.");
}

const provider = new ethers.JsonRpcProvider(XLAYER_TESTNET_RPC);
const demoWallet = DEMO_SIGNER_PRIVATE_KEY ? new ethers.Wallet(DEMO_SIGNER_PRIVATE_KEY, provider) : null;

router.post("/demo-fire", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "sessionId is required" });
    }
    if (!demoWallet) {
      return res.status(503).json({ error: "Demo signer not configured" });
    }

    // Rate-limit per session — prevents one browser tab hammering this endpoint
    const cached = sessionTxCache.get(sessionId);
    if (cached && Date.now() - cached.firedAt < RATE_LIMIT_MS) {
      return res.json({ txHash: cached.txHash, cached: true });
    }

    // A tiny, harmless self-ping tx: 0 value, small memo in data field.
    // This is what makes each visitor's "fire" event a REAL, distinct, verifiable
    // testnet transaction rather than a shared/simulated one.
    const memo = ethers.hexlify(ethers.toUtf8Bytes(`buildos-demo:${sessionId.slice(0, 16)}`));
    const tx = await demoWallet.sendTransaction({
      to: demoWallet.address,
      value: 0,
      data: memo,
    });
    await tx.wait(1); // wait for 1 confirmation before responding

    sessionTxCache.set(sessionId, { txHash: tx.hash, firedAt: Date.now() });

    // basic cleanup so this map doesn't grow forever in a long-running process
    if (sessionTxCache.size > 5000) {
      const oldestKey = sessionTxCache.keys().next().value;
      sessionTxCache.delete(oldestKey);
    }

    res.json({ txHash: tx.hash, cached: false });
  } catch (err) {
    console.error("[demo-fire] error:", err);
    res.status(500).json({ error: "Failed to fire demo transaction" });
  }
});

module.exports = router;

// Records a transaction hash the USER's own wallet already signed and broadcast.
// This does NOT sign anything server-side — it just lets the Signal Monitor
// mark the agent as committed with the real, user-paid transaction on record.
router.post("/record-tx/:configHash", async (req, res) => {
  try {
    const { configHash } = req.params;
    const { txHash, from } = req.body || {};
    if (!txHash || !from) return res.status(400).json({ error: "txHash and from are required" });

    // TODO: wire this into wherever your Signal Monitor's agent store lives —
    // this stub just echoes back success so the frontend flow doesn't break.
    // Look at how commit-onchain currently updates agent.onchain and mirror that,
    // but set { committed: true, createTxHash: txHash, signer: from, selfSigned: true }.
    console.log(`[record-tx] agent ${configHash} committed by ${from}: ${txHash}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to record tx" });
  }
});
