const { COMPILER_URL, MONITOR_URL, EXPLORER_BASE } = window.BUILDOS_CONFIG;

const compilerInput = document.getElementById("compilerInput");
const compileBtn = document.getElementById("compileBtn");
const compilerOutput = document.getElementById("compilerOutput");
const registerBtn = document.getElementById("registerBtn");
const commitBtn = document.getElementById("commitBtn");
const agentList = document.getElementById("agentList");
const refreshBtn = document.getElementById("refreshBtn");
const chainStatus = document.getElementById("chainStatus");

const SUPPORTED_TOKENS = ["OKB", "USDT", "USDC"]; // must match what your contract actually accepts

let currentConfig = null;   // normalized fields used by the UI
let rawConfig = null;       // exact object the backend returned — sent back untouched

async function checkHealth() {
  try {
    const [c, m] = await Promise.all([
      fetch(`${COMPILER_URL}/health`).then((r) => r.json()),
      fetch(`${MONITOR_URL}/health`).then((r) => r.json()),
    ]);
    chainStatus.innerHTML = `<span class="pulse"></span> compiler: ${c.hasApiKey ? "ready" : "no key"} · monitor: online`;
  } catch (e) {
    chainStatus.innerHTML = `<span class="pulse" style="background:var(--danger)"></span> backend unreachable`;
  }
}

// Your compiler's exact response shape may use different key names.
// This pulls from several likely alternates so the UI doesn't silently break
// if the backend calls it "beneficiary" instead of "recipient", etc.
// >>> Adjust these arrays to match your real /compile response if the curl test above showed different keys. <
function normalizeConfig(raw) {
  const pick = (...keys) => keys.map(k => raw[k]).find(v => v !== undefined && v !== null && v !== "");
  return {
    action: pick("action", "agentType", "label") || "—",
    amount: pick("amount", "value", "quantity"),
    token: (pick("token", "asset", "currency") || "").toString().toUpperCase(),
    recipient: pick("recipient", "beneficiary", "target", "to"),
    recipientRaw: pick("recipientRaw", "recipientName", "beneficiaryName"),
    trigger: pick("trigger", "condition", "triggerType", "triggerCondition"),
    configHash: pick("configHash"),
  };
}

function isValidAddress(addr) {
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function updateCommitGate() {
  const addrValid = isValidAddress(currentConfig?.recipient);
  const tokenOk = !currentConfig?.token || SUPPORTED_TOKENS.includes(currentConfig.token);
  const registered = !!currentConfig?.configHash;
  commitBtn.disabled = !(addrValid && tokenOk && registered);
  return addrValid && tokenOk;
}

function renderCompiledConfigForReview() {
  const addrValid = isValidAddress(currentConfig.recipient);
  const tokenOk = !currentConfig.token || SUPPORTED_TOKENS.includes(currentConfig.token);

  compilerOutput.innerHTML = `
    <div class="config-review">
      <div class="config-row"><label>Action</label><span>${currentConfig.action}</span></div>
      <div class="config-row"><label>Amount</label><span>${currentConfig.amount ?? "—"} ${currentConfig.token || ""}</span></div>
      <div class="config-row ${addrValid ? "" : "config-row-warn"}">
        <label>Recipient</label>
        <input type="text" id="recipientInput" placeholder="0x… — paste the real wallet address"
               value="${addrValid ? currentConfig.recipient : ""}">
      </div>
      <div class="config-row"><label>Trigger</label><span>${currentConfig.trigger || "—"}</span></div>
      ${!tokenOk ? `<div class="config-warning">⚠️ "${currentConfig.token}" isn't supported. Supported tokens: ${SUPPORTED_TOKENS.join(", ")}.</div>` : ""}
      ${!addrValid ? `<div class="config-warning">⚠️ We can't resolve "${currentConfig.recipientRaw || "a name or relationship"}" to a wallet address automatically. Paste the real 0x… address above before you can register or commit.</div>` : ""}
    </div>`;

  document.getElementById("recipientInput")?.addEventListener("input", (e) => {
    currentConfig.recipient = e.target.value.trim();
    const nowValid = updateCommitGate();
    document.querySelector(".config-row-warn")?.classList.toggle("config-row-warn", !isValidAddress(currentConfig.recipient));
    if (isValidAddress(currentConfig.recipient)) {
      estimateAndShowGas(currentConfig);
    }
  });

  if (addrValid) estimateAndShowGas(currentConfig);
}

// Best-effort client-side gas estimate on X Layer testnet, shown before commit.
// This is an approximation of a plain transfer shape — your actual on-chain call
// happens server-side via /commit-onchain, so treat this as "roughly this much."
async function estimateAndShowGas(config) {
  const gasBox = document.getElementById("gasEstimateBox");
  if (!isValidAddress(config.recipient)) return;
  gasBox.style.display = "block";
  gasBox.className = "gas-estimate gas-estimate-loading";
  gasBox.textContent = "Estimating gas…";

  try {
    const rpc = "https://testrpc.xlayer.tech";
    const valueHex = config.amount ? "0x" + Math.floor(Number(config.amount) * 1e18).toString(16) : "0x0";

    const gasRes = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_estimateGas",
        params: [{ to: config.recipient, value: valueHex }],
      }),
    });
    const gasJson = await gasRes.json();
    if (gasJson.error) throw new Error(gasJson.error.message);

    const priceRes = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_gasPrice", params: [] }),
    });
    const priceJson = await priceRes.json();

    const gasUnits = parseInt(gasJson.result, 16);
    const gasPriceWei = parseInt(priceJson.result, 16);
    const feeOKB = (gasUnits * gasPriceWei) / 1e18;

    gasBox.className = "gas-estimate gas-estimate-ready";
    gasBox.innerHTML = `Estimated network fee: <strong>${feeOKB.toFixed(6)} OKB</strong> (${gasUnits.toLocaleString()} gas, testnet)`;
  } catch (err) {
    console.error("gas estimate failed:", err);
    gasBox.className = "gas-estimate gas-estimate-error";
    gasBox.textContent = "Couldn't estimate gas — network may be unreachable.";
  }
}

compileBtn.addEventListener("click", async () => {
  if (!isDemoMode && !connectedAddress) {
    compilerOutput.textContent = "// connect a wallet or enable Demo Mode first";
    openWalletModal();
    return;
  }
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
  document.getElementById("gasEstimateBox").style.display = "none";

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
    renderCompiledConfigForReview();
    registerBtn.disabled = false;
  } catch (err) {
    compilerOutput.textContent = `// error: ${err.message}`;
  } finally {
    compileBtn.disabled = false;
    compileBtn.textContent = "Compile";
  }
});

registerBtn.addEventListener("click", async () => {
  if (!isDemoMode && !connectedAddress) {
    alert("Connect a wallet or enable Demo Mode first.");
    openWalletModal();
    return;
  }
  if (!rawConfig) return;
  registerBtn.disabled = true;
  registerBtn.textContent = "Registering…";
  try {
    const res = await fetch(`${MONITOR_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: rawConfig }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "register failed");

    rawConfig = data.agent.config;
    currentConfig.configHash = data.agent.configHash;
    updateCommitGate();
    await refreshAgents();
  } catch (err) {
    alert(`Register failed: ${err.message}`);
  } finally {
    registerBtn.disabled = false;
    registerBtn.textContent = "Register with Monitor";
  }
});

commitBtn.addEventListener("click", async () => {
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

  const summary = `You're about to commit this agent onchain:\n\n` +
    `Action: ${currentConfig.action}\n` +
    `Amount: ${currentConfig.amount ?? "—"} ${currentConfig.token || ""}\n` +
    `Recipient: ${currentConfig.recipient}\n` +
    `Trigger: ${currentConfig.trigger || "—"}\n\n` +
    (isDemoMode
      ? `This will sign with the demo account (no wallet popup).\n\nContinue?`
      : `Your wallet will now ask you to confirm and sign this transaction yourself.\n\nContinue?`);
  if (!confirm(summary)) return;

  commitBtn.disabled = true;
  commitBtn.textContent = "Sending tx…";

  try {
    if (isDemoMode) {
      // Demo path: your backend's funded signer fires it, no wallet popup.
      const res = await fetch(`${MONITOR_URL}/commit-onchain/${currentConfig.configHash}`, { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "commit failed");
    } else {
      // Real path: THEIR connected wallet signs and pays gas — not your backend.
      if (!window.activeProvider) throw new Error("No wallet provider active");
      const valueHex = currentConfig.amount
        ? "0x" + Math.floor(Number(currentConfig.amount) * 1e18).toString(16)
        : "0x0";
      const txHash = await window.activeProvider.request({
        method: "eth_sendTransaction",
        params: [{ from: connectedAddress, to: currentConfig.recipient, value: valueHex }],
      });
      // Tell the backend this agent is now committed, recording the user's own tx hash.
      // NOTE: requires a lightweight MONITOR_URL/record-tx route — see backend TODO below.
      await fetch(`${MONITOR_URL}/record-tx/${currentConfig.configHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash, from: connectedAddress }),
      }).catch(() => { /* non-fatal if this route doesn't exist yet */ });
    }
    await refreshAgents();
  } catch (err) {
    alert(`Onchain commit failed: ${err.message}`);
  } finally {
    commitBtn.textContent = "Commit Onchain";
    updateCommitGate();
  }
});

function renderAgent(agent) {
  const badgeClass = agent.onchain?.committed ? "active" : "pending";
  const badgeText = agent.onchain?.committed ? "onchain" : "off-chain";
  const consensusText = agent.consensusMet ? "consensus met" : "watching";

  const links = [];
  if (agent.onchain?.agentContractAddress) {
    links.push(`<a href="${EXPLORER_BASE}/${agent.onchain.agentContractAddress}" target="_blank">contract ↗</a>`);
  }
  if (agent.onchain?.createTxHash) {
    links.push(`<a href="${EXPLORER_BASE}/${agent.onchain.agentContractAddress}" target="_blank">create tx ↗</a>`);
  }
  if (agent.onchain?.verdictTxHash) {
    links.push(`<a href="${EXPLORER_BASE}/${agent.onchain.agentContractAddress}" target="_blank">verdict tx ↗</a>`);
  }

  return `
    <div class="agent-card">
      <div class="agent-card-head">
        <span class="agent-type">${agent.agentType || "Agent"}</span>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="agent-hash">${agent.configHash}</div>
      <div class="badge ${agent.consensusMet ? "active" : ""}" style="display:inline-block">${consensusText}</div>
      <div class="agent-links">${links.join("")}</div>
    </div>
  `;
}

async function refreshAgents() {
  try {
    const res = await fetch(`${MONITOR_URL}/status`);
    const data = await res.json();
    if (!data.success || !data.agents.length) {
      agentList.innerHTML = `<p class="empty-state">No agents registered yet. Compile one on the left to get started.</p>`;
      return;
    }
    agentList.innerHTML = data.agents.slice().reverse().map(renderAgent).join("");
  } catch (err) {
    agentList.innerHTML = `<p class="empty-state">Could not reach Signal Monitor.</p>`;
  }
}

refreshBtn.addEventListener("click", refreshAgents);

checkHealth();
refreshAgents();
setInterval(refreshAgents, 8000);
setInterval(checkHealth, 15000);

window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const template = params.get("template");
  if (template && typeof loadTemplate === "function") loadTemplate(template);
  if (params.get("connect") === "1" && typeof openWalletModal === "function") openWalletModal();
});
