// BuildOS Signal Monitor - onchain bridge to AgentFactory / TriggerAgent
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
require("dotenv").config();

const NETWORK = process.env.CHAIN_NETWORK || "xlayer_testnet";
const deploymentPath = path.join(__dirname, "..", "deployments", `${NETWORK}.json`);

function loadDeployment() {
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`No deployment found at deployments/${NETWORK}.json - run scripts/deploy.js first`);
  }
  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function getProviderAndWallet() {
  const rpcUrl =
    NETWORK === "xlayer_testnet" ? process.env.XLAYER_TESTNET_RPC : process.env.XLAYER_MAINNET_RPC;
  if (!rpcUrl) throw new Error(`RPC URL not set for ${NETWORK}`);
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY not set in .env");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  return { provider, wallet };
}

function getFactoryContract() {
  const deployment = loadDeployment();
  const { wallet } = getProviderAndWallet();
  const factoryInfo = deployment.contracts.AgentFactory;
  return new ethers.Contract(factoryInfo.address, factoryInfo.abi, wallet);
}

function getTriggerAgentContract(agentContractAddress) {
  const deployment = loadDeployment();
  const { wallet } = getProviderAndWallet();
  const triggerAbi = deployment.contracts.TriggerAgent.abi;
  return new ethers.Contract(agentContractAddress, triggerAbi, wallet);
}

// Creates a real onchain agent via AgentFactory.createAgent()
// Returns { agentId, agentContractAddress, txHash }
async function createOnchainAgent(config) {
  const factory = getFactoryContract();
  const configHash = config.configHash || ("0x" + require("crypto").createHash("sha256").update(JSON.stringify(config)).digest("hex"));
  const maxSpendWei = config.estimatedMaxSpendWei || "1000000000000000000";
  const agentType = config.agentType || "Custom";

  console.log(`Creating onchain agent: ${agentType} (${configHash.slice(0, 10)}...)`);
  const tx = await factory.createAgent(configHash, maxSpendWei, agentType);
  const receipt = await tx.wait();

  // Parse AgentCreated event to get agentId + spawned TriggerAgent address
  const iface = factory.interface;
  let agentId = null;
  let agentContractAddress = null;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "AgentCreated") {
        agentId = parsed.args.agentId.toString();
        agentContractAddress = parsed.args.agentContract;
        break;
      }
    } catch (e) {
      // not a log from this contract's interface, skip
    }
  }

  return {
    agentId,
    agentContractAddress,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

// Registers a signal + logs a verdict on the spawned TriggerAgent contract
// Returns { registerTxHash, verdictTxHash }
async function submitVerdict(agentContractAddress, { signalType, signalHash, positive, triggered, reasoningHash, signalsInFavor, signalsTotal }) {
  const trigger = getTriggerAgentContract(agentContractAddress);

  console.log(`Registering signal "${signalType}" on ${agentContractAddress}`);
  const sigTx = await trigger.registerSignal(signalType, signalHash || "0x00", positive);
  const sigReceipt = await sigTx.wait();

  console.log(`Logging verdict (triggered=${triggered}) on ${agentContractAddress}`);
  const verdictTx = await trigger.logVerdict(triggered, reasoningHash || "0x00", signalsInFavor, signalsTotal);
  const verdictReceipt = await verdictTx.wait();

  return {
    registerTxHash: sigReceipt.hash,
    verdictTxHash: verdictReceipt.hash,
  };
}

// Reads the onchain balance + status for an agent directly from AgentFactory
// Returns { balance, status, maxSpendWei } (balance in wei as string)
async function getAgentBalance(agentId) {
  const factory = getFactoryContract();
  const record = await factory.getAgent(agentId);
  return {
    balance: record.balance.toString(),
    maxSpendWei: record.maxSpendWei.toString(),
    status: record.status,
  };
}


// Direct transfer to recipient — used when contract restricts withdraw to msg.sender==recipient
async function relayTransfer(recipientAddress, amountWei) {
  const { wallet } = getProviderAndWallet();
  console.log(`[relay] sending ${amountWei} wei to ${recipientAddress}`);
  const tx = await wallet.sendTransaction({
    to: recipientAddress,
    value: BigInt(amountWei),
  });
  const receipt = await tx.wait();
  console.log(`[relay] sent — tx: ${receipt.hash}`);
  return { txHash: receipt.hash };
}


// Deposit to escrow from backend deployer wallet
async function depositToEscrow(recipientAddress, amountEth, unlockAt) {
  const deployment = loadDeployment();
  const { wallet } = getProviderAndWallet();
  const escrowInfo = deployment.contracts.EscrowVault;
  if (!escrowInfo) throw new Error("EscrowVault not in deployment");
  const escrow = new ethers.Contract(escrowInfo.address, escrowInfo.abi, wallet);
  console.log(`[escrow] depositing ${amountEth} OKB for ${recipientAddress}`);
  const tx = await escrow.depositNative(recipientAddress, unlockAt, {
    value: ethers.parseEther(amountEth.toString()),
  });
  const receipt = await tx.wait();
  const event = receipt.logs
    .map(log => { try { return escrow.interface.parseLog(log); } catch { return null; } })
    .find(e => e && e.name === "Deposited");
  const depositId = event?.args?.id?.toString();
  console.log(`[escrow] deposited — id: ${depositId}, tx: ${receipt.hash}`);
  return { txHash: receipt.hash, depositId };
}

module.exports = {
  loadDeployment,
  getFactoryContract,
  getTriggerAgentContract,
  createOnchainAgent,
  submitVerdict,
  getAgentBalance,
  releaseEscrow,
  relayTransfer,
  depositToEscrow,
  getEscrowDeposit,
};

// Releases escrow to recipient when agent triggers
// Calls EscrowVault.withdrawFor(depositId) — relayer-authorized, pays out to d.recipient locked at deposit time
async function releaseEscrow(depositId) {
  const deployment = loadDeployment();
  const { wallet } = getProviderAndWallet();
  const escrowInfo = deployment.contracts.EscrowVault;
  if (!escrowInfo) throw new Error("EscrowVault not in deployment");
  const escrow = new ethers.Contract(escrowInfo.address, escrowInfo.abi, wallet);

  console.log(`[escrow] releasing deposit #${depositId}`);
  const tx = await escrow.withdrawFor(depositId);
  const receipt = await tx.wait();
  console.log(`[escrow] released — tx: ${receipt.hash}`);
  return { txHash: receipt.hash };
}

// Checks if a deposit exists and is ready to withdraw
async function getEscrowDeposit(depositId) {
  const deployment = loadDeployment();
  const { wallet } = getProviderAndWallet();
  const escrowInfo = deployment.contracts.EscrowVault;
  const escrow = new ethers.Contract(escrowInfo.address, escrowInfo.abi, wallet);
  const deposit = await escrow.getDeposit(depositId);
  return {
    depositor: deposit.depositor,
    recipient: deposit.recipient,
    amount: deposit.amount.toString(),
    unlockAt: deposit.unlockAt.toString(),
    released: deposit.released,
    refunded: deposit.refunded,
  };
}
