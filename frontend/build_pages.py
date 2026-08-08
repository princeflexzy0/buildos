import re

NAV = open("_nav.html").read()
FOOTER = open("_footer.html").read()

def build(path, title, active, body, extra_scripts="", is_home=False):
    nav = NAV
    if active:
        nav = nav.replace(f'data-nav="{active}"', f'data-nav="{active}" class="active"')
    main_class = "home-main" if is_home else "page-main"
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
<main class="{main_class}">
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

# ---------- HOMEPAGE (now built the same way as every other page) ----------
home_body = open("_home_body.html").read()
build("index.html", "BuildOS — Natural Language to Onchain Agents", None, home_body, is_home=True)

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
        <div class="template-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#00D28A" stroke-width="1.6"><path d="M4 6h11a3 3 0 0 1 3 3v10H7a3 3 0 0 1-3-3V6z"/><path d="M4 6a3 3 0 0 1 3-3h11" stroke-linecap="round"/><path d="M8 9h7M8 12h7M8 15h4" stroke-linecap="round"/></svg></div>
        <div class="template-label">Digital Will</div>
        <div class="template-name">Chronicle</div>
        <p>Releases funds to a beneficiary if owner goes silent for a set period.</p>
        <span class="template-tag">inactivity trigger</span>
      </a>
      <a href="console.html?template=sentinel" class="template-card">
        <div class="template-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#00D28A" stroke-width="1.6"><path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v8l9 5 9-5V8" stroke-linejoin="round"/><path d="M12 13v8"/></svg></div>
        <div class="template-label">Delivery Release</div>
        <div class="template-name">Sentinel</div>
        <p>Releases payment to supplier when shipment tracking confirms delivery.</p>
        <span class="template-tag">oracle trigger</span>
      </a>
      <a href="console.html?template=guardian" class="template-card">
        <div class="template-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#00D28A" stroke-width="1.6"><path d="M2 16l7-2 3-8 3 8 7 2" stroke-linejoin="round" stroke-linecap="round"/><path d="M9 14l-3 6M15 14l3 6" stroke-linecap="round"/></svg></div>
        <div class="template-label">Parametric Insurance</div>
        <div class="template-name">Guardian</div>
        <p>Pays out automatically when a flight delay exceeds a threshold.</p>
        <span class="template-tag">threshold trigger</span>
      </a>
      <a href="console.html?template=warden" class="template-card">
        <div class="template-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#00D28A" stroke-width="1.6"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><circle cx="12" cy="15.5" r="1.4" fill="#00D28A" stroke="none"/></svg></div>
        <div class="template-label">Dead Drop</div>
        <div class="template-name">Warden</div>
        <p>Reveals a sealed document if creator misses scheduled check-ins.</p>
        <span class="template-tag">checkin trigger</span>
      </a>
      <a href="console.html?template=escrow" class="template-card">
        <div class="template-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#00D28A" stroke-width="1.6"><path d="M3 12l4-4 4 4M21 12l-4-4-4 4" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 8v9a2 2 0 0 0 2 2h1M17 8v9a2 2 0 0 1-2 2h-1" stroke-linecap="round"/></svg></div>
        <div class="template-label">Smart Escrow</div>
        <div class="template-name">Arbiter</div>
        <p>Holds funds and releases on mutual confirmation from both parties.</p>
        <span class="template-tag">consensus trigger</span>
      </a>
      <a href="console.html?template=subscription" class="template-card">
        <div class="template-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#00D28A" stroke-width="1.6"><path d="M21 12a9 9 0 1 1-3-6.7" stroke-linecap="round"/><path d="M21 3v6h-6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
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
  <h1>Plain English.<br>Onchain in four steps.</h1>
  <p class="page-sub">BuildOS turns a sentence into a monitored, self-executing agent on X Layer. No code. No ABI. Just describe what you want.</p>
</section>
<section class="pipeline-standalone">
  <div class="pipeline-step-lg">
    <span class="step-num">01</span>
    <h3>Describe your intent</h3>
    <p>Write what you want in plain English. Include the <strong>amount</strong>, the <strong>recipient wallet address</strong>, and the <strong>trigger condition</strong>.</p>
    <div class="how-example">
      <span class="how-example-label">Example</span>
      <span class="how-example-text">"Send 5 OKB to 0x1234...5678 if I don't check in for 30 days"</span>
    </div>
    <ul class="how-tips">
      <li>💰 <strong>Amount:</strong> how much to send — e.g. 5 OKB, 100 USDT</li>
      <li>📬 <strong>Recipient:</strong> destination wallet — always a full 0x... address</li>
      <li>⏱ <strong>Trigger:</strong> when it fires — e.g. after 30 days of inactivity</li>
    </ul>
  </div>
  <div class="pipeline-step-lg">
    <span class="step-num">02</span>
    <h3>Compile + review</h3>
    <p>The compiler parses your sentence into a structured agent config. Review every field — amount, recipient, trigger — and edit before registering.</p>
    <div class="how-example">
      <span class="how-example-label">What you see</span>
      <span class="how-example-text">Agent · Action · Amount · Recipient input · Trigger · Gas estimate</span>
    </div>
    <ul class="how-tips">
      <li>✏️ No address in your description? Paste one in the Recipient field</li>
      <li>⛽ Live gas estimate shows the testnet fee before you commit</li>
      <li>🔒 Nothing is sent or signed until you click Commit</li>
    </ul>
  </div>
  <div class="pipeline-step-lg">
    <span class="step-num">03</span>
    <h3>Register + monitor</h3>
    <p>The Signal Monitor watches for your trigger 24/7 — check-ins, timers, and oracle signals evaluated against your agent rules.</p>
    <div class="how-example">
      <span class="how-example-label">Demo vs real wallet</span>
      <span class="how-example-text">Demo ON: demo account signs, no popup. Demo OFF: your wallet signs, you pay gas.</span>
    </div>
    <ul class="how-tips">
      <li>🟢 <strong>Demo Mode ON:</strong> try everything freely, no wallet needed</li>
      <li>🦊 <strong>Demo Mode OFF:</strong> connect MetaMask or OKX Wallet</li>
      <li>📋 Agents saved and linked to your wallet — reconnecting restores history</li>
    </ul>
  </div>
  <div class="pipeline-step-lg">
    <span class="step-num">04</span>
    <h3>Commit + execute</h3>
    <p>Once your trigger fires, the agent executes on X Layer — verifiable and permanent on-chain.</p>
    <div class="how-example">
      <span class="how-example-label">What happens</span>
      <span class="how-example-text">Verdict logged onchain → funds released to recipient → explorer link available</span>
    </div>
    <ul class="how-tips">
      <li>🔗 Every committed agent gets a contract address and tx you can verify</li>
      <li>✅ Hit Check In at any time to reset your inactivity timer</li>
      <li>👛 In real mode, transfer comes from your wallet — BuildOS never holds funds</li>
    </ul>
  </div>
</section>
<section class="page-section">
  <h2 style="text-align:center;margin-bottom:32px">Frequently asked</h2>
  <div class="faq-grid">
    <div class="faq-item">
      <h4>Do I need to enter an amount?</h4>
      <p>Yes for real commits. Include it in your description ("5 OKB") or type it in the amount field above Compile. Demo mode works without it.</p>
    </div>
    <div class="faq-item">
      <h4>What address do I use as recipient?</h4>
      <p>Any valid 0x... address — a family member, another wallet you own, anyone who should receive the funds when the trigger fires.</p>
    </div>
    <div class="faq-item">
      <h4>What if I lose my compiled agent?</h4>
      <p>Registered agents are saved to disk and linked to your wallet. Reconnecting your wallet restores your full history automatically.</p>
    </div>
    <div class="faq-item">
      <h4>Does BuildOS hold my funds?</h4>
      <p>In demo mode a demo account is used. In real mode your wallet signs every transaction — BuildOS never custodies your funds.</p>
    </div>
    <div class="faq-item">
      <h4>Can I have multiple agents?</h4>
      <p>Yes. Compile and register as many as you want. Each appears as a card in the Signal Monitor with its own Check In and Commit buttons.</p>
    </div>
    <div class="faq-item">
      <h4>What tokens are supported?</h4>
      <p>OKB, USDT, and USDC on X Layer testnet. Mainnet support is on the roadmap.</p>
    </div>
  </div>
</section>
<section class="page-cta-band">
  <h2>Ready to try it?</h2>
  <a href="console.html" class="btn btn-dark btn-lg">Open the Console</a>
  <a href="demo.html" class="btn btn-outline btn-lg">Watch Live Demo</a>
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
    <button class="btn btn-outline btn-lg" id="demoStopBtn" onclick="stopDemo()" style="display:none">Stop Demo</button>
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
      <div id="compilerOutput" class="code-block">// compiled config will appear here</div>
      <div id="gasEstimateBox" class="gas-estimate" style="display:none"></div>
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

print("all pages built from identical nav/footer partials — index.html included")
