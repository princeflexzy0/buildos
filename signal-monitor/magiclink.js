// Magic-link guardian auth using Resend (same provider as notifier.js).
// When a guardian is added, they get emailed a unique token link.
// That token — not just their name — is required to check in.

const { Resend } = require("resend");
const { v4: uuidv4 } = require("uuid");
const Database = require("better-sqlite3");
const path = require("path");

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || "BuildOS <onboarding@resend.dev>";
const BASE_URL = process.env.SITE_URL || process.env.BASE_URL || "https://buildos.tech";

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

async function issueToken(agentHash, guardianName, guardianEmail) {
  const token = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    "INSERT INTO guardian_tokens (token, agent_hash, guardian_name, created_at) VALUES (?, ?, ?, ?)"
  ).run(token, agentHash, guardianName, now);

  const link = `${BASE_URL}/guardian/verify?token=${token}`;

  if (!resend) {
    console.warn("[magiclink] no RESEND_API_KEY — skipping email, token:", token);
    return token;
  }

  await resend.emails.send({
    from: FROM_EMAIL,
    to: guardianEmail,
    subject: "BuildOS — confirm your guardian check-in",
    html: `
      <div style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto">
        <div style="background:#1a1a17;padding:20px 28px;border-radius:12px 12px 0 0">
          <span style="color:#fff;font-weight:600;font-size:1.1em">BuildOS</span>
        </div>
        <div style="padding:28px;border:1px solid #e5e5e0;border-top:none;border-radius:0 0 12px 12px">
          <h2 style="margin:0 0 12px;color:#1a1a17">Hi ${guardianName},</h2>
          <p style="color:#444;line-height:1.6">
            You've been added as a guardian on BuildOS. Click below to confirm you're okay
            and reset the countdown for the agent you're protecting.
          </p>
          <a href="${link}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#1a1a17;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
            Confirm check-in
          </a>
          <p style="color:#999;font-size:0.85em">
            This is a single-use link. If you didn't expect this, you can ignore it safely.
          </p>
        </div>
      </div>`,
  });

  console.log(`[magiclink] token issued + email sent to ${guardianEmail}`);
  return token;
}

function verifyToken(token) {
  const row = db.prepare(
    "SELECT * FROM guardian_tokens WHERE token = ? AND used = 0"
  ).get(token);
  if (!row) return null;
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
