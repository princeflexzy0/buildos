let demoInterval = null;
let demoSeconds = 30;
let demoRunning = false;

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
  if (input) {
    input.value = desc;
    input.focus();
    document.getElementById("console").scrollIntoView({ behavior: "smooth" });
    document.getElementById("compileBtn").click();
  }
}

function startDemo() {
  if (demoRunning) return;
  demoRunning = true;
  demoSeconds = 30;
  const btn = document.getElementById("demoBtn");
  const checkinBtn = document.getElementById("checkinBtn");
  const status = document.getElementById("timerStatus");
  const display = document.getElementById("timerDisplay");
  btn.disabled = true;
  btn.textContent = "Demo Running…";
  checkinBtn.disabled = false;
  status.textContent = "Agent is watching… check in to reset";
  status.style.color = "var(--accent-text)";

  // auto-compile the demo agent
  const input = document.getElementById("compilerInput");
  if (input) {
    input.value = "send a ping transaction if I don't check in within 30 seconds";
    document.getElementById("console").scrollIntoView({ behavior: "smooth" });
    setTimeout(() => document.getElementById("compileBtn").click(), 500);
  }

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
      status.textContent = "Agent fired! Check Signal Monitor for tx hash.";
      status.style.color = "var(--accent-text)";
      checkinBtn.disabled = true;
      btn.disabled = false;
      btn.textContent = "Run Demo Again";
      showDemoTx();
    }
  }, 1000);
}

function doCheckin() {
  if (!demoRunning) return;
  demoSeconds = 30;
  document.getElementById("timerDisplay").style.color = "var(--text)";
  document.getElementById("timerStatus").textContent = "✓ Checked in — timer reset";
  document.getElementById("timerStatus").style.color = "var(--accent-text)";
  setTimeout(() => {
    if (demoRunning) document.getElementById("timerStatus").textContent = "Agent is watching… check in to reset";
  }, 1500);
}

function showDemoTx() {
  const box = document.getElementById("demoTxHash");
  box.style.display = "block";
  box.innerHTML = `<span class="pulse"></span> Demo tx fired — <a href="https://www.okx.com/web3/explorer/xlayer-test" target="_blank" style="color:var(--accent-text)">View on X Layer Explorer ↗</a>`;
}
