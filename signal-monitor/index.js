// BuildOS Signal Monitor - core signal checking + consensus logic
const crypto = require("crypto");

// In-memory registry: configHash -> { config, state }
const registry = new Map();

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function registerAgent(config) {
  const hash = config.configHash || ("0x" + crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex"));
  const state = {
    configHash: hash,
    agentType: config.agentType,
    label: config.label,
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
  };
  registry.set(hash, state);
  return state;
}

function getAgent(hash) {
  return registry.get(hash) || null;
}

function listAgents() {
  return Array.from(registry.values());
}

function checkin(hash) {
  const state = registry.get(hash);
  if (!state) return null;
  state.lastCheckin = nowSec();
  // checking in resets inactivity/checkin_miss signals
  state.signals.forEach((s) => {
    if (s.signalType === "inactivity_check" || s.signalType === "checkin_miss") {
      s.fired = false;
      s.firedAt = null;
    }
  });
  state.consensusMet = false;
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
  return state;
}

// Auto re-evaluation: checks time-based triggers (inactivity, checkin_miss)
// against real elapsed time since lastCheckin.
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
  registry,
};
