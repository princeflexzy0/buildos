const {
  registerAgent,
  checkin,
  simulateSignal,
  evaluateConsensus,
  autoEvaluate,
} = require("../signal-monitor/index");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓  ${name}`); passed++; }
  catch (err) { console.error(`  ✗  ${name}: ${err.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m || "failed"); }

console.log("\nBuildOS Signal Monitor Tests\n");

console.log("Registration:");
test("registers agent and returns state", () => {
  const config = {
    agentType: "Chronicle",
    label: "Test Chronicle",
    triggers: [{ type: "inactivity", thresholdSeconds: 5 }],
    signals: [{ signalType: "inactivity_check", source: "check-in system" }],
    consensusRule: "any",
  };
  const state = registerAgent(config);
  assert(state.configHash.startsWith("0x"), "missing configHash");
  assert(state.consensusMet === false, "should not be met on register");
});

console.log("\nCheck-in resets signals:");
test("checkin clears fired inactivity signal", () => {
  const config = {
    agentType: "Chronicle",
    label: "Checkin Test",
    triggers: [{ type: "inactivity", thresholdSeconds: 5 }],
    signals: [{ signalType: "inactivity_check", source: "check-in system" }],
    consensusRule: "any",
  };
  const state = registerAgent(config);
  state.signals[0].fired = true;
  const after = checkin(state.configHash);
  assert(after.signals[0].fired === false, "signal should reset on checkin");
});

console.log("\nManual signal simulation:");
test("simulateSignal fires the named signal and evaluates consensus", () => {
  const config = {
    agentType: "Sentinel",
    label: "Sim Test",
    triggers: [{ type: "api_poll" }],
    signals: [{ signalType: "api_poll", source: "tracking API" }],
    consensusRule: "any",
  };
  const state = registerAgent(config);
  const after = simulateSignal(state.configHash, "api_poll");
  assert(after.signals[0].fired === true, "signal should be fired");
  assert(after.consensusMet === true, "any-rule consensus should be met");
});

console.log("\nConsensus rules:");
test("'all' rule requires every signal fired", () => {
  const state = registerAgent({
    agentType: "Warden",
    label: "All Rule Test",
    triggers: [],
    signals: [
      { signalType: "checkin_miss", source: "a" },
      { signalType: "public_record", source: "b" },
    ],
    consensusRule: "all",
  });
  state.signals[0].fired = true;
  evaluateConsensus(state);
  assert(state.consensusMet === false, "should not be met with 1/2 fired");
  state.signals[1].fired = true;
  evaluateConsensus(state);
  assert(state.consensusMet === true, "should be met with 2/2 fired");
});

console.log("\nTime-based auto evaluation:");
test("autoEvaluate fires inactivity signal after threshold elapsed", () => {
  const state = registerAgent({
    agentType: "Chronicle",
    label: "Auto Test",
    triggers: [{ type: "inactivity", thresholdSeconds: 1 }],
    signals: [{ signalType: "inactivity_check", source: "check-in system" }],
    consensusRule: "any",
  });
  state.lastCheckin = Math.floor(Date.now() / 1000) - 10; // force elapsed time
  autoEvaluate(state);
  assert(state.signals[0].fired === true, "inactivity signal should fire after threshold");
  assert(state.consensusMet === true, "consensus should be met");
});

console.log(`\n${"─".repeat(40)}\n  ${passed} passed  |  ${failed} failed\n${"─".repeat(40)}\n`);
if (failed > 0) process.exit(1);
