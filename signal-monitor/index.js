// BuildOS Signal Monitor - core signal checking + consensus logic
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const chain = require("./chain");

const DB_PATH = path.join(__dirname, "agents.json");

// Load from disk on startup
const registry = new Map();
function loadFromDisk() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
      Object.entries(raw).forEach(([hash, state]) => registry.set(hash, state));
      console.log(`[monitor] loaded ${registry.size} agents from disk`);
    }
  } catch (e) {
    console.warn("[monitor] could not load agents.json:", e.message);
  }
}
function saveToDisk() {
  try {
    const obj = {};
    registry.forEach((state, hash) => { obj[hash] = state; });
    fs.writeFileSync(DB_PATH, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.warn("[monitor] could not save agents.json:", e.message);
  }
}
loadFromDisk();

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function registerAgent(config, ownerAddress) {
  const hash = config.configHash || ("0x" + crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex"));
  
  // If already exists, just return existing (idempotent)
  if (registry.has(hash)) return registry.get(hash);

  const state = {
    configHash: hash,
    agentType: config.agentType,
    label: config.label,
    owner: ownerAddress || null,  // wallet address that created this agent
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
  evaluateConsensus(state);
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
  registry.forEach((state) => {
    if (!state.executedAt) autoEvaluate(state);
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
  registry,
};
