const http = require("http");
const crypto = require("crypto");
const { compile } = require("./index");
require("dotenv").config();

const PORT = process.env.COMPILER_PORT || 3001;

const DEMO_CONFIGS = {
  chronicle: { agentType:"Chronicle", label:"Chronicle — Digital Will", description:"Releases funds to beneficiary when inactivity and public records confirm an event.", triggers:[{type:"inactivity",thresholdSeconds:7776000,source:"check-in system",description:"no check-in for 90 days"}], signals:[{signalType:"inactivity_check",source:"check-in system",description:"no check-in for 90 days"}], consensusRule:"2_of_2", consensusDescription:"Owner silent for 90 days AND public record confirms", action:{type:"release_funds",description:"Transfer escrowed OKB to beneficiary",requiresBeneficiary:true}, checkinRequired:true, checkinIntervalDays:30, permissions:{ownerCanCancel:true,ownerCanUpdateBeneficiary:true} },
  sentinel: { agentType:"Sentinel", label:"Sentinel — Delivery Release", description:"Releases payment when shipment tracking confirms delivery.", triggers:[{type:"api_poll",source:"shipment tracking API",description:"delivery confirmed"}], signals:[{signalType:"api_poll",source:"shipment tracking API",description:"delivered status"}], consensusRule:"any", consensusDescription:"Tracking API returns delivered status", action:{type:"release_funds",description:"Pay supplier on delivery confirmation",requiresBeneficiary:true}, checkinRequired:false, permissions:{ownerCanCancel:true,ownerCanUpdateBeneficiary:false} },
  guardian: { agentType:"Guardian", label:"Guardian — Parametric Insurance", description:"Pays out when a flight delay exceeds threshold.", triggers:[{type:"threshold_cross",thresholdValue:180,source:"flight delay API",description:"delay > 3 hours"}], signals:[{signalType:"oracle_feed",source:"flight delay API",description:"delay > 3 hours"}], consensusRule:"any", consensusDescription:"Flight delay API confirms delay over 3 hours", action:{type:"release_funds",description:"Parametric payout to policyholder",requiresBeneficiary:true}, checkinRequired:false, permissions:{ownerCanCancel:true,ownerCanUpdateBeneficiary:true} },
  warden: { agentType:"Warden", label:"Warden — Dead Drop", description:"Reveals sealed document if creator misses scheduled check-ins.", triggers:[{type:"checkin_miss",thresholdSeconds:1814400,source:"check-in system",description:"3 missed weekly check-ins"}], signals:[{signalType:"checkin_miss",source:"check-in system",description:"3 missed weekly check-ins"}], consensusRule:"all", consensusDescription:"3 consecutive weekly check-ins missed", action:{type:"release_document",description:"Reveal sealed document to beneficiary",requiresBeneficiary:true}, checkinRequired:true, checkinIntervalDays:7, permissions:{ownerCanCancel:true,ownerCanUpdateBeneficiary:true} },
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const url = req.url.split("?")[0];

  if (req.method === "GET" && url === "/health") {
    res.writeHead(200, {"Content-Type":"application/json"});
    return res.end(JSON.stringify({status:"ok",service:"BuildOS Compiler",hasApiKey:!!process.env.ANTHROPIC_API_KEY}));
  }
  if (req.method === "GET" && url === "/demos") {
    res.writeHead(200, {"Content-Type":"application/json"});
    return res.end(JSON.stringify({success:true,demos:DEMO_CONFIGS}));
  }
  if (req.method === "POST" && url === "/compile") {
    let body;
    try { body = await readBody(req); } catch { res.writeHead(400,{"Content-Type":"application/json"}); return res.end(JSON.stringify({error:"Invalid JSON body"})); }
    const { description } = body;
    if (!description || description.trim().length < 5) { res.writeHead(400,{"Content-Type":"application/json"}); return res.end(JSON.stringify({error:"description required"})); }
    try {
      const config = await compile(description.trim());
      res.writeHead(200,{"Content-Type":"application/json"});
      res.end(JSON.stringify({success:true,config}));
    } catch (err) {
      res.writeHead(500,{"Content-Type":"application/json"});
      res.end(JSON.stringify({error:err.message}));
    }
    return;
  }
  res.writeHead(404,{"Content-Type":"application/json"});
  res.end(JSON.stringify({error:"Not found"}));
});

server.listen(PORT, () => {
  console.log(`BuildOS Compiler Server running on http://localhost:${PORT}`);
  console.log(`API key: ${process.env.ANTHROPIC_API_KEY ? "set" : "MISSING - set ANTHROPIC_API_KEY in .env"}`);
});
