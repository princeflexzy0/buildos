// Demo Mode is ON by default for first-time visitors so judges see a
// working product immediately instead of a "Not connected" empty state.
// Persisted per-browser via localStorage; toggled off when they Connect Wallet for real.
const DEMO_WALLET_ADDRESS = "0xYourDemoWalletAddressHere";
const DEMO_MODE_KEY = "buildos_demo_mode";

let isDemoMode = false;

function initDemoModeOnLoad() {
  const stored = localStorage.getItem(DEMO_MODE_KEY);
  console.log("[DEBUG] initDemoModeOnLoad ran. stored =", stored, "on page:", location.pathname);
  // Default ON unless the user has explicitly turned it off before,
  // or already has a real wallet connected this session.
  const shouldEnable = stored === null ? true : stored === "true";
  const toggle = document.getElementById("demoToggle");
  if (toggle) toggle.checked = shouldEnable;
  if (shouldEnable) enterDemoMode(false);
  setTimeout(function() { if (typeof applyTemplateFromURL === 'function') applyTemplateFromURL(); }, 300);
}

function enterDemoMode(persist = true) {
  isDemoMode = true;
  connectedAddress = DEMO_WALLET_ADDRESS;
  activeProviderName = "Demo Account";
  updateWalletUI(DEMO_WALLET_ADDRESS);
  document.getElementById("demoModeBanner").style.display = "flex";
  const toggle = document.getElementById("demoToggle");
  if (toggle) toggle.checked = true;
  if (persist) localStorage.setItem(DEMO_MODE_KEY, "true");
  if (typeof loadAgentsForAddress === "function") loadAgentsForAddress(DEMO_WALLET_ADDRESS);
}

function exitDemoMode(persist = true) {
  isDemoMode = false;
  document.getElementById("demoModeBanner").style.display = "none";
  const toggle = document.getElementById("demoToggle");
  if (toggle) toggle.checked = false;
  if (persist) localStorage.setItem(DEMO_MODE_KEY, "false");
  disconnectWallet();
}

function toggleDemoMode(checked) {
  if (checked) enterDemoMode(true);
  else exitDemoMode(true);
}

window.addEventListener("DOMContentLoaded", initDemoModeOnLoad);
