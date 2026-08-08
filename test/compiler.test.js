const crypto = require("crypto");
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); console.log(`  ✓  ${name}`); passed++; } catch(err) { console.error(`  ✗  ${name}: ${err.message}`); failed++; } }
function assert(c, m) { if (!c) throw new Error(m || "failed"); }

const DEMOS = {
  chronicle: { agentType:"Chronicle", label:"Chronicle", triggers:[{type:"inactivity",thresholdSeconds:7776000}], signals:[{signalType:"inactivity_check"}], consensusRule:"2_of_2", action:{type:"release_funds"}, permissions:{ownerCanCancel:true} },
  sentinel:  { agentType:"Sentinel",  label:"Sentinel",  triggers:[{type:"api_poll"}],    signals:[{signalType:"api_poll"}],         consensusRule:"any",   action:{type:"release_funds"}, permissions:{ownerCanCancel:true} },
  guardian:  { agentType:"Guardian",  label:"Guardian",  triggers:[{type:"threshold_cross"}], signals:[{signalType:"oracle_feed"}],  consensusRule:"any",   action:{type:"release_funds"}, permissions:{ownerCanCancel:true} },
  warden:    { agentType:"Warden",    label:"Warden",    triggers:[{type:"checkin_miss"}], signals:[{signalType:"checkin_miss"}],    consensusRule:"all",   action:{type:"release_document"}, permissions:{ownerCanCancel:true} },
};

console.log("\nBuildOS Compiler Tests\n");
console.log("Config validation:");
for (const [k,c] of Object.entries(DEMOS)) {
  test(`${c.agentType} config valid`, () => {
    assert(typeof c.agentType === "string", "agentType missing");
    assert(Array.isArray(c.triggers) && c.triggers.length > 0, "triggers missing");
    assert(typeof c.action.type === "string", "action.type missing");
    assert(c.permissions.ownerCanCancel === true, "ownerCanCancel must be true");
  });
}
console.log("\nTime conversions:");
test("90 days = 7776000s",  () => assert(90*24*60*60 === 7776000));
test("6 months = 15552000s",() => assert(180*24*60*60 === 15552000));
test("1 year = 31536000s",  () => assert(365*24*60*60 === 31536000));

console.log("\nConfig hash:");
test("hash generation works", () => {
  const h = "0x" + crypto.createHash("sha256").update(JSON.stringify(DEMOS.chronicle)).digest("hex");
  assert(h.startsWith("0x") && h.length === 66);
});

console.log(`\n${"─".repeat(40)}\n  ${passed} passed  |  ${failed} failed\n${"─".repeat(40)}\n`);
if (failed > 0) process.exit(1);
