const http = require("http");
const {
  registerAgent,
  getAgent,
  listAgents,
  checkin,
  simulateSignal,
  tickAll,
  commitOnchain,
  commitVerdictOnchain,
} = require("./index");

const PORT = process.env.MONITOR_PORT || 3002;
const TICK_INTERVAL_MS = 10000;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  const parts = req.url.split("?")[0].split("/").filter(Boolean);

  if (req.method === "GET" && parts[0] === "health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", service: "BuildOS Signal Monitor" }));
  }

  if (req.method === "GET" && parts[0] === "status") {
    if (parts[1]) {
      const agent = getAgent(parts[1]);
      if (!agent) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "agent not found" }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, agent }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ success: true, agents: listAgents() }));
  }

  if (req.method === "POST" && parts[0] === "register") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Invalid JSON body" }));
    }
    const config = body.config || body;
    if (!config || !config.agentType) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "valid agent config required" }));
    }
    const state = registerAgent(config);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ success: true, agent: state }));
  }

  if (req.method === "POST" && parts[0] === "checkin" && parts[1]) {
    const state = checkin(parts[1]);
    if (!state) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "agent not found" }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ success: true, agent: state }));
  }

  if (req.method === "POST" && parts[0] === "simulate" && parts[1]) {
    let body;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Invalid JSON body" }));
    }
    if (!body.signalType) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "signalType required" }));
    }
    const state = simulateSignal(parts[1], body.signalType);
    if (!state) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "agent or signalType not found" }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ success: true, agent: state }));
  }

  // POST /commit-onchain/:hash - creates the real AgentFactory.createAgent() tx
  if (req.method === "POST" && parts[0] === "commit-onchain" && parts[1]) {
    try {
      const state = await commitOnchain(parts[1]);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, agent: state }));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // POST /commit-verdict/:hash - pushes current signal/consensus state onchain
  if (req.method === "POST" && parts[0] === "commit-verdict" && parts[1]) {
    try {
      const state = await commitVerdictOnchain(parts[1]);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, agent: state }));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`BuildOS Signal Monitor running on http://localhost:${PORT}`);
  console.log(`Auto-tick every ${TICK_INTERVAL_MS / 1000}s`);
  setInterval(tickAll, TICK_INTERVAL_MS);
});
