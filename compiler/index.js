// BuildOS Compiler - Natural language -> structured agent config (OpenAI)
const https = require("https");
const crypto = require("crypto");
require("dotenv").config();

const COMPILER_SYSTEM_PROMPT = `You are the BuildOS compiler. Convert natural language descriptions of autonomous AI agents into structured JSON configs.

AGENT TYPES: Chronicle (digital-will), Sentinel (delivery/milestone release), Guardian (parametric payout), Warden (dead-drop document), Custom.

OUTPUT FORMAT - respond with ONLY valid JSON, no markdown, no explanation:
{
  "agentType": "Chronicle|Sentinel|Guardian|Warden|Custom",
  "version": "1.0.0",
  "label": "short human-readable name",
  "description": "one sentence summary",
  "triggers": [{"type": "inactivity|oracle_feed|api_poll|checkin_miss|threshold_cross|custom","description": "what this watches","thresholdSeconds": 0,"thresholdValue": null,"source": "data source"}],
  "signals": [{"signalType": "inactivity_check|public_record|oracle_feed|api_poll|custom","source": "where from","description": "what confirmed"}],
  "consensusRule": "all|majority|any|2_of_2|2_of_3|custom",
  "consensusDescription": "plain English of when agent fires",
  "action": {"type": "release_funds|reveal_message|transfer_nft|release_document|custom","description": "what happens","requiresBeneficiary": true,"requiresPayload": false},
  "checkinRequired": true,
  "checkinIntervalDays": 30,
  "estimatedMaxSpendWei": "1000000000000000000",
  "permissions": {"ownerCanCancel": true,"ownerCanUpdateBeneficiary": true,"ownerCanExtendTimeout": true},
  "demoNotes": "what to show in a live demo"
}

RULES:
- Always set ownerCanCancel: true
- Infer thresholdSeconds from natural language (6 months=15552000, 90 days=7776000, 1 year=31536000)
- estimatedMaxSpendWei: use "1000000000000000000" if amount not specified
- ONLY output JSON. No preamble, no markdown fences.`;

async function callOpenAI(prompt) {
  const body = JSON.stringify({
    model: "gpt-4o",
    messages: [
      { role: "system", content: COMPILER_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return reject(new Error(parsed.error.message));
            resolve(parsed.choices[0].message.content);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

const LETTER_SYSTEM_PROMPT = `You write warm, personal letters on behalf of someone setting up a digital-will style agent for a loved one. Given rough notes from the owner, expand them into a short, heartfelt letter (120-200 words) addressed to the beneficiary. Keep the owner's original intent and tone, don't invent facts they didn't mention, and don't be overly dramatic or generic. Sign off simply. Output ONLY the letter text, no preamble, no markdown.`;

async function draftLetter(notes) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set in .env");
  const body = JSON.stringify({
    model: "gpt-4o",
    messages: [
      { role: "system", content: LETTER_SYSTEM_PROMPT },
      { role: "user", content: notes },
    ],
    temperature: 0.7,
  });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return reject(new Error(parsed.error.message));
            resolve(parsed.choices[0].message.content.trim());
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function compile(description) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set in .env");
  console.log(`\n Compiling: "${description}"\n`);
  const raw = await callOpenAI(description);
  const cleaned = raw.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
  let config;
  try {
    config = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`OpenAI returned invalid JSON:\n${cleaned}`);
  }
  config.compiledAt = new Date().toISOString();
  config.inputDescription = description;
  config.configHash = "0x" + crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex");
  return config;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    const description = args.join(" ");
    try {
      const config = await compile(description);
      console.log(JSON.stringify(config, null, 2));
    } catch (err) {
      console.error("Error:", err.message);
      process.exit(1);
    }
  } else {
    console.log('Usage: node compiler/index.js "describe your agent here"');
  }
}

main();
module.exports = { compile, draftLetter };
