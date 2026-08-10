// BuildOS Signal Monitor - core signal checking + consensus logic
const crypto = require("crypto");
const fs = require("fs");
const db = require("./db");
const path = require("path");
const chain = require("./chain");
const notifier = require("./notifier");

const DB_PATH = path.join(__dirname, "agents.json");

// Load from disk on startup
let registry = new Map();
async function loadFromDisk() {
  registry = await db.loadAll();
}
function saveToDisk() {
  db.saveAll(registry);
}
loadFromDisk().then(() => console.log("[monitor] registry loaded, " + registry.size + " agents")).catch(e => console.error("[monitor] load error:", e.message));

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function registerAgent(config, ownerAddress) {
  const hash = config.configHash || ("0x" + crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex"));
  
  // If already exists, update mutable fields (recipient/amount edits made after compiling)
  // but preserve check-in history, onchain status, and letters.
  if (registry.has(hash)) {
    const existing = registry.get(hash);
    existing.config = config;
    existing.label = config.label || existing.label;
    existing.guardians = config.guardians || existing.guardians || [];
    existing.guardianThreshold = config.guardianThreshold || existing.guardianThreshold || 1;
    existing.ownerEmail = config.ownerEmail || existing.ownerEmail || null;
    existing.beneficiaryEmail = config.beneficiaryEmail || existing.beneficiaryEmail || null;
    saveToDisk();
    return existing;
  }

  const state = {
    configHash: hash,
    agentType: config.agentType,
    label: config.label,
    owner: ownerAddress || null,  // wallet address that created this agent
    guardians: config.guardians || [],
    guardianThreshold: config.guardianThreshold || 1,
    pendingGuardianConfirmations: [],
    ownerEmail: config.ownerEmail || null,
    beneficiaryEmail: config.beneficiaryEmail || null,
    notifiedThresholds: [],
    triggerEmailSent: false,
    registeredAt: nowSec(),
    lastCheckin: nowSec(),
    signals: (config.signals || []).map((s) => ({
      ...s,
      fired: false,
      firedAt: null,
    })),
    triggers: config.triggers || [],
    consensusRule: config.consensusRule,
    consensusMet: false,
    executedAt: null,
    config,
    onchain: {
      committed: false,
      agentId: null,
      agentContractAddress: null,
      createTxHash: null,
      verdictTxHash: null,
      registerTxHash: null,
    },
  };
  registry.set(hash, state);
  saveToDisk();
  return state;
}

function getAgent(hash) {
  return registry.get(hash) || null;
}

function listAgents(ownerAddress) {
  const all = Array.from(registry.values());
  // If owner filter provided, return only their agents
  if (ownerAddress) return all.filter(a => a.owner === ownerAddress.toLowerCase());
  return all;
}

function checkin(hash) {
  const state = registry.get(hash);
  if (!state) return null;
  state.lastCheckin = nowSec();
  state.notifiedThresholds = [];
  state.signals.forEach((s) => {
    if (s.signalType === "inactivity_check" || s.signalType === "checkin_miss") {
      s.fired = false;
      s.firedAt = null;
    }
  });
  state.consensusMet = false;
  saveToDisk();
  return state;
}
function guardianCheckin(hash, guardianName) {
  const state = registry.get(hash);
  if (!state) return { error: "not_found" };
  const guardians = state.guardians || [];
  const match = guardians.find(
    (g) => g.trim().toLowerCase() === (guardianName || "").trim().toLowerCase()
  );
  if (!match) return { error: "not_a_guardian" };

  const threshold = state.guardianThreshold || 1;
  state.pendingGuardianConfirmations = state.pendingGuardianConfirmations || [];

  const alreadyConfirmed = state.pendingGuardianConfirmations.some(
    (c) => c.name.toLowerCase() === match.toLowerCase()
  );
  if (!alreadyConfirmed) {
    state.pendingGuardianConfirmations.push({ name: match, at: nowSec() });
  }

  const confirmedCount = state.pendingGuardianConfirmations.length;
  if (confirmedCount < threshold) {
    saveToDisk();
    return {
      state,
      pending: true,
      confirmedCount,
      threshold,
      confirmedBy: state.pendingGuardianConfirmations.map((c) => c.name),
    };
  }

  const updated = checkin(hash);
  updated.lastGuardianCheckin = {
    names: state.pendingGuardianConfirmations.map((c) => c.name),
    at: nowSec(),
  };
  updated.pendingGuardianConfirmations = [];
  saveToDisk();
  return { state: updated, pending: false };
}

function simulateSignal(hash, signalType) {
  const state = registry.get(hash);
  if (!state) return null;
  const sig = state.signals.find((s) => s.signalType === signalType);
  if (!sig) return null;
  sig.fired = true;
  sig.firedAt = nowSec();
  evaluateConsensus(state);
  saveToDisk();
  return state;
}

const WARNING_THRESHOLDS = [0.5, 0.75, 0.9];

function statusUrlFor(hash) {
  const base = process.env.SITE_URL || "https://buildos.tech";
  return `${base}/status.html?hash=${hash}`;
}

function checkWarningThresholds(state) {
  if (!state.ownerEmail) return;
  const t = state.triggers.find((tr) => (tr.type === "inactivity" || tr.type === "checkin_miss") && tr.thresholdSeconds);
  if (!t) return;
  const elapsed = nowSec() - state.lastCheckin;
  const fraction = elapsed / t.thresholdSeconds;
  const remaining = t.thresholdSeconds - elapsed;
  if (remaining <= 0) return;

  for (const threshold of WARNING_THRESHOLDS) {
    if (fraction >= threshold && !state.notifiedThresholds.includes(threshold)) {
      state.notifiedThresholds.push(threshold);
      const daysRemaining = Math.floor(remaining / 86400);
      const hoursRemaining = Math.ceil(remaining / 3600);
      notifier.sendWarningEmail({
        to: state.ownerEmail,
        label: state.label,
        statusUrl: statusUrlFor(state.configHash),
        daysRemaining,
        hoursRemaining,
      }).catch((e) => console.warn("[notifier] warning email failed:", e.message));
    }
  }
}

function autoEvaluate(state) {
  const elapsed = nowSec() - state.lastCheckin;
  state.triggers.forEach((t) => {
    if ((t.type === "inactivity" || t.type === "checkin_miss") && t.thresholdSeconds) {
      if (elapsed >= t.thresholdSeconds) {
        const sig = state.signals.find(
          (s) => s.signalType === "inactivity_check" || s.signalType === "checkin_miss"
        );
        if (sig && !sig.fired) {
          sig.fired = true;
          sig.firedAt = nowSec();
        }
      }
    }
  });
  checkWarningThresholds(state);
  evaluateConsensus(state);
  if (state.consensusMet && !state.triggerEmailSent) {
    state.triggerEmailSent = true;
    // Auto-release escrow if a depositId is recorded
    if (state.escrowDepositId != null) {
      chain.releaseEscrow(state.escrowDepositId)
        .then(r => {
          state.escrowReleased = true;
          state.escrowReleaseTxHash = r.txHash;
          saveToDisk();
          console.log(`[escrow] auto-released deposit #${state.escrowDepositId} — tx: ${r.txHash}`);
        })
        .catch(e => console.warn(`[escrow] auto-release failed:`, e.message));
    }
    const statusUrl = statusUrlFor(state.configHash);
    if (state.ownerEmail) {
      notifier.sendTriggerFiredOwnerEmail({
        to: state.ownerEmail,
        label: state.label,
        statusUrl,
      }).catch((e) => console.warn("[notifier] trigger owner email failed:", e.message));
    }
    if (state.beneficiaryEmail) {
      const claimUrl = state.escrowDepositId != null
        ? `${process.env.SITE_URL || "https://buildos.tech"}/claim?depositId=${state.escrowDepositId}`
        : null;
      notifier.sendTriggerFiredBeneficiaryEmail({
        to: state.beneficiaryEmail,
        label: state.label,
        statusUrl,
        depositId: state.escrowDepositId,
        claimUrl,
        letter: state.beneficiaryLetter || null,
      }).catch((e) => console.warn("[notifier] trigger beneficiary email failed:", e.message));
    }
  }
}

function evaluateConsensus(state) {
  const fired = state.signals.filter((s) => s.fired).length;
  const total = state.signals.length || 1;
  switch (state.consensusRule) {
    case "all":
    case "2_of_2":
      state.consensusMet = fired >= total;
      break;
    case "any":
      state.consensusMet = fired >= 1;
      break;
    case "majority":
      state.consensusMet = fired > total / 2;
      break;
    case "2_of_3":
      state.consensusMet = fired >= 2;
      break;
    default:
      state.consensusMet = fired >= total;
  }
  if (state.consensusMet && !state.executedAt) {
    state.executedAt = nowSec();
  }
  return state.consensusMet;
}

function tickAll() {
  if (!registry || typeof registry.forEach !== "function") return;
  registry.forEach((state) => {
    // Always evaluate agents that haven't fired yet
    if (!state.executedAt) {
      autoEvaluate(state);
      return;
    }
    // For already-executed agents: release escrow if not yet released
    if (
      state.escrowDepositId != null &&
      !state.escrowReleased &&
      !state.escrowReleasePending
    ) {
      state.escrowReleasePending = true;
      chain.releaseEscrow(state.escrowDepositId)
        .then(r => {
          state.escrowReleased = true;
          state.escrowReleaseTxHash = r.txHash;
          state.escrowReleasePending = false;
          saveToDisk();
          console.log(`[escrow] tick-released deposit #${state.escrowDepositId} — tx: ${r.txHash}`);
        })
        .catch(e => {
          state.escrowReleasePending = false;
          console.warn(`[escrow] tick-release failed for #${state.escrowDepositId}:`, e.message);
        });
    }
  });
  saveToDisk();
}

async function commitOnchain(hash) {
  const state = registry.get(hash);
  if (!state) throw new Error("agent not found");
  if (state.onchain.committed) throw new Error("agent already committed onchain");
  const result = await chain.createOnchainAgent(state.config);
  state.onchain.committed = true;
  state.onchain.agentId = result.agentId;
  state.onchain.agentContractAddress = result.agentContractAddress;
  state.onchain.createTxHash = result.txHash;
  saveToDisk();
  return state;
}

async function commitVerdictOnchain(hash) {
  const state = registry.get(hash);
  if (!state) throw new Error("agent not found");
  if (!state.onchain.committed) throw new Error("agent not committed onchain yet");
  const firedSignal = state.signals.find((s) => s.fired) || state.signals[0];
  const result = await chain.submitVerdict(state.onchain.agentContractAddress, {
    signalType: firedSignal ? firedSignal.signalType : "unknown",
    signalHash: "0x" + crypto.createHash("sha256").update(JSON.stringify(firedSignal || {})).digest("hex").slice(0, 16),
    positive: state.consensusMet,
    triggered: state.consensusMet,
    reasoningHash: "0x" + crypto.createHash("sha256").update(state.consensusDescription || "verdict").digest("hex").slice(0, 16),
    signalsInFavor: state.signals.filter((s) => s.fired).length,
    signalsTotal: state.signals.length,
  });
  state.onchain.registerTxHash = result.registerTxHash;
  state.onchain.verdictTxHash = result.verdictTxHash;
  saveToDisk();
  return state;
}

function deleteAgent(hash) {
  registry.delete(hash);
  db.deleteAgent(hash);
}

function setBeneficiaryLetter(hash, letter) {
  const state = registry.get(hash);
  if (!state) return null;
  state.beneficiaryLetter = letter;
  saveToDisk();
  return state;
}

module.exports = {
  registerAgent,
  getAgent,
  listAgents,
  checkin,
  simulateSignal,
  autoEvaluate,
  evaluateConsensus,
  tickAll,
  commitOnchain,
  commitVerdictOnchain,
  setBeneficiaryLetter,
  guardianCheckin,
  deleteAgent,
  registry,
  saveToDisk,
};
