
# BuildOS — Onchain Dead Man's Switches for Agents & Wallets

BuildOS lets someone configure a non-custodial "if I go silent, do this" agent:
funds sit in a smart contract the owner controls, a signal-monitor service
watches for signs of life (check-ins, onchain activity, guardian
confirmations), and if the configured trigger condition is met, the agent's
predefined action fires — e.g. releasing funds to a beneficiary along with a
letter the owner wrote in advance.

Think: crypto-native life insurance / inheritance planning, built as a
generic "trigger → action" agent framework rather than a single-purpose app.

## Why it's built this way

**Non-custodial by design.** BuildOS never holds user funds. Every agent's
escrow lives in its own onchain contract instance
(`AgentFactory.createAgent()`), and the backend only ever *reads* chain state
or submits transactions the owner has already authorized.

**Signal monitor is a separate service, not a cron job bolted onto the
frontend.** `signal-monitor/` runs its own HTTP server (`server.js`, raw
`http.createServer`, no framework) and ticks all registered agents on an
interval (`tickAll`, every `TICK_INTERVAL_MS`). Intentionally decoupled from
the frontend so the trigger logic keeps running even if nobody has the
console open.

**Persistence is SQLite by default, Postgres-ready.** `signal-monitor/db.js`
uses `better-sqlite3` (WAL mode, ACID-safe) when no `DATABASE_URL` is set,
and automatically switches to Postgres when `DATABASE_URL` is provided. This
replaces the old flat `agents.json` approach — concurrent writes are now
safe. To migrate to Postgres: provision a Postgres service in Railway, set
`DATABASE_URL`, and redeploy. The schema is created automatically on boot.

**Guardian auth is hardened — two layers.**
1. **Magic-link email** (`signal-monitor/magiclink.js`): when a guardian is
   added, they receive a unique single-use token via Resend. That token (not
   just their name) is required to check in via `GET /guardian/verify?token=`.
2. **Wallet signature** (`signal-monitor/walletsig.js`): guardians with an
   Ethereum wallet can check in via `POST /guardian-sig/:hash` by signing a
   deterministic message with their private key. Verified server-side via
   `ethers.verifyMessage` — cryptographic proof of wallet control.

Both methods are supported simultaneously. The old name-only check-in
(`/guardian-checkin/:hash`) is still present for backwards compatibility but
should be considered a soft fallback only.

**M-of-N guardian consensus.** `guardianThreshold` on each agent config sets
how many guardians must confirm before the countdown resets. The status page
shows live progress ("2 of 3 confirmed"). Pending confirmations are stored
per-agent and cleared when threshold is met or the agent is re-evaluated.

## Architecture

```
buildos/
├── frontend/ Static site + console (vanilla JS, no build step)
│ ├── index.html Marketing/landing
│ ├── console.html Agent creation & management UI
│ ├── status.html Public, shareable per-agent status page
│ ├── app.js Console logic: compile config, register, escrow ops
│ ├── config.js Runtime config (MONITOR_URL, explorer base, etc.)
│ └── style.css
├── signal-monitor/ Backend service (the actual "monitor")
│ ├── server.js HTTP routing (raw http.createServer, no Express)
│ ├── index.js Core logic: registry, signals, consensus, checkin
│ ├── chain.js Onchain reads/writes (AgentFactory, balances)
│ ├── db.js SQLite/Postgres persistence layer
│ ├── magiclink.js Magic-link guardian auth (Resend + UUID tokens)
│ ├── walletsig.js Wallet-signature guardian auth (ethers.js)
│ ├── notifier.js Email notifications (Resend, 3 branded templates)
│ └── agents.db SQLite database (auto-created, gitignored in prod)
└── contracts/ AgentFactory + per-agent escrow (Solidity)
```

Data flow for the common path:
1. Owner configures an agent in the console → `app.js` builds a config object
   → `POST /register` → `signal-monitor/index.js#registerAgent` hashes the
   config and stores it in SQLite.
2. Owner commits it onchain (`POST /commit-onchain/:hash`) → `chain.js`
   invokes `AgentFactory.createAgent()`.
3. `tickAll()` runs on an interval, evaluating each agent's signals
   (`evaluateConsensus`) against its trigger thresholds.
4. Guardians check in via magic-link email (`GET /guardian/verify?token=`)
   or wallet signature (`POST /guardian-sig/:hash`). M-of-N threshold must
   be met to reset the countdown.
5. Anyone with the link can view `status.html?hash=...` — shows countdown,
   guardian progress ("2 of 3 confirmed"), beneficiary letter, and trigger state.

## Running locally

```bash
# Backend
cd signal-monitor
npm install
node server.js          # listens on MONITOR_PORT (default 3002)

# Frontend
cd frontend
# static files — serve with any static server, or open directly
# make sure config.js MONITOR_URL points at your local signal-monitor
```

No build step on the frontend — vanilla JS/HTML/CSS served statically.

## Environment variables (signal-monitor)

| Variable         | Required | Description                                              |
|------------------|----------|----------------------------------------------------------|
| `RESEND_API_KEY` | Yes      | Resend API key for email (magic-link + notifications)    |
| `FROM_EMAIL`     | Yes      | Sender address, e.g. `BuildOS <noreply@buildos.tech>`    |
| `SITE_URL`       | Yes      | Public URL of the frontend, e.g. `https://buildos.tech`  |
| `BASE_URL`       | Yes      | Same as SITE_URL (used for magic-link token URLs)        |
| `MONITOR_PORT`   | No       | HTTP port (default 3002)                                 |
| `DATABASE_URL`   | No       | Postgres connection string — omit to use SQLite          |

## API reference (signal-monitor)

| Method | Path                          | Purpose                                                     |
|--------|-------------------------------|--------------------------------------------------------------|
| GET    | `/health`                     | Liveness check                                               |
| GET    | `/status/:hash`               | Full agent state                                             |
| GET    | `/status/:hash/balance`       | Onchain escrow balance                                       |
| GET    | `/status?owner=0x...`         | List agents by owner wallet                                  |
| GET    | `/guardian/verify?token=`     | Magic-link check-in (guardian clicks emailed link)           |
| POST   | `/register`                   | Create or update an agent config                             |
| POST   | `/letter/:hash`               | Set/update the beneficiary letter                            |
| POST   | `/checkin/:hash`              | Owner check-in — resets countdown                            |
| POST   | `/guardian-checkin/:hash`     | Guardian check-in by name (soft, legacy)                     |
| POST   | `/guardian-sig/:hash`         | Guardian check-in by wallet signature (hardened)             |
| POST   | `/simulate/:hash`             | Force-fire a signal type (testing/demo only)                 |
| POST   | `/commit-onchain/:hash`       | Deploy the agent's escrow contract                           |
| POST   | `/commit-verdict/:hash`       | Push current consensus state onchain                         |
| DELETE | `/status/:hash`               | Delete an agent                                              |

All responses are `{ success: true, ... }` or `{ error: "..." }`. CORS is
wide open (`Access-Control-Allow-Origin: *`) — tighten before production.

## Guardian check-in: how to register guardians

Guardians can be registered as objects with name + email (magic-link) or
name + address (wallet-sig):

```json
{
  "guardians": [
    { "name": "Alice", "email": "alice@example.com" },
    { "name": "Bob", "address": "0xabc123..." }
  ],
  "guardianThreshold": 2
}
```

On registration, magic-link emails are automatically sent to any guardian
with an `email` field. Wallet-sig guardians sign offline and POST the
signature directly.

## Known gaps / honest state

- `/simulate/:hash` is demo-only — ensure it isn't reachable by strangers
  in production.
- Status page shows trigger/letter but not recipient/amount by design.
- CORS is wide open — tighten before serious production traffic.
- SQLite is single-instance only — set `DATABASE_URL` for multi-instance.

## Deployment

Frontend + signal-monitor both deploy to Railway. Custom domain
`buildos.tech` is live. Push to `main` to redeploy both.

## Full changelog

### Guardians + Email Notifications + Branding (session 1)
- Guardian name-matching check-in via status page
- Email notifications at 50%/75%/90% countdown + trigger-fired (owner + beneficiary)
- Resend integration with 3 branded HTML templates
- Domain verified (DKIM/SPF/DMARC) on buildos.tech
- Support inbox (support@buildos.tech)
- Logo/favicon cleanup (white-flattened, no transparency artifacts)

### M-of-N Guardian Consensus + Status UI (session 2)
- `guardianThreshold` config field — N-of-M confirmations required
- Pending confirmations tracked per agent, cleared on threshold or re-eval
- Status page shows live progress ("2 of 3 confirmed") instead of binary pass/fail

### Hardened Persistence + Auth (session 3)
- **SQLite persistence** via `better-sqlite3` (WAL mode) replaces flat JSON
- **Postgres-ready** — set `DATABASE_URL` to auto-switch, zero code change
- **Magic-link guardian auth** — Resend emails unique single-use tokens to guardians; token required to check in, name alone is not enough
- **Wallet-signature guardian auth** — guardians with ETH wallets sign a deterministic message; verified server-side via ethers.js
- `.env.example` added with all required vars documented
EOF
echo "done"
