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

module.exports = {
  loadDeployment,
  getFactoryContract,
  getTriggerAgentContract,
  createOnchainAgent,
  submitVerdict,
};
