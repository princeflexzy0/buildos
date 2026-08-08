let demoInterval = null;
let demoSeconds = 30;
let demoRunning = false;
let demoSessionId = null;

function getDemoSessionId() {
  if (!demoSessionId) demoSessionId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
  return demoSessionId;
}

const TEMPLATE_DESCRIPTIONS = {
  chronicle: "release my savings to my daughter if I don't check in for 6 months",
  sentinel: "release payment to my supplier when shipment tracking confirms delivery",
  guardian: "pay out insurance to policyholder if flight delay exceeds 3 hours",
  warden: "reveal my sealed document to my lawyer if I miss 3 weekly check-ins",
  escrow: "release funds to seller only when both buyer and seller confirm receipt",
  subscription: "send 10 OKB to this address every 30 days until cancelled",
};

function loadTemplate(type) {
  const desc = TEMPLATE_DESCRIPTIONS[type];
  if (!desc) return;
  const input = document.getElementById("compilerInput");
  if (input) { input.value = desc; input.focus(); document.getElementById("compileBtn")?.click(); }
}

function resetDemoUI() {
  clearInterval(demoInterval);
  demoRunning = false;
  demoSeconds = 30;
  const display = document.getElementById("timerDisplay");
  const status = document.getElementById("timerStatus");
  const btn = document.getElementById("demoBtn");
  const stopBtn = document.getElementById("demoStopBtn");
  const checkinBtn = document.getElementById("checkinBtn");
  display.textContent = "30";
  display.style.color = "";
  status.textContent = "Press Start to begin";
  status.style.color = "";
  btn.disabled = false;
  btn.textContent = "Start Live Demo";
  btn.style.display = "";
  stopBtn.style.display = "none";
  checkinBtn.disabled = true;
  document.getElementById("demoTxHash").style.display = "none";
}

function startDemo() {
  if (demoRunning) return;
  demoRunning = true;
  demoSeconds = 30;
  const btn = document.getElementById("demoBtn");
  const stopBtn = document.getElementById("demoStopBtn");
  const checkinBtn = document.getElementById("checkinBtn");
  const status = document.getElementById("timerStatus");
  const display = document.getElementById("timerDisplay");
  btn.style.display = "none";
  stopBtn.style.display = "block";
  checkinBtn.disabled = false;
  display.style.color = "";
  status.textContent = "Agent is watching… check in to reset";
  status.style.color = "var(--accent-text)";

  demoInterval = setInterval(() => {
    demoSeconds--;
    display.textContent = demoSeconds;
    if (demoSeconds <= 10) {
      display.style.color = "#E24B4A";
      status.textContent = "⚠️ Agent about to fire!";
      status.style.color = "#E24B4A";
    }
    if (demoSeconds <= 0) {
      clearInterval(demoInterval);
      demoRunning = false;
      display.textContent = "🔥";
      checkinBtn.disabled = true;
      stopBtn.style.display = "none";
      btn.style.display = "";
      btn.textContent = "Run Demo Again";
      fireDemoTx();
    }
  }, 1000);
}

// Explicit stop/pause — cancels the countdown, no tx fires
function stopDemo() {
  if (!demoRunning) return;
  clearInterval(demoInterval);
  demoRunning = false;
  document.getElementById("timerStatus").textContent = "Demo stopped — no transaction fired";
  document.getElementById("timerStatus").style.color = "var(--text-dim)";
  document.getElementById("demoStopBtn").style.display = "none";
  document.getElementById("demoBtn").style.display = "";
  document.getElementById("demoBtn").textContent = "Start Live Demo";
  document.getElementById("checkinBtn").disabled = true;
}

function doCheckin() {
  if (!demoRunning) return;
  demoSeconds = 30;
  document.getElementById("timerDisplay").style.color = "";
  document.getElementById("timerStatus").textContent = "✓ Checked in — timer reset";
  document.getElementById("timerStatus").style.color = "var(--accent-text)";
  setTimeout(() => { if (demoRunning) document.getElementById("timerStatus").textContent = "Agent is watching… check in to reset"; }, 1500);
}

async function fireDemoTx() {
  const status = document.getElementById("timerStatus");
  const box = document.getElementById("demoTxHash");
  status.textContent = "Broadcasting your demo transaction…";
  status.style.color = "var(--accent-text)";

  try {
    const res = await fetch("/api/demo-fire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getDemoSessionId() }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Server returned ${res.status}`);
    }
    const { txHash } = await res.json();
    status.textContent = "Agent fired! This is your own live testnet transaction.";
    box.style.display = "block";
    box.className = "demo-tx demo-tx-success";
    box.innerHTML = `<span class="pulse"></span> Your tx — <a href="https://www.okx.com/web3/explorer/xlayer-test/tx/${txHash}" target="_blank">${txHash.slice(0,10)}…${txHash.slice(-6)} ↗</a>`;
  } catch (err) {
    console.error("demo-fire error:", err);
    status.textContent = "Couldn't reach the demo signer.";
    status.style.color = "#E24B4A";
    box.style.display = "block";
    box.className = "demo-tx demo-tx-error";
    box.innerHTML = `⚠️ Demo backend unreachable (${err.message}). This means the live tx couldn't be sent — check the server is running and the demo wallet is funded.`;
  }
}
