const http = require("http");
const { issueToken, verifyToken } = require("./magiclink");
const { verifySignature, isRegisteredGuardian } = require("./walletsig");
const {
  registerAgent,
  getAgent,
  listAgents,
  checkin,
  simulateSignal,
  tickAll,
  commitOnchain,
  commitVerdictOnchain,
  deleteAgent,
  setBeneficiaryLetter,
  guardianCheckin,
  saveToDisk,
} = require("./index");
const chain = require("./chain");

const PORT = process.env.MONITOR_PORT || 3002;
const TICK_INTERVAL_MS = 10000;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  const parts = req.url.split("?")[0].split("/").filter(Boolean);

  if (req.method === "GET" && parts[0] === "health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", service: "BuildOS Signal Monitor" }));
  }

  if (req.method === "GET" && parts[0] === "status") {
    if (parts[1]) {
      const agent = getAgent(parts[1]);
      if (!agent) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "agent not found" }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, agent }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    const owner = new URL("http://x" + req.url).searchParams.get("owner");
    return res.end(JSON.stringify({ success: true, agents: listAgents(owner) }));
  }

  if (req.method === "GET" && parts[0] === "status" && parts[1] && parts[2] === "balance") {
    const agent = getAgent(parts[1]);
    if (!agent) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "agent not found" }));
    }
    if (!agent.onchain.committed || !agent.onchain.agentId) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, committed: false }));
    }
    try {
      const balanceInfo = await chain.getAgentBalance(agent.onchain.agentId);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, committed: true, ...balanceInfo }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (req.method === "DELETE" && parts[0] === "status" && parts[1]) {
    const existed = deleteAgent(parts[1]);
    if (!existed) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "agent not found" }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === "POST" && parts[0] === "register") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Invalid JSON body" }));
    }
    const config = body.config || body;
    if (!config || !config.agentType) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "valid agent config required" }));
    }
    const ownerAddress = (body.ownerAddress || "").toLowerCase() || null;
    const state = registerAgent(config, ownerAddress);
    // Issue magic-link tokens for each guardian that has an email
    if (Array.isArray(config.guardians)) {
      for (const g of config.guardians) {
        if (g && typeof g === "object" && g.email && g.name) {
          issueToken(state.hash, g.name, g.email).catch((e) =>
            console.warn("[magiclink] failed to send to", g.email, e.message)
          );
        }
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ success: true, agent: state }));
  }

  if (req.method === "POST" && parts[0] === "letter" && parts[1]) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { letter } = JSON.parse(body || "{}");
        const agent = setBeneficiaryLetter(parts[1], letter);
        if (!agent) {
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "agent not found" }));
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, agent }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "invalid body" }));
      }
    });
    return;
  }
  if (req.method === "POST" && parts[0] === "checkin" && parts[1]) {
    const state = checkin(parts[1]);
    if (!state) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "agent not found" }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ success: true, agent: state }));
  }

  // Magic-link token verification — guardian clicks emailed link
  if (req.method === "GET" && parts[0] === "guardian" && parts[1] === "verify") {
    const urlObj = new URL(req.url, "http://localhost");
    const token = urlObj.searchParams.get("token");
    if (!token) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "missing token" }));
    }
    const claimed = verifyToken(token);
    if (!claimed) {
      res.writeHead(403, { "Content-Type": "text/html" });
      return res.end("<h2>Invalid or already-used link. Ask the agent owner to resend.</h2>");
    }
    const result = guardianCheckin(claimed.agentHash, claimed.guardianName);
    if (result.error) {
      res.writeHead(400, { "Content-Type": "text/html" });
      return res.end(`<h2>Check-in failed: ${result.error}</h2>`);
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    const msg = result.pending
      ? `Confirmed! ${result.confirmedCount} of ${result.threshold} guardians have checked in.`
      : "All guardians confirmed — countdown reset. Thank you!";
    return res.end(`<h2>✅ ${msg}</h2>`);
  }

  if (req.method === "POST" && parts[0] === "guardian-checkin" && parts[1]) {
    let body;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Invalid JSON body" }));
    }
    const result = guardianCheckin(parts[1], body.name);
    if (result.error === "not_found") {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "agent not found" }));
    }
    if (result.error === "not_a_guardian") {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "name not recognized as a guardian for this agent" }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: true,
      agent: result.state,
      pending: result.pending,
      confirmedCount: result.confirmedCount,
      threshold: result.threshold,
      confirmedBy: result.confirmedBy,
    }));
  }

  // Wallet-signature guardian check-in
  if (req.method === "POST" && parts[0] === "guardian-sig" && parts[1]) {
    let body;
    try { body = await readBody(req); } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Invalid JSON body" }));
    }
    const state = getAgent(parts[1]);
    if (!state) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "agent not found" }));
    }
    const { address, signature } = body;
    if (!address || !signature) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "address and signature required" }));
    }
    if (!isRegisteredGuardian(state, address)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "address not registered as guardian" }));
    }
    const verified = verifySignature(parts[1], address, signature);
    if (!verified) {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "signature invalid" }));
    }
    // Find guardian name from address
    const guardian = state.guardians.find(
      g => typeof g === "object" && (g.address || "").toLowerCase() === address.toLowerCase()
    );
    const result = guardianCheckin(parts[1], guardian ? guardian.name : address);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: true,
      pending: result.pending,
      confirmedCount: result.confirmedCount,
      threshold: result.threshold,
    }));
  }

  // Record escrow deposit ID after frontend commits to EscrowVault
  if (req.method === "POST" && parts[0] === "record-deposit" && parts[1]) {
    let body;
    try { body = await readBody(req); } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Invalid JSON body" }));
    }
    const state = getAgent(parts[1]);
    if (!state) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "agent not found" }));
    }
    state.escrowDepositId = body.depositId;
    state.escrowTxHash = body.txHash;
    saveToDisk();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === "POST" && parts[0] === "simulate" && parts[1]) {
    let body;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Invalid JSON body" }));
    }
    if (!body.signalType) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "signalType required" }));
    }
    const state = simulateSignal(parts[1], body.signalType);
    if (!state) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "agent or signalType not found" }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ success: true, agent: state }));
  }

  // POST /commit — register agent + deposit to escrow from backend + send claim email
  if (req.method === "POST" && parts[0] === "commit") {
    let body;
    try { body = await readBody(req); } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Invalid JSON body" }));
    }
    const { config, recipient, amount, recipientEmail, ownerEmail } = body;
    if (!config || !recipient || !amount) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "config, recipient, and amount required" }));
    }
    try {
      // 1. Register agent
      const state = registerAgent(config, null);
      // 2. Deposit to escrow from backend wallet
      const unlockAt = Math.floor(Date.now() / 1000) + 120; // 2 min — relayer releases immediately after
      const { txHash, depositId } = await chain.depositToEscrow(recipient, amount, unlockAt);
      state.escrowDepositId = depositId;
      state.escrowTxHash = txHash;
      state.escrowRecipient = recipient;
      state.escrowAmount = amount;
      saveToDisk();
      // 3. Wait 2 min then auto-release (fire and forget)
      setTimeout(async () => {
        try {
          await chain.releaseEscrow(depositId);
          console.log(`[auto-release] deposit ${depositId} released`);
        } catch(e) {
          console.error(`[auto-release] failed:`, e.message);
        }
      }, 130000); // 2min 10sec
      // 4. Send claim email to recipient
      const claimUrl = `\${process.env.SITE_URL || "https://buildos.tech"}/claim.html#\${depositId}`;
      if (recipientEmail) {
        await notifier.sendTriggerFiredBeneficiaryEmail({
          to: recipientEmail,
          label: config.label || "BuildOS Agent",
          statusUrl: claimUrl,
          depositId,
          claimUrl,
        }).catch(e => console.warn("[email] failed:", e.message));
      }
      // 5. Notify owner
      if (ownerEmail) {
        await notifier.sendTriggerFiredOwnerEmail({
          to: ownerEmail,
          label: config.label || "BuildOS Agent",
          statusUrl: `\${process.env.SITE_URL || "https://buildos.tech"}/console.html`,
        }).catch(e => console.warn("[email] owner notify failed:", e.message));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, txHash, depositId, claimUrl }));
    } catch(err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // POST /commit-onchain/:hash - creates the real AgentFactory.createAgent() tx
  if (req.method === "POST" && parts[0] === "commit-onchain" && parts[1]) {
    try {
      const state = await commitOnchain(parts[1]);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, agent: state }));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // POST /commit-verdict/:hash - pushes current signal/consensus state onchain
  if (req.method === "POST" && parts[0] === "commit-verdict" && parts[1]) {
    try {
      const state = await commitVerdictOnchain(parts[1]);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, agent: state }));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // POST /claim/:depositId - backend releases escrow to recipient (no wallet needed)
  if (req.method === "POST" && parts[0] === "claim" && parts[1]) {
    const depositId = parts[1];
    try {
      // Check deposit exists and is unlocked
      const deposit = await chain.getEscrowDeposit(depositId);
      if (deposit.released) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, already: true, message: "Already claimed" }));
      }
      if (deposit.refunded) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Deposit was refunded to sender" }));
      }
      const now = Math.floor(Date.now() / 1000);
      if (now < Number(deposit.unlockAt)) {
        const secsLeft = Number(deposit.unlockAt) - now;
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Not yet unlocked", secsLeft }));
      }
      // Release funds to recipient via direct transfer (relayer pattern)
      const { txHash } = await chain.relayTransfer(deposit.recipient, deposit.amount);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ 
        success: true, 
        txHash,
        recipient: deposit.recipient,
        amount: deposit.amount
      }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`BuildOS Signal Monitor running on http://localhost:${PORT}`);
  console.log(`Auto-tick every ${TICK_INTERVAL_MS / 1000}s`);
  setInterval(tickAll, TICK_INTERVAL_MS);
});

// Wallet-signature guardian check-in
// POST /guardian-sig/:hash  { address, signature }
