import re

NAV = open("_nav.html").read()
FOOTER = open("_footer.html").read()

def build(path, title, active, body, extra_scripts=""):
    nav = NAV.replace(f'data-nav="{active}"', f'data-nav="{active}" class="active"')
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<link rel="icon" href="assets/logo-full.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="legal.css">
</head>
<body>
{nav}
<main class="page-main">
{body}
</main>
{FOOTER}
<script src="config.js"></script>
<script src="wallet.js"></script>
<script src="app.js"></script>
<script src="demo.js"></script>
<script src="demo-mode.js"></script>
{extra_scripts}
</body>
</html>'''
    open(path, "w").write(html)
    print(f"{path} written")

# ---------- TEMPLATES PAGE ----------
templates_body = '''
<section class="page-hero">
  <span class="section-tag">Agent Templates</span>
  <h1>Pick a use case.<br>Deploy in seconds.</h1>
  <p class="page-sub">Six ready-made agent patterns. Pick one, it drops straight into the compiler with a working example prompt.</p>
</section>
<section class="templates-section">
  <div class="section-inner">
    <div class="templates-grid">
      <a href="console.html?template=chronicle" class="template-card">
        <div class="template-icon">📜</div>
        <div class="template-label">Digital Will</div>
        <div class="template-name">Chronicle</div>
        <p>Releases funds to a beneficiary if owner goes silent for a set period.</p>
        <span class="template-tag">inactivity trigger</span>
      </a>
      <a href="console.html?template=sentinel" class="template-card">
        <div class="template-icon">📦</div>
        <div class="template-label">Delivery Release</div>
        <div class="template-name">Sentinel</div>
        <p>Releases payment to supplier when shipment tracking confirms delivery.</p>
        <span class="template-tag">oracle trigger</span>
      </a>
      <a href="console.html?template=guardian" class="template-card">
        <div class="template-icon">✈️</div>
        <div class="template-label">Parametric Insurance</div>
        <div class="template-name">Guardian</div>
        <p>Pays out automatically when a flight delay exceeds a threshold.</p>
        <span class="template-tag">threshold trigger</span>
      </a>
      <a href="console.html?template=warden" class="template-card">
        <div class="template-icon">🔐</div>
        <div class="template-label">Dead Drop</div>
        <div class="template-name">Warden</div>
        <p>Reveals a sealed document if creator misses scheduled check-ins.</p>
        <span class="template-tag">checkin trigger</span>
      </a>
      <a href="console.html?template=escrow" class="template-card">
        <div class="template-icon">🤝</div>
        <div class="template-label">Smart Escrow</div>
        <div class="template-name">Arbiter</div>
        <p>Holds funds and releases on mutual confirmation from both parties.</p>
        <span class="template-tag">consensus trigger</span>
      </a>
      <a href="console.html?template=subscription" class="template-card">
        <div class="template-icon">🔄</div>
        <div class="template-label">Auto Subscription</div>
        <div class="template-name">Cycle</div>
        <p>Recurring payment agent that fires on a schedule, cancels on signal.</p>
        <span class="template-tag">time trigger</span>
      </a>
    </div>
  </div>
</section>
'''
build("templates.html", "Templates — BuildOS", "templates", templates_body)

# ---------- HOW IT WORKS PAGE ----------
how_body = '''
<section class="page-hero">
  <span class="section-tag">How it Works</span>
  <h1>Four steps.<br>Plain English to onchain.</h1>
  <p class="page-sub">BuildOS turns a sentence into a monitored, self-executing agent on X Layer.</p>
</section>
<section class="pipeline-standalone">
  <div class="pipeline-step-lg">
    <span class="step-num">01</span>
    <h3>Describe</h3>
    <p>Write what you want the agent to do, in plain language — no code, no ABI, no Solidity.</p>
  </div>
  <div class="pipeline-step-lg">
    <span class="step-num">02</span>
    <h3>Compile</h3>
    <p>An LLM converts your sentence into a structured, hashed agent config: trigger condition, action, and target.</p>
  </div>
  <div class="pipeline-step-lg">
    <span class="step-num">03</span>
    <h3>Monitor</h3>
    <p>Signal Monitor watches real-world triggers — check-ins, oracle feeds, timers — and evaluates when conditions are met.</p>
  </div>
  <div class="pipeline-step-lg">
    <span class="step-num">04</span>
    <h3>Execute</h3>
    <p>Once triggered, the verdict is logged and executed on X Layer — verifiable, permanent, and visible on-chain.</p>
  </div>
</section>
<section class="page-cta-band">
  <h2>See it fire live.</h2>
  <a href="demo.html" class="btn btn-dark btn-lg">Watch the Live Demo</a>
  <a href="console.html" class="btn btn-outline btn-lg">Open the Console</a>
</section>
'''
build("how-it-works.html", "How it Works — BuildOS", "how-it-works", how_body)

# ---------- DEMO PAGE ----------
demo_body = '''
<section class="page-hero">
  <span class="section-tag">🎯 Live Hackathon Demo</span>
  <h1>Watch it fire.<br>In real time.</h1>
  <p class="page-sub">Compile a "dead man's switch" agent with a 30-second timeout. Don't check in. Watch the transaction fire automatically on X Layer — live, verifiable, permanent.</p>
</section>
<section class="demo-standalone">
  <div class="demo-timer-box">
    <div class="timer-label">Agent fires in</div>
    <div class="timer-display" id="timerDisplay">30</div>
    <div class="timer-unit">seconds</div>
    <div class="timer-status" id="timerStatus">Press Start to begin</div>
    <button class="btn btn-dark btn-lg" id="demoBtn" onclick="startDemo()">Start Live Demo</button>
    <div class="checkin-row">
      <button class="btn btn-green btn-block" id="checkinBtn" onclick="doCheckin()" disabled>✓ Check In (Reset Timer)</button>
    </div>
    <div id="demoTxHash" class="demo-tx" style="display:none"></div>
  </div>
</section>
'''
build("demo.html", "Live Demo — BuildOS", "demo", demo_body)

# ---------- CONSOLE PAGE ----------
console_body = '''
<section class="console-standalone">
  <div class="console-header">
    <div>
      <span class="section-tag">Live Console</span>
      <h1>Build your agent.</h1>
    </div>
    <div class="status-pill" id="chainStatus"><span class="pulse"></span> connecting…</div>
  </div>
  <div class="console-grid">
    <div class="panel">
      <div class="panel-head"><span class="panel-label">Compiler</span></div>
      <textarea id="compilerInput" placeholder="e.g. release my savings to my daughter if I don't check in for 6 months"></textarea>
      <button id="compileBtn" class="btn btn-green btn-block">Compile</button>
      <pre id="compilerOutput" class="code-block">// compiled config will appear here</pre>
      <div class="action-row">
        <button id="registerBtn" class="btn btn-secondary" disabled>Register with Monitor</button>
        <button id="commitBtn" class="btn btn-secondary" disabled>Commit Onchain</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <span class="panel-label">Signal Monitor</span>
        <button id="refreshBtn" class="btn-icon">↻</button>
      </div>
      <div id="agentList" class="agent-list">
        <p class="empty-state">No agents registered yet. Compile one on the left to get started.</p>
      </div>
    </div>
  </div>
</section>
'''
build("console.html", "Console — BuildOS", "console", console_body,
      extra_scripts='<script>window.addEventListener("DOMContentLoaded",()=>{const t=new URLSearchParams(location.search).get("template");if(t&&typeof loadTemplate==="function")loadTemplate(t);});</script>')

print("all pages built")
