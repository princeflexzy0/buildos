const { COMPILER_URL, MONITOR_URL, EXPLORER_BASE } = window.BUILDOS_CONFIG;

const compilerInput = document.getElementById("compilerInput");
const compileBtn = document.getElementById("compileBtn");
const compilerOutput = document.getElementById("compilerOutput");
const registerBtn = document.getElementById("registerBtn");
const commitBtn = document.getElementById("commitBtn");
const agentList = document.getElementById("agentList");
const refreshBtn = document.getElementById("refreshBtn");
const chainStatus = document.getElementById("chainStatus");

let currentConfig = null;

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

compileBtn.addEventListener("click", async () => {
  const description = compilerInput.value.trim();
  if (description.length < 5) {
    compilerOutput.textContent = "// enter a longer description first";
    return;
  }
  compileBtn.disabled = true;
  compileBtn.textContent = "Compiling…";
  compilerOutput.textContent = "// calling compiler…";
  try {
    const res = await fetch(`${COMPILER_URL}/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "compile failed");
    currentConfig = data.config;
    compilerOutput.textContent = JSON.stringify(data.config, null, 2);
    registerBtn.disabled = false;
    commitBtn.disabled = true;
  } catch (err) {
    compilerOutput.textContent = `// error: ${err.message}`;
  } finally {
    compileBtn.disabled = false;
    compileBtn.textContent = "Compile";
  }
});

registerBtn.addEventListener("click", async () => {
  if (!currentConfig) return;
  registerBtn.disabled = true;
  registerBtn.textContent = "Registering…";
  try {
    const res = await fetch(`${MONITOR_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: currentConfig }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "register failed");
    currentConfig = data.agent.config;
    currentConfig.configHash = data.agent.configHash;
    commitBtn.disabled = false;
    await refreshAgents();
  } catch (err) {
    alert(`Register failed: ${err.message}`);
  } finally {
    registerBtn.disabled = false;
    registerBtn.textContent = "Register with Monitor";
  }
});

commitBtn.addEventListener("click", async () => {
  if (!currentConfig || !currentConfig.configHash) return;
  commitBtn.disabled = true;
  commitBtn.textContent = "Sending tx…";
  try {
    const res = await fetch(`${MONITOR_URL}/commit-onchain/${currentConfig.configHash}`, {
      method: "POST",
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "commit failed");
    await refreshAgents();
  } catch (err) {
    alert(`Onchain commit failed: ${err.message}`);
  } finally {
    commitBtn.textContent = "Commit Onchain";
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
    agentList.innerHTML = data.agents
      .slice()
      .reverse()
      .map(renderAgent)
      .join("");
  } catch (err) {
    agentList.innerHTML = `<p class="empty-state">Could not reach Signal Monitor.</p>`;
  }
}

refreshBtn.addEventListener("click", refreshAgents);

checkHealth();
refreshAgents();
setInterval(refreshAgents, 8000);
setInterval(checkHealth, 15000);

// Auto-trigger demo mode or wallet modal if arriving from the landing page CTA
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "1" && typeof enterDemoMode === "function") {
    enterDemoMode();
  } else if (params.get("connect") === "1" && typeof openWalletModal === "function") {
    openWalletModal();
  }
});

// Require explicit human confirmation of amount/recipient before enabling
// the onchain commit — closes the gap between "app displayed X" and
// "wallet is about to sign X."
function requireCommitConfirmation(compiledConfig) {
  const commitBtn = document.getElementById("commitBtn");
  if (!commitBtn) return;
  commitBtn.disabled = true;
  commitBtn.onclick = () => {
    const summary = `You're about to commit this agent onchain:\n\n` +
      `Action: ${compiledConfig.action}\n` +
      `Amount: ${compiledConfig.amount || "n/a"}\n` +
      `Recipient: ${compiledConfig.recipient || "n/a"}\n` +
      `Trigger: ${compiledConfig.trigger || "n/a"}\n\n` +
      `Your wallet will ask you to confirm the exact transaction next. Continue?`;
    if (confirm(summary)) {
      commitOnchain(compiledConfig); // your existing commit function
    }
  };
  commitBtn.disabled = false;
}

// After the LLM compiles a config, force explicit human review/completion
// of any field it couldn't resolve on its own — especially recipient address.
// This function assumes compilerOutput now renders EDITABLE fields, not just JSON text.
function renderCompiledConfigForReview(config) {
  const box = document.getElementById("compilerOutput");
  const needsAddress = !config.recipient || !/^0x[a-fA-F0-9]{40}$/.test(config.recipient);
  const knownTokens = ["OKB", "USDT", "USDC"]; // whatever your contract actually supports
  const tokenSupported = knownTokens.includes((config.token || "").toUpperCase());

  box.innerHTML = `
    <div class="config-review">
      <div class="config-row"><label>Action</label><span>${config.action || "—"}</span></div>
      <div class="config-row"><label>Amount</label><span>${config.amount || "—"} ${config.token || ""}</span></div>
      <div class="config-row ${needsAddress ? "config-row-warn" : ""}">
        <label>Recipient</label>
        <input type="text" id="recipientInput" placeholder="0x… — paste the real wallet address"
               value="${needsAddress ? "" : config.recipient}">
      </div>
      <div class="config-row"><label>Trigger</label><span>${config.trigger || "—"}</span></div>
      ${!tokenSupported ? `<div class="config-warning">⚠️ "${config.token}" isn't a supported token on X Layer for this agent. Supported: ${knownTokens.join(", ")}.</div>` : ""}
      ${needsAddress ? `<div class="config-warning">⚠️ We can't resolve "${config.recipientRaw || "a name or relationship"}" to a wallet address automatically. Paste the actual address above.</div>` : ""}
    </div>`;

  document.getElementById("registerBtn").disabled = false;
  // Commit stays disabled until address + supported token both check out
  document.getElementById("commitBtn").disabled = needsAddress || !tokenSupported;

  document.getElementById("recipientInput")?.addEventListener("input", (e) => {
    const valid = /^0x[a-fA-F0-9]{40}$/.test(e.target.value.trim());
    document.getElementById("commitBtn").disabled = !valid || !tokenSupported;
    config.recipient = e.target.value.trim();
  });

  return config;
}

// Estimates gas before committing, so the user sees real cost before signing.
// Requires an ethers provider — reuses whatever window.activeProvider wallet.js set,
// or falls back to a plain JSON-RPC provider for read-only estimation in Demo Mode.
async function estimateAndShowGas(txPayload) {
  const gasBox = document.getElementById("gasEstimateBox");
  gasBox.style.display = "block";
  gasBox.className = "gas-estimate gas-estimate-loading";
  gasBox.textContent = "Estimating gas…";

  try {
    const rpc = "https://testrpc.xlayer.tech";
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_estimateGas",
        params: [{ to: txPayload.to, value: txPayload.value || "0x0", data: txPayload.data || "0x" }],
      }),
    });
    const { result: gasHex, error } = await res.json();
    if (error) throw new Error(error.message);

    const gasPriceRes = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_gasPrice", params: [] }),
    });
    const { result: gasPriceHex } = await gasPriceRes.json();

    const gasUnits = parseInt(gasHex, 16);
    const gasPriceWei = parseInt(gasPriceHex, 16);
    const feeOKB = (gasUnits * gasPriceWei) / 1e18;

    gasBox.className = "gas-estimate gas-estimate-ready";
    gasBox.innerHTML = `Estimated network fee: <strong>${feeOKB.toFixed(6)} OKB</strong> (${gasUnits.toLocaleString()} gas)`;
    return { gasUnits, gasPriceWei, feeOKB };
  } catch (err) {
    console.error("gas estimate failed:", err);
    gasBox.className = "gas-estimate gas-estimate-error";
    gasBox.textContent = "Couldn't estimate gas — network may be unreachable.";
    return null;
  }
}
