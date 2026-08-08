const XLAYER_TESTNET = {
  chainId: "0xC3",
  chainName: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: ["https://testrpc.xlayer.tech"],
  blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer-test"],
};

let connectedAddress = null;

async function connectWallet() {
  const provider = window.okxwallet || window.ethereum;
  if (!provider) {
    alert("Please install OKX Wallet or MetaMask to continue.");
    return null;
  }
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    connectedAddress = accounts[0];
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: XLAYER_TESTNET.chainId }] });
    } catch (e) {
      if (e.code === 4902) {
        await provider.request({ method: "wallet_addEthereumChain", params: [XLAYER_TESTNET] });
      }
    }
    updateWalletUI(connectedAddress);
    return connectedAddress;
  } catch (err) {
    console.error("Wallet connect failed:", err);
    return null;
  }
}

function updateWalletUI(address) {
  const btn = document.getElementById("walletBtn");
  const pill = document.getElementById("walletPill");
  if (btn) {
    btn.textContent = address.slice(0, 6) + "…" + address.slice(-4);
    btn.classList.add("connected");
  }
  if (pill) {
    pill.textContent = "🟢 " + address.slice(0, 6) + "…" + address.slice(-4);
    pill.style.color = "var(--accent-text)";
  }
}

function getAddress() { return connectedAddress; }
