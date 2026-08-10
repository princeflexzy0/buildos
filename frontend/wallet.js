const XLAYER_TESTNET = {
  chainId: "0xC3",
  chainName: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: ["https://testrpc.xlayer.tech"],
  blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer-test"],
};

let connectedAddress = null;
let activeProviderName = null;

function openWalletModal() {
  document.getElementById("walletModal").style.display = "flex";
}
function closeWalletModal() {
  document.getElementById("walletModal").style.display = "none";
}

// Explicit provider pick avoids grabbing the wrong injected wallet
// when a user has both MetaMask and OKX Wallet installed.
async function connectWith(providerKey) {
  let provider;
  if (providerKey === "okx") {
    provider = window.okxwallet;
    activeProviderName = "OKX Wallet";
    if (!provider) {
      alert("OKX Wallet not detected. Install it from okx.com/web3 and refresh.");
      return;
    }
  } else if (providerKey === "metamask") {
    // If both extensions are present, window.ethereum may be an array of providers
    provider = window.ethereum?.providers
      ? window.ethereum.providers.find(p => p.isMetaMask)
      : (window.ethereum?.isMetaMask ? window.ethereum : null);
    activeProviderName = "MetaMask";
    if (!provider) {
      alert("MetaMask not detected. Install it from metamask.io and refresh.");
      return;
    }
  }

  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    connectedAddress = accounts[0];
    window.activeProvider = provider; // used later for eth_sendTransaction calls

    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: XLAYER_TESTNET.chainId }] });
    } catch (e) {
      if (e.code === 4902) {
        await provider.request({ method: "wallet_addEthereumChain", params: [XLAYER_TESTNET] });
      }
    }

    provider.on?.("accountsChanged", (accs) => {
      if (!accs.length) { disconnectWallet(); return; }
      connectedAddress = accs[0];
      updateWalletUI(connectedAddress);
    });

    localStorage.setItem("buildos_wallet_address", connectedAddress);
    localStorage.setItem("buildos_wallet_provider", providerKey);
    sessionStorage.removeItem("buildos_wallet_disconnected");
    updateWalletUI(connectedAddress);
    closeWalletModal();
    window.dispatchEvent(new Event("buildos:wallet:ready"));
    return connectedAddress;
  } catch (err) {
    console.error("Wallet connect failed:", err);
    return null;
  }
}

function disconnectWallet() {
  connectedAddress = null;
  activeProviderName = null;
  window.activeProvider = null;
  localStorage.removeItem("buildos_wallet_address");
  localStorage.removeItem("buildos_wallet_provider");
  sessionStorage.setItem("buildos_wallet_disconnected", "1");
  const btn = document.getElementById("walletBtn");
  const pill = document.getElementById("walletPill");
  if (btn) {
    btn.textContent = "Connect Wallet";
    btn.classList.remove("connected");
    btn.title = "";
    btn.onclick = openWalletModal;
  }
  if (pill) { pill.textContent = "Not connected"; pill.style.color = ""; }
  // Clear agent list on disconnect
  window.dispatchEvent(new Event("buildos:wallet:disconnected"));
}

function updateWalletUI(address) {
  const btn = document.getElementById("walletBtn");
  const pill = document.getElementById("walletPill");
  if (btn) {
    btn.textContent = address.slice(0, 6) + "…" + address.slice(-4);
    btn.classList.add("connected");
    btn.title = "Click to disconnect " + activeProviderName;
    btn.onclick = () => {
      if (confirm("Disconnect " + activeProviderName + "?\n\nYour agents will be hidden and you will need to reconnect your wallet.")) {
        disconnectWallet();
        // Force wallet picker to show on next connect — no auto-reconnect
        openWalletModal();
      }
    };
  }
  if (pill) {
    pill.textContent = "🟢 " + activeProviderName + " · " + address.slice(0, 6) + "…" + address.slice(-4);
    pill.style.color = "var(--accent-text)";
    pill.title = "Connected via " + activeProviderName + " — click address button to disconnect";
  }
}

function getAddress() { return connectedAddress; }

function toggleMobileMenu() {
  const menu = document.getElementById("mobileMenu");
  const btn = document.getElementById("hamburger");
  if (!menu) return;
  menu.classList.toggle("open");
  btn.classList.toggle("open");
}

// Auto-reconnect on page load if wallet was previously connected
(async function autoReconnect() {
  // Don't auto-reconnect if user explicitly disconnected this session
  if (sessionStorage.getItem("buildos_wallet_disconnected")) return;
  const savedAddress = localStorage.getItem("buildos_wallet_address");
  const savedProvider = localStorage.getItem("buildos_wallet_provider");
  if (!savedAddress || !savedProvider) return;
  // Check if wallet is still available and has the same account
  try {
    let provider;
    if (savedProvider === "okx") provider = window.okxwallet;
    else if (savedProvider === "metamask") {
      provider = window.ethereum?.providers
        ? window.ethereum.providers.find(p => p.isMetaMask)
        : (window.ethereum?.isMetaMask ? window.ethereum : null);
    }
    if (!provider) return;
    const accounts = await provider.request({ method: "eth_accounts" }); // no popup
    if (!accounts.length || accounts[0].toLowerCase() !== savedAddress.toLowerCase()) {
      localStorage.removeItem("buildos_wallet_address");
      localStorage.removeItem("buildos_wallet_provider");
      return;
    }
    connectedAddress = accounts[0];
    window.activeProvider = provider;
    activeProviderName = savedProvider === "okx" ? "OKX Wallet" : "MetaMask";
    provider.on?.("accountsChanged", (accs) => {
      if (!accs.length) { disconnectWallet(); return; }
      connectedAddress = accs[0];
      localStorage.setItem("buildos_wallet_address", connectedAddress);
      updateWalletUI(connectedAddress);
    });
    updateWalletUI(connectedAddress);
    // Signal app.js that wallet is ready so it loads the right agents
    window.dispatchEvent(new Event("buildos:wallet:ready"));
  } catch (e) {
    console.warn("[wallet] auto-reconnect failed:", e.message);
  }
})();
