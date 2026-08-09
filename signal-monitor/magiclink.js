// Magic-link guardian auth.
// When a guardian is added, they get emailed a unique token.
// That token is required to check in — knowing the name alone isn't enough.

const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");
const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "agents.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS guardian_tokens (
    token TEXT PRIMARY KEY,
    agent_hash TEXT NOT NULL,
    guardian_name TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )
`);

function getTransport() {
  // Uses env vars — set SMTP_HOST, SMTP_USER, SMTP_PASS in Railway/Codespace secrets.
  // Falls back to Ethereal (fake SMTP) for local dev so nothing breaks without real creds.
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  // Ethereal fake transport for dev
  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    auth: {
      user: process.env.ETHEREAL_USER || "dev@ethereal.email",
      pass: process.env.ETHEREAL_PASS || "devpass",
    },
  });
}

async function issueToken(agentHash, guardianName, guardianEmail) {
  const token = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    "INSERT INTO guardian_tokens (token, agent_hash, guardian_name, created_at) VALUES (?, ?, ?, ?)"
  ).run(token, agentHash, guardianName, now);

  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const link = `${baseUrl}/guardian/verify?token=${token}`;

  const transport = getTransport();
  const info = await transport.sendMail({
    from: process.env.SMTP_FROM || "BuildOS <noreply@buildos.app>",
    to: guardianEmail,
    subject: "Confirm your BuildOS guardian check-in",
    text: `Hi ${guardianName},\n\nClick this link to confirm you're okay and reset the countdown:\n\n${link}\n\nThis link is single-use. If you didn't expect this, ignore it.\n\nBuildOS`,
    html: `<p>Hi ${guardianName},</p><p>Click below to confirm you're okay and reset the countdown:</p><p><a href="${link}">${link}</a></p><p>Single-use link. If you didn't expect this, ignore it.</p>`,
  });

  console.log(`[magiclink] token issued for ${guardianName} — preview: ${nodemailer.getTestMessageUrl(info) || "n/a"}`);
  return token;
}

function verifyToken(token) {
  const row = db.prepare(
    "SELECT * FROM guardian_tokens WHERE token = ? AND used = 0"
  ).get(token);
  if (!row) return null;
  // Mark used
  db.prepare("UPDATE guardian_tokens SET used = 1 WHERE token = ?").run(token);
  return { agentHash: row.agent_hash, guardianName: row.guardian_name };
}

function pendingTokenExists(agentHash, guardianName) {
  const row = db.prepare(
    "SELECT token FROM guardian_tokens WHERE agent_hash = ? AND guardian_name = ? AND used = 0"
  ).get(agentHash, guardianName);
  return !!row;
}

module.exports = { issueToken, verifyToken, pendingTokenExists };
