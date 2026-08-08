const http = require("http");
const {
  registerAgent,
  getAgent,
  listAgents,
  checkin,
  simulateSignal,
  tickAll,
} = require("./index");

const PORT = process.env.MONITOR_PORT || 3002;
const TICK_INTERVAL_MS = 10000; // re-evaluate all agents every 10s

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

  // GET /health
  if (req.method === "GET" && parts[0] === "health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", service: "BuildOS Signal Monitor" }));
  }

  // GET /status  -> all agents
  // GET /status/:hash -> one agent
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

  // POST /register  { config }
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

  // POST /checkin/:hash
  if (req.method === "POST" && parts[0] === "checkin" && parts[1]) {
    const state = checkin(parts[1]);
    if (!state) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "agent not found" }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ success: true, agent: state }));
  }

  // POST /simulate/:hash  { signalType }
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

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`BuildOS Signal Monitor running on http://localhost:${PORT}`);
  console.log(`Auto-tick every ${TICK_INTERVAL_MS / 1000}s`);
  setInterval(tickAll, TICK_INTERVAL_MS);
});
