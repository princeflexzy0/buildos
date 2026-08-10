const http = require("http");

const PORT = process.env.MONITOR_PORT || 3002;

// Test recipient — a fresh address visible on-chain
const RECIPIENT = "0x7dFe4Faf566FC8caBE4533324A881F5702000D45";

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { hostname: "localhost", port: PORT, path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
      (res) => {
        let raw = "";
        res.on("data", c => raw += c);
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: "localhost", port: PORT, path }, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    }).on("error", reject);
  });
}

async function main() {
  console.log("=== BuildOS Escrow End-to-End Test ===\n");

  // 1. Create escrow deposit
  console.log("1. Creating escrow deposit (0.001 OKB) ...");
  const deposit = await post("/commit", {
    config: { label: "Test Agent", beneficiaryLetter: "This is a test payout." },
    recipient: RECIPIENT,
    amount: "0.001",
    recipientEmail: null,
    ownerEmail: null,
  });
  console.log("   Status:", deposit.status);
  console.log("   Response:", JSON.stringify(deposit.body, null, 2));

  if (!deposit.body.depositId) {
    console.error("\n❌ No depositId returned — check server is running on port", PORT);
    process.exit(1);
  }

  const depositId = deposit.body.depositId;
  const claimUrl = deposit.body.claimUrl;
  console.log(`\n   ✅ Deposit #${depositId} created`);
  console.log(`   Claim URL: ${claimUrl}`);
  console.log(`   Explorer: https://www.okx.com/web3/explorer/xlayer-test/tx/${deposit.body.txHash}\n`);

  // 2. Check claim-info
  console.log("2. Checking claim-info ...");
  const info = await get(`/claim-info/${depositId}`);
  console.log("   Response:", JSON.stringify(info.body, null, 2));

  // 3. Wait for unlock (contract unlocks after 2 min)
  console.log("\n3. Waiting 130 seconds for escrow unlock ...");
  await new Promise(r => setTimeout(r, 130000));

  // 4. Claim without code (relayer path — no wallet needed)
  console.log("4. Claiming deposit ...");
  const claim = await post(`/claim/${depositId}`, { code: "" });
  console.log("   Status:", claim.status);
  console.log("   Response:", JSON.stringify(claim.body, null, 2));

  if (claim.body.success) {
    console.log(`\n✅ SUCCESS — funds released`);
    console.log(`   Recipient: ${claim.body.recipient}`);
    console.log(`   Amount:    ${claim.body.amount} OKB`);
    console.log(`   TX:        https://www.okx.com/web3/explorer/xlayer-test/tx/${claim.body.txHash}`);
  } else {
    console.error("\n❌ CLAIM FAILED:", claim.body.error);
  }
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
