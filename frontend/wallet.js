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

    updateWalletUI(connectedAddress);
    closeWalletModal();
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
  const btn = document.getElementById("walletBtn");
  const pill = document.getElementById("walletPill");
  if (btn) { btn.textContent = "Connect Wallet"; btn.classList.remove("connected"); btn.onclick = openWalletModal; }
  if (pill) { pill.textContent = "Not connected"; pill.style.color = ""; }
}

function updateWalletUI(address) {
  const btn = document.getElementById("walletBtn");
  const pill = document.getElementById("walletPill");
  if (btn) {
    btn.textContent = address.slice(0, 6) + "…" + address.slice(-4);
    btn.classList.add("connected");
    btn.onclick = disconnectWallet;
  }
  if (pill) {
    pill.textContent = "🟢 " + activeProviderName + " · " + address.slice(0, 6) + "…" + address.slice(-4);
    pill.style.color = "var(--accent-text)";
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
