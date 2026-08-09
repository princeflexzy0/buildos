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
or submits transactions the owner has already authorized. This matters more
than almost any other design decision in the repo — see `how-it-works.html`
and don't build anything that routes funds through a BuildOS-controlled
wallet.

**Signal monitor is a separate service, not a cron job bolted onto the
frontend.** `signal-monitor/` runs its own HTTP server (`server.js`, raw
`http.createServer`, no framework) and ticks all registered agents on an
interval (`tickAll`, every `TICK_INTERVAL_MS`). This is intentionally
decoupled from the frontend so the trigger logic keeps running even if
nobody has the console open — the whole point is that it fires *while the
owner isn't looking*.

**Registry is a flat JSON file (`agents.json`), not a database — for now.**
`registry` is an in-memory `Map` that's synchronously flushed to disk on
every mutation (`saveToDisk()`). This is a deliberate simplicity trade-off
for the current stage, not an oversight. It won't survive concurrent writes
at scale or multi-instance deployment. If you're reading this because
BuildOS is getting real usage, that's the first thing to swap for real
persistence (Postgres, or at minimum a write-ahead log) — grep for
`saveToDisk` and `loadFromDisk` in `signal-monitor/index.js` for every touch
point.

**Trust model for guardians is intentionally soft.** Guardians are named by
the owner at registration (plain strings, no wallet, no auth) and can
check in on the owner's behalf via `/guardian-checkin/:hash` by typing a
matching name on the public status page. This is a deliberate v1 trade-off:
it's a social safety net against false triggers (owner is fine but missed a
check-in), not a security boundary. Anyone who knows a guardian's name and
has the status link can check in as them. If guardians need to be a hard
security primitive rather than a soft "someone who knows the owner vouches"
signal, that requires real auth (wallet signature, magic link, etc.) — flag
this clearly in any demo/pitch so it isn't oversold.

## Architecture

```
buildos/
├── frontend/              Static site + console (vanilla JS, no build step)
│   ├── index.html         Marketing/landing
│   ├── console.html       Agent creation & management UI
│   ├── status.html         Public, shareable per-agent status page
│   ├── app.js             Console logic: compile config, register, escrow ops
│   ├── config.js          Runtime config (MONITOR_URL, explorer base, etc.)
│   └── style.css
├── signal-monitor/         Backend service (the actual "monitor")
│   ├── server.js           HTTP routing (raw http.createServer, no Express)
│   ├── index.js            Core logic: registry, signals, consensus, checkin
│   ├── chain.js             Onchain reads/writes (AgentFactory, balances)
│   └── agents.json          Flat-file registry (see caveats above)
└── contracts/               (if present) AgentFactory + per-agent escrow
```

Data flow for the common path:
1. Owner configures an agent in the console → `app.js` builds a config object
   → `POST /register` → `signal-monitor/index.js#registerAgent` hashes the
   config and stores it in the registry.
2. Owner commits it onchain (`POST /commit-onchain/:hash`) which calls
   `chain.js` to invoke `AgentFactory.createAgent()`.
3. `tickAll()` runs on an interval, evaluating each agent's signals
   (`evaluateConsensus`) against its trigger thresholds.
4. Owner (or a named guardian) checks in via `POST /checkin/:hash` or
   `POST /guardian-checkin/:hash`, resetting the countdown.
5. Anyone with the link can view `status.html?hash=...` — a read-only,
   ownerless view into `GET /status/:hash`, showing countdown, beneficiary
   letter (if set), and trigger state.

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

There's no build step on the frontend — it's vanilla JS/HTML/CSS served
statically. Don't reach for a bundler unless the project actually needs one;
it currently doesn't.

## API reference (signal-monitor)

| Method | Path                          | Purpose                                              |
|--------|-------------------------------|-------------------------------------------------------|
| GET    | `/health`                     | Liveness check                                        |
| GET    | `/status/:hash`                | Full agent state (used by console + status page)       |
| GET    | `/status/:hash/balance`        | Onchain escrow balance for a committed agent           |
| GET    | `/status?owner=0x...`          | List agents by owner wallet                            |
| POST   | `/register`                    | Create or update an agent config                       |
| POST   | `/letter/:hash`                | Set/update the beneficiary letter                       |
| POST   | `/checkin/:hash`               | Owner check-in — resets countdown                       |
| POST   | `/guardian-checkin/:hash`      | Guardian check-in — resets countdown if name matches    |
| POST   | `/simulate/:hash`               | Force-fire a signal type (testing/demo only)            |
| POST   | `/commit-onchain/:hash`         | Deploy the agent's escrow contract                       |
| POST   | `/commit-verdict/:hash`         | Push current consensus state onchain                     |
| DELETE | `/status/:hash`                 | Delete an agent                                          |

All responses are `{ success: true, ... }` or `{ error: "..." }`. CORS is
wide open (`Access-Control-Allow-Origin: *`) — fine for a hackathon demo,
tighten before anything resembling production traffic.

## Known gaps / honest state as of this README

- No database — see registry caveat above.
- Guardian check-in has no auth beyond name matching (see trust model above).
- `/simulate/:hash` exists for demo purposes and force-fires signals; make
  sure it's not reachable/advertised in a way that lets a stranger trigger
  someone else's agent early.
- Status page shows trigger/letter but not recipient/amount by design — see
  session notes if that's ever meant to change, it's a deliberate scope cut,
  not a bug.

## Deployment

Frontend + signal-monitor both deploy to Railway. Custom domain
`buildos.tech` is live and pointed at the frontend. Push to `main` to
redeploy both.