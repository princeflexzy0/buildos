const { COMPILER_URL, MONITOR_URL, EXPLORER_ADDRESS_BASE, EXPLORER_TX_BASE } = window.BUILDOS_CONFIG;

const compilerInput = document.getElementById("compilerInput");
const compileBtn = document.getElementById("compileBtn");
const compilerOutput = document.getElementById("compilerOutput");
const registerBtn = document.getElementById("registerBtn");
const commitBtn = document.getElementById("commitBtn");
const agentList = document.getElementById("agentList");
const refreshBtn = document.getElementById("refreshBtn");
const chainStatus = document.getElementById("chainStatus");

const SUPPORTED_TOKENS = ["OKB", "USDT", "USDC"];

let currentConfig = null;
let rawConfig = null;

// ─── Health ───────────────────────────────────────────────────────────────────
async function checkHealth() {
  if (!chainStatus) return;
  try {
    const [c, m] = await Promise.all([
      fetch(`${COMPILER_URL}/health`).then(r => r.json()),
      fetch(`${MONITOR_URL}/health`).then(r => r.json()),
    ]);
    chainStatus.innerHTML = `<span class="pulse"></span> compiler: ${c.hasApiKey ? "ready" : "no key"} · monitor: online`;
  } catch (e) {
    chainStatus.innerHTML = `<span class="pulse" style="background:var(--danger)"></span> backend unreachable`;
  }
}

// ─── Wallet balance ───────────────────────────────────────────────────────────
async function fetchWalletBalance(address) {
  const balBar = document.getElementById("walletBalanceBar");
  if (!balBar || !address) return;
  balBar.style.display = "flex";
  balBar.innerHTML = `<span>Balance:</span> <strong>loading…</strong>`;
  try {
    const rpc = "https://testrpc.xlayer.tech";
    const res = await fetch(rpc, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
    });
    const json = await res.json();
    const okb = (parseInt(json.result, 16) / 1e18).toFixed(4);
    balBar.innerHTML = `<span>Wallet balance (testnet):</span> <strong>${okb} OKB</strong>`;
  } catch {
    balBar.innerHTML = `<span>Balance unavailable</span>`;
  }
}

// ─── Normalize compiler response ──────────────────────────────────────────────
function normalizeConfig(raw) {
  const trigger = raw.triggers?.[0];
  const action = raw.action || {};
  const amountMatch = (action.description || raw.description || "").match(/([\d.]+)\s*(OKB|USDT|USDC)/i);
  const amount = amountMatch ? amountMatch[1] : null;
  const token = amountMatch ? amountMatch[2].toUpperCase() : null;
  const addrMatch = (raw.inputDescription || "").match(/0x[a-fA-F0-9]{40}/);
  const recipient = addrMatch ? addrMatch[0] : null;
  return {
    label: raw.label || raw.agentType || "Agent",
    action: action.type || action.description || "—",
    amount, token, recipient,
    trigger: trigger?.description || trigger?.type || "—",
    triggerSeconds: trigger?.thresholdSeconds,
    requiresBeneficiary: action.requiresBeneficiary || false,
    configHash: raw.configHash || null,
  };
}

function isValidAddress(addr) {
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

// ─── Commit button gate ───────────────────────────────────────────────────────
function updateCommitGate() {
  const addrValid = isValidAddress(currentConfig?.recipient);
  const registered = !!currentConfig?.configHash;
  const walletOk = isDemoMode || !!connectedAddress;
  commitBtn.disabled = !(addrValid && registered && walletOk);
}

// ─── Gas estimate ─────────────────────────────────────────────────────────────
async function estimateAndShowGas(config) {
  const gasBox = document.getElementById("gasEstimateBox");
  if (!gasBox || !isValidAddress(config.recipient)) return;
  gasBox.style.display = "block";
  gasBox.className = "gas-estimate gas-estimate-loading";
  gasBox.textContent = "Estimating gas…";
  try {
    const rpc = "https://testrpc.xlayer.tech";
    const valueHex = config.amount ? "0x" + Math.floor(Number(config.amount) * 1e18).toString(16) : "0x0";
    const [gasRes, priceRes] = await Promise.all([
      fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_estimateGas", params: [{ to: config.recipient, value: valueHex }] }) }),
      fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_gasPrice", params: [] }) }),
    ]);
    const gasJson = await gasRes.json();
    const priceJson = await priceRes.json();
    if (gasJson.error) throw new Error(gasJson.error.message);
    const feeOKB = (parseInt(gasJson.result, 16) * parseInt(priceJson.result, 16)) / 1e18;
    gasBox.className = "gas-estimate gas-estimate-ready";
    gasBox.innerHTML = `Estimated network fee: <strong>${feeOKB.toFixed(6)} OKB</strong> (testnet)`;
  } catch {
    gasBox.className = "gas-estimate gas-estimate-error";
    gasBox.textContent = "Couldn't estimate gas — network may be unreachable.";
  }
}

// ─── Render compiled config review panel ──────────────────────────────────────
function renderCompiledConfigForReview() {
  const addrValid = isValidAddress(currentConfig.recipient);
  const days = currentConfig.triggerSeconds ? Math.round(currentConfig.triggerSeconds / 86400) : null;
  compilerOutput.innerHTML = `
    <div class="config-review">
      <div class="config-row"><label>Agent</label><span>${currentConfig.label}</span></div>
      <div class="config-row"><label>Action</label><span>${currentConfig.action}</span></div>
      <div class="config-row">
        <label>Amount</label>
        <span class="amount-edit-wrap">
          <input type="number" id="amountInput" placeholder="0.0" min="0" step="any"
                 value="${currentConfig.amount ?? ""}">
          <select id="tokenSelect">
            <option value="OKB" ${(!currentConfig.token || currentConfig.token === "OKB") ? "selected" : ""}>OKB</option>
            <option value="USDT" ${currentConfig.token === "USDT" ? "selected" : ""}>USDT</option>
            <option value="USDC" ${currentConfig.token === "USDC" ? "selected" : ""}>USDC</option>
          </select>
        </span>
      </div>
      <div class="config-row ${addrValid ? "" : "config-row-warn"}">
        <label>Recipient</label>
        <input type="text" id="recipientInput" placeholder="0x… wallet address"
               value="${addrValid ? currentConfig.recipient : ""}">
      </div>
      <div class="config-row"><label>Trigger</label><span>${currentConfig.trigger}${days ? ` (${days} days)` : ""}</span></div>
      <div class="config-row" id="balanceRow" style="display:none">
        <label>Escrow Balance</label>
        <span id="balanceValue">—</span>
      </div>
      <div class="config-row" id="escrowRow" style="display:none;flex-direction:column;align-items:stretch">
        <label>Escrow Lock <span style="font-weight:400;opacity:0.6;font-size:0.85em">(1% protocol fee on withdrawal)</span></label>
        <span class="amount-edit-wrap">
          <select id="escrowDurationSelect">
            <option value="0.00139">2 minutes (demo)</option>
            <option value="7">7 days</option>
            <option value="14" selected>14 days</option>
            <option value="30">30 days</option>
          </select>
          <select id="escrowTokenSelect" title="ERC-20 escrow deposits are coming soon">
            <option value="NATIVE">OKB (native)</option>
            <option value="USDT" disabled>USDT (coming soon)</option>
            <option value="USDC" disabled>USDC (coming soon)</option>
          </select>
          <button class="btn-small btn-primary" id="depositEscrowBtn">Deposit to Escrow</button>
        </span>
      </div>
      <div class="config-row" id="escrowStatusRow" style="display:none">
        <label>Escrow Status</label>
        <span id="escrowStatusValue">—</span>
      </div>
      <div class="config-row" id="letterRow" style="display:none;flex-direction:column;align-items:stretch">
        <label>Letter to Beneficiary <span style="font-weight:400;opacity:0.6;font-size:0.85em">(optional, AI-drafted)</span></label>
        <textarea id="letterNotes" placeholder="Rough notes... e.g. tell her I love her and this is for her wedding" rows="2" style="width:100%;margin-top:6px;font-family:inherit"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn-small" id="draftLetterBtn">AI-Draft It</button>
          <button class="btn-small btn-primary" id="saveLetterBtn" style="display:none">Save Letter</button>
        </div>
        <div id="letterPreview" style="display:none;margin-top:10px;padding:12px;background:#faf9f5;border-left:3px solid var(--accent);font-style:italic;white-space:pre-wrap"></div>
      </div>
      <div class="config-row" id="guardiansRow" style="flex-direction:column;align-items:stretch">
        <label>Trusted Guardians <span style="font-weight:400;opacity:0.6;font-size:0.85em">(optional — names of people who can also confirm you're okay)</span></label>
        <input type="text" id="guardianNamesInput" placeholder="e.g. Mom, Uncle James" style="width:100%;margin-top:6px">
      </div>
      <div class="config-row" id="guardianThresholdRow" style="flex-direction:column;align-items:stretch">
        <label>Guardians Required <span style="font-weight:400;opacity:0.6;font-size:0.85em">(how many must confirm to reset the countdown)</span></label>
        <input type="number" id="guardianThresholdInput" min="1" value="1" style="width:100%;margin-top:6px">
      </div>
      <div class="config-row" id="ownerEmailRow" style="flex-direction:column;align-items:stretch">
        <label>Your Email <span style="font-weight:400;opacity:0.6;font-size:0.85em">(get warned before this agent triggers)</span></label>
        <input type="email" id="ownerEmailInput" placeholder="you@example.com" style="width:100%;margin-top:6px">
      </div>
      <div class="config-row" id="beneficiaryEmailRow" style="flex-direction:column;align-items:stretch">
        <label>Beneficiary Email <span style="font-weight:400;opacity:0.6;font-size:0.85em">(optional — notified only if/when this agent triggers)</span></label>
        <input type="email" id="beneficiaryEmailInput" placeholder="them@example.com" style="width:100%;margin-top:6px">
      </div>
      <div class="config-row" id="shareStatusRow" style="display:none">
        <label>Share with Beneficiary</label>
        <button class="btn-small" id="copyStatusLinkBtn">Copy Status Link</button>
        <span id="copyStatusFeedback" style="margin-left:8px;font-size:0.85em;opacity:0.7"></span>
      </div>
      ${!addrValid ? `<div class="config-warning">⚠️ No wallet address found. Paste a valid 0x… address above to unlock Register and Commit.</div>` : ""}
    </div>`;
  document.getElementById("recipientInput")?.addEventListener("input", e => {
    currentConfig.recipient = e.target.value.trim();
    updateCommitGate();
    if (isValidAddress(currentConfig.recipient)) estimateAndShowGas(currentConfig);
  });
  document.getElementById("amountInput")?.addEventListener("input", e => {
    currentConfig.amount = e.target.value;
    if (addrValid) estimateAndShowGas(currentConfig);
  });
  document.getElementById("tokenSelect")?.addEventListener("change", e => {
    currentConfig.token = e.target.value;
    if (addrValid) estimateAndShowGas(currentConfig);
  });
  document.getElementById("depositEscrowBtn")?.addEventListener("click", handleEscrowDeposit);
  document.getElementById("draftLetterBtn")?.addEventListener("click", handleDraftLetter);
  document.getElementById("saveLetterBtn")?.addEventListener("click", handleSaveLetter);
  document.getElementById("copyStatusLinkBtn")?.addEventListener("click", handleCopyStatusLink);
  if (addrValid) estimateAndShowGas(currentConfig);
  updateCommitGate();
}

async function refreshAgentBalance(configHash) {
  const row = document.getElementById("balanceRow");
  const val = document.getElementById("balanceValue");
  if (!row || !val || !configHash) return;
  try {
    const res = await fetch(`${MONITOR_URL}/status/${configHash}/balance`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && data.committed) {
      row.style.display = "flex";
      const balanceEth = (Number(data.balance) / 1e18).toFixed(4);
      val.textContent = `${balanceEth} ${currentConfig.token || "OKB"}`;
    }
  } catch (e) {
    console.warn("Could not fetch agent balance:", e);
  }
}

// ─── Compile ──────────────────────────────────────────────────────────────────
function resetCompiler() {
  compilerInput.value = "";
  compilerOutput.textContent = "// compiled config will appear here";
  rawConfig = null;
  currentConfig = null;
  registerBtn.disabled = true;
  commitBtn.disabled = true;
  const gasBox = document.getElementById("gasEstimateBox");
  if (gasBox) gasBox.style.display = "none";
  compilerInput.focus();
}
document.getElementById("newCompileBtn")?.addEventListener("click", resetCompiler);

compileBtn?.addEventListener("click", async () => {
  console.log("[DEBUG] compileBtn clicked. isDemoMode =", isDemoMode, "connectedAddress =", connectedAddress);
  if (!isDemoMode && !connectedAddress) {
    compilerOutput.textContent = "// connect a wallet or enable Demo Mode first";
    compileBtn.disabled = false;
    compileBtn.textContent = "Compile";
    return;
    openWalletModal();
    return;
  }
  const amountInput = document.getElementById("amountInput");
  const tokenSelect = document.getElementById("tokenSelect");
  const manualAmount = amountInput?.value?.trim();
  const manualToken = tokenSelect?.value || "OKB";
  const description = compilerInput.value.trim();
  if (description.length < 5) {
    compilerOutput.textContent = "// enter a longer description first";
    return;
  }
  compileBtn.disabled = true;
  compileBtn.textContent = "Compiling…";
  compilerOutput.textContent = "// calling compiler…";
  registerBtn.disabled = true;
  commitBtn.disabled = true;
  const gasBox = document.getElementById("gasEstimateBox");
  if (gasBox) gasBox.style.display = "none";
  try {
    const res = await fetch(`${COMPILER_URL}/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "compile failed");
    rawConfig = data.config;
    currentConfig = normalizeConfig(rawConfig);
    // Override with manually entered amount/token if provided
    if (manualAmount && !isNaN(Number(manualAmount))) {
      currentConfig.amount = manualAmount;
      currentConfig.token = manualToken;
    }
    renderCompiledConfigForReview();
    registerBtn.disabled = false;
  } catch (err) {
    compilerOutput.textContent = `// error: ${err.message}`;
  } finally {
    compileBtn.disabled = false;
    compileBtn.textContent = "Compile";
  }
});

// ─── Register ─────────────────────────────────────────────────────────────────
registerBtn?.addEventListener("click", async () => {
  if (!isDemoMode && !connectedAddress) {
    alert("Connect a wallet or enable Demo Mode first.");
    openWalletModal();
    return;
  }
  if (!rawConfig) return;
  registerBtn.disabled = true;
  registerBtn.textContent = "Registering…";
  try {
    const guardianNames = (document.getElementById("guardianNamesInput")?.value || "")
      .split(",").map(s => s.trim()).filter(Boolean);
    const guardianThreshold = parseInt(document.getElementById("guardianThresholdInput")?.value || "1", 10) || 1;
    const ownerEmail = (document.getElementById("ownerEmailInput")?.value || "").trim() || null;
    const beneficiaryEmail = (document.getElementById("beneficiaryEmailInput")?.value || "").trim() || null;
    const mergedConfig = {
      ...rawConfig,
      recipient: currentConfig.recipient,
      amount: currentConfig.amount,
      token: currentConfig.token,
      guardians: guardianNames,
      guardianThreshold,
      ownerEmail,
      beneficiaryEmail,
    };
    const res = await fetch(`${MONITOR_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: mergedConfig,
        ownerAddress: isDemoMode ? "demo" : connectedAddress,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "register failed");
    if (data.agent?.configHash) currentConfig.configHash = data.agent.configHash;
    updateCommitGate();
    await refreshAgents();
    refreshAgentBalance(currentConfig.configHash);
    const escrowRow = document.getElementById("escrowRow");
    if (escrowRow) escrowRow.style.display = "flex";
    const letterRow = document.getElementById("letterRow");
    if (letterRow) letterRow.style.display = "flex";
    const shareStatusRow = document.getElementById("shareStatusRow");
    if (shareStatusRow) shareStatusRow.style.display = "flex";
  } catch (err) {
    alert(`Register failed: ${err.message}`);
  } finally {
    registerBtn.disabled = false;
    registerBtn.textContent = "Register with Monitor";
  }
});

// ─── Commit ───────────────────────────────────────────────────────────────────
commitBtn?.addEventListener("click", async () => {
  if (!isDemoMode && !connectedAddress) {
    alert("Connect a wallet or enable Demo Mode first.");
    openWalletModal();
    return;
  }
  if (!currentConfig?.configHash) return;
  if (!isValidAddress(currentConfig.recipient)) {
    alert("Enter a valid recipient wallet address before committing.");
    return;
  }
  const summary = `Commit this agent onchain?\n\n` +
    `Agent: ${currentConfig.label}\n` +
    `Action: ${currentConfig.action}\n` +
    `Amount: ${currentConfig.amount ?? "—"} ${currentConfig.token || ""}\n` +
    `Recipient: ${currentConfig.recipient}\n` +
    `Trigger: ${currentConfig.trigger}\n\n` +
    (isDemoMode
      ? `Demo mode — signed by demo account (no wallet popup).`
      : `Your wallet will ask you to sign and pay gas.`);
  if (!confirm(summary)) return;
  commitBtn.disabled = true;
  commitBtn.textContent = "Sending tx…";
  try {
    if (isDemoMode) {
      const res = await fetch(`${MONITOR_URL}/commit-onchain/${currentConfig.configHash}`, { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "commit failed");
    } else {
      if (!window.activeProvider) throw new Error("No wallet provider active");
      const valueHex = currentConfig.amount
        ? "0x" + Math.floor(Number(currentConfig.amount) * 1e18).toString(16)
        : "0x0";
      const txHash = await window.activeProvider.request({
        method: "eth_sendTransaction",
        params: [{ from: connectedAddress, to: currentConfig.recipient, value: valueHex }],
      });
      await fetch(`${MONITOR_URL}/record-tx/${currentConfig.configHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash, from: connectedAddress }),
      }).catch(() => {});
    }
    await refreshAgents();
  } catch (err) {
    alert(`Onchain commit failed: ${err.message}`);
  } finally {
    commitBtn.textContent = "Commit Onchain";
    updateCommitGate();
  }
});

// ─── Agent cards ──────────────────────────────────────────────────────────────
function renderAgent(agent) {
  const committed = agent.onchain?.committed;
  const days = agent.triggers?.[0]?.thresholdSeconds
    ? Math.round(agent.triggers[0].thresholdSeconds / 86400) : null;
  const links = [];
  if (agent.onchain?.agentContractAddress)
    links.push(`<a href="${EXPLORER_ADDRESS_BASE}/${agent.onchain.agentContractAddress}" target="_blank">contract ↗</a>`);
  if (agent.onchain?.createTxHash)
    links.push(`<a href="${EXPLORER_TX_BASE}/${agent.onchain.createTxHash}" target="_blank">create tx ↗</a>`);

  return `
    <div class="agent-card" data-hash="${agent.configHash}">
      <div class="agent-card-head">
        <span class="agent-type">${agent.label || agent.agentType || "Agent"}</span>
        <span class="badge ${committed ? "active" : "pending"}">${committed ? "onchain" : "off-chain"}</span>
      </div>
      <div class="agent-meta">
        ${days ? `<span>⏱ ${days}-day trigger</span>` : ""}
        <span class="badge ${agent.consensusMet ? "active" : ""}">${agent.consensusMet ? "✓ consensus met" : "watching"}</span>
      </div>
      <div class="agent-hash">${agent.configHash}</div>
      ${committed ? `<div class="agent-balance" id="balance-${agent.configHash}">balance: loading…</div>` : ""}
      <div class="agent-last-checkin" id="checkin-${agent.configHash}">last check-in: ${agent.lastCheckin ? new Date(agent.lastCheckin * 1000).toLocaleTimeString() : "never"}</div>
      <div class="agent-escrow-countdown" id="escrow-countdown-${agent.configHash}" style="display:none"></div>
      <div class="agent-actions">
        <button class="btn-small" onclick="doCheckin('${agent.configHash}')">Check In</button>
        ${!committed ? `<button class="btn-small btn-primary" onclick="doCommit('${agent.configHash}')">Commit Onchain</button>` : ""}
        <button class="btn-small btn-danger" onclick="doDelete('${agent.configHash}')">Delete</button>
      </div>
      <div class="agent-links">${links.join("")}</div>
    </div>`;
}

// Check-in for a specific agent
window.doCheckin = async (hash) => {
  try {
    const res = await fetch(`${MONITOR_URL}/checkin/${hash}`, { method: "POST" });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "checkin failed");
    const el = document.getElementById(`checkin-${hash}`);
    if (el) {
      el.textContent = "✓ checked in just now";
      el.classList.add("checkin-flash");
      setTimeout(() => el.classList.remove("checkin-flash"), 1200);
    }
    await refreshAgents();
  } catch (err) {
    alert(`Check-in failed: ${err.message}`);
  }
};

// Commit a specific agent from the list
window.doCommit = async (hash) => {
  if (!isDemoMode && !connectedAddress) {
    alert("Connect a wallet or enable Demo Mode first.");
    openWalletModal();
    return;
  }
  if (!confirm(`Commit agent ${hash.slice(0, 10)}… onchain?`)) return;
  try {
    const res = await fetch(`${MONITOR_URL}/commit-onchain/${hash}`, { method: "POST" });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "commit failed");
    await refreshAgents();
  } catch (err) {
    alert(`Commit failed: ${err.message}`);
  }
};

// ─── Refresh agent list ───────────────────────────────────────────────────────
async function refreshAgents() {
  if (!agentList) return;
  try {
    // Filter by wallet in real mode, show demo agents in demo mode
    const ownerParam = isDemoMode ? "demo" : (connectedAddress || "");
    if (!ownerParam) {
      renderAgents([]);
      return;
    }
    const url = `${MONITOR_URL}/status?owner=${ownerParam}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.success || !data.agents?.length) {
      agentList.innerHTML = `<p class="empty-state">No agents yet. Compile one on the left to get started.</p>`;
      return;
    }
    const agents = data.agents.slice().reverse();
    console.log("[DEBUG] refreshAgents polling tick. agent count:", agents.length, "at", new Date().toLocaleTimeString());
    agentList.innerHTML = agents.map(renderAgent).join("");
    // Fetch balance for each committed agent's card individually
    agents.filter(a => a.onchain?.committed).forEach(a => refreshCardBalance(a.configHash));
    agents.forEach(a => showEscrowCountdownBadge(a.configHash));
  } catch {
    agentList.innerHTML = `<p class="empty-state">Could not reach Signal Monitor.</p>`;
  }
}

async function refreshCardBalance(hash) {
  const el = document.getElementById(`balance-${hash}`);
  if (!el) return;
  try {
    const res = await fetch(`${MONITOR_URL}/status/${hash}/balance`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && data.committed) {
      const eth = (Number(data.balance) / 1e18).toFixed(4);
      el.textContent = `balance: ${eth} OKB`;
    } else {
      el.textContent = "balance: —";
    }
  } catch {
    el.textContent = "balance: —";
  }
}

async function doDelete(hash) {
  if (!confirm("Delete this agent? This only removes it from the Signal Monitor list — it does not affect anything already committed onchain.")) return;
  try {
    const res = await fetch(`${MONITOR_URL}/status/${hash}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "delete failed");
    await refreshAgents();
  } catch (err) {
    alert(`Delete failed: ${err.message}`);
  }
}
window.doDelete = doDelete;

// ─── Wallet disconnect — lock UI but keep compiled config ─────────────────────
// Called from wallet.js / demo-mode.js when wallet disconnects
window.onWalletDisconnect = () => {
  commitBtn.disabled = true;
  registerBtn.disabled = true;
  const balBar = document.getElementById("walletBalanceBar");
  if (balBar) balBar.style.display = "none";
  refreshAgents();
};

// ─── Wallet connect — restore history ─────────────────────────────────────────
window.onWalletConnect = (address) => {
  refreshAgents();
  if (currentConfig) updateCommitGate();
  fetchWalletBalance(address);
};

refreshBtn?.addEventListener("click", refreshAgents);
checkHealth();
// Wait for wallet auto-reconnect before first refresh
// wallet.js fires this event after auto-reconnect completes
window.addEventListener("buildos:wallet:ready", () => refreshAgents());
// Fallback: if no wallet, still load after 1s (demo mode etc)
setTimeout(() => { if (typeof refreshAgents === "function") refreshAgents(); }, 1000);
setInterval(refreshAgents, 8000);
setInterval(checkHealth, 15000);

window?.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const template = params.get("template");
  if (template && typeof loadTemplate === "function") loadTemplate(template);
  if (params.get("connect") === "1" && typeof openWalletModal === "function") openWalletModal();
});

// ─── Escrow ───────────────────────────────────────────────────────────────────
function getEscrowContract(signerOrProvider) {
  return new ethers.Contract(
    window.BUILDOS_CONFIG.ESCROW_ADDRESS,
    window.BUILDOS_CONFIG.ESCROW_ABI,
    signerOrProvider
  );
}

function unlockAtFromDuration(days) {
  return Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
}

function unlockAtFromDate(dateString) {
  return Math.floor(new Date(dateString).getTime() / 1000);
}

async function depositNativeEscrow(signer, recipientAddress, amountEth, unlockAt) {
  const escrow = getEscrowContract(signer);
  const tx = await escrow.depositNative(recipientAddress, unlockAt, {
    value: ethers.parseEther(amountEth.toString()),
  });
  const receipt = await tx.wait();
  const event = receipt.logs
    .map((log) => { try { return escrow.interface.parseLog(log); } catch { return null; } })
    .find((e) => e && e.name === "Deposited");
  return { txHash: tx.hash, depositId: event?.args?.id?.toString() };
}

async function withdrawEscrow(signer, depositId) {
  const escrow = getEscrowContract(signer);
  const tx = await escrow.withdraw(depositId);
  await tx.wait();
  return tx.hash;
}

async function getEscrowStatus(provider, depositId) {
  const escrow = getEscrowContract(provider);
  const d = await escrow.getDeposit(depositId);
  const secondsLeft = await escrow.timeUntilUnlock(depositId);
  return {
    depositor: d.depositor,
    recipient: d.recipient,
    amount: ethers.formatEther(d.amount),
    unlockAt: Number(d.unlockAt),
    released: d.released,
    refunded: d.refunded,
    secondsUntilUnlock: Number(secondsLeft),
  };
}

// ─── Escrow deposit handler (wired to depositEscrowBtn) ────────────────────────
async function handleEscrowDeposit() {
  const btn = document.getElementById("depositEscrowBtn");
  const statusRow = document.getElementById("escrowStatusRow");
  const statusVal = document.getElementById("escrowStatusValue");
  const durationSelect = document.getElementById("escrowDurationSelect");

  if (isDemoMode || !connectedAddress || !window.activeProvider) {
    alert("Connect a real wallet to deposit into escrow (not available in Demo Mode).");
    return;
  }
  if (!currentConfig?.configHash) {
    alert("Register the agent first before depositing to escrow.");
    return;
  }
  if (!isValidAddress(currentConfig.recipient)) {
    alert("Enter a valid recipient wallet address first.");
    return;
  }
  const amount = currentConfig.amount;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    alert("Enter a valid amount before depositing to escrow.");
    return;
  }

  const days = Number(durationSelect?.value || 14);
  const unlockAt = unlockAtFromDuration(days);

  btn.disabled = true;
  btn.textContent = "Depositing…";
  try {
    const browserProvider = new ethers.BrowserProvider(window.activeProvider);
    const signer = await browserProvider.getSigner();
    const { txHash, depositId } = await depositNativeEscrow(
      signer,
      currentConfig.recipient,
      amount,
      unlockAt
    );
    currentConfig.escrowDepositId = depositId;
    currentConfig.escrowUnlockAt = unlockAt;
    try {
      localStorage.setItem(`escrow_${currentConfig.configHash}`, JSON.stringify({ depositId, unlockAt }));
    } catch {}
    statusRow.style.display = "flex";
    const unlockDate = new Date(unlockAt * 1000).toLocaleString();
    statusVal.innerHTML = `Locked · id ${depositId} · unlocks ${unlockDate} · <a href="${window.BUILDOS_CONFIG.EXPLORER_TX_BASE}/${txHash}" target="_blank">tx ↗</a> <button class="btn-small" id="withdrawEscrowBtn" disabled>Withdraw</button> <span id="withdrawCountdown"></span>`;
    btn.textContent = "Deposited ✓";
    startWithdrawWatcher(depositId, unlockAt);
  } catch (err) {
    statusRow.style.display = "flex";
    statusVal.textContent = `Deposit failed: ${err.message}`;
    btn.disabled = false;
    btn.textContent = "Deposit to Escrow";
  }
}

// ─── Escrow withdraw watcher + handler ─────────────────────────────────────────
function startWithdrawWatcher(depositId, unlockAt) {
  const btn = document.getElementById("withdrawEscrowBtn");
  const countdownEl = document.getElementById("withdrawCountdown");
  if (!btn || !countdownEl) return;

  function tick() {
    const secondsLeft = unlockAt - Math.floor(Date.now() / 1000);
    if (secondsLeft <= 0) {
      btn.disabled = false;
      countdownEl.textContent = "unlocked";
      clearInterval(interval);
      return;
    }
    const d = Math.floor(secondsLeft / 86400);
    const h = Math.floor((secondsLeft % 86400) / 3600);
    const m = Math.floor((secondsLeft % 3600) / 60);
    const s = secondsLeft % 60;
    countdownEl.textContent = `unlocks in ${d}d ${h}h ${m}m ${s}s`;
  }

  tick();
  const interval = setInterval(tick, 1000);

  btn.addEventListener("click", async () => {
    if (isDemoMode || !connectedAddress || !window.activeProvider) {
      alert("Connect a real wallet to withdraw from escrow.");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Withdrawing…";
    try {
      const browserProvider = new ethers.BrowserProvider(window.activeProvider);
      const signer = await browserProvider.getSigner();
      const txHash = await withdrawEscrow(signer, depositId);
      countdownEl.innerHTML = `withdrawn · <a href="${window.BUILDOS_CONFIG.EXPLORER_TX_BASE}/${txHash}" target="_blank">tx ↗</a>`;
      btn.textContent = "Withdrawn ✓";
    } catch (err) {
      countdownEl.textContent = `withdraw failed: ${err.message}`;
      btn.disabled = false;
      btn.textContent = "Withdraw";
    }
  });
}

// ─── Escrow countdown badge on agent cards ─────────────────────────────────────
function showEscrowCountdownBadge(configHash) {
  const el = document.getElementById(`escrow-countdown-${configHash}`);
  if (!el) return;
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(`escrow_${configHash}`) || "null");
  } catch {
    stored = null;
  }
  if (!stored) return;

  el.style.display = "block";
  const tick = () => {
    const secondsLeft = stored.unlockAt - Math.floor(Date.now() / 1000);
    if (secondsLeft <= 0) {
      el.textContent = "🔓 escrow unlocked";
      return;
    }
    const d = Math.floor(secondsLeft / 86400);
    const h = Math.floor((secondsLeft % 86400) / 3600);
    const m = Math.floor((secondsLeft % 3600) / 60);
    el.textContent = `⏳ escrow unlocks in ${d}d ${h}h ${m}m`;
  };
  tick();
}

// ─── Beneficiary letter + share link handlers ──────────────────────────────────
async function handleDraftLetter() {
  const notesEl = document.getElementById("letterNotes");
  const btn = document.getElementById("draftLetterBtn");
  const preview = document.getElementById("letterPreview");
  const saveBtn = document.getElementById("saveLetterBtn");

  const notes = notesEl?.value?.trim();
  if (!notes || notes.length < 3) {
    alert("Write a few rough notes first — even a sentence is enough.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Drafting…";
  try {
    const res = await fetch(`${COMPILER_URL}/draft-letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "draft failed");

    preview.textContent = data.letter;
    preview.style.display = "block";
    preview.contentEditable = "true";
    saveBtn.style.display = "inline-block";
  } catch (err) {
    alert(`Couldn't draft letter: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "AI-Draft It";
  }
}

async function handleSaveLetter() {
  const preview = document.getElementById("letterPreview");
  const saveBtn = document.getElementById("saveLetterBtn");
  if (!currentConfig?.configHash) return;

  const letter = preview?.innerText?.trim();
  if (!letter) return;

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";
  try {
    const res = await fetch(`${MONITOR_URL}/letter/${currentConfig.configHash}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ letter }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "save failed");
    saveBtn.textContent = "Saved ✓";
  } catch (err) {
    alert(`Couldn't save letter: ${err.message}`);
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Letter";
  }
}

function handleCopyStatusLink() {
  if (!currentConfig?.configHash) return;
  const link = `${window.location.origin}/status?hash=${currentConfig.configHash}`;
  const feedback = document.getElementById("copyStatusFeedback");
  navigator.clipboard.writeText(link).then(() => {
    if (feedback) {
      feedback.textContent = "Copied!";
      setTimeout(() => { feedback.textContent = ""; }, 2000);
    }
  }).catch(() => {
    prompt("Copy this link:", link);
  });
}
