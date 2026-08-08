// Judges can explore a fully seeded, real-onchain account without
// installing or funding a wallet. Every tx shown is real and verifiable —
// see /demo-disclosure.html for exactly what this does and doesn't do.
const DEMO_WALLET_ADDRESS = "0xYourDemoWalletAddressHere"; // pre-seeded, testnet only

let isDemoMode = false;

function enterDemoMode() {
  isDemoMode = true;
  connectedAddress = DEMO_WALLET_ADDRESS;
  activeProviderName = "Demo Account";
  updateWalletUI(DEMO_WALLET_ADDRESS);
  document.getElementById("demoModeBanner").style.display = "flex";
  if (typeof loadAgentsForAddress === "function") {
    loadAgentsForAddress(DEMO_WALLET_ADDRESS);
  }
  document.getElementById("console").scrollIntoView({ behavior: "smooth" });
}

function exitDemoMode() {
  isDemoMode = false;
  document.getElementById("demoModeBanner").style.display = "none";
  disconnectWallet();
}
