// BuildOS deploy script - compiles + deploys AgentFactory to X Layer
const fs = require("fs");
const path = require("path");
const solc = require("solc");
const { ethers } = require("ethers");
require("dotenv").config();

const NETWORK = process.argv.includes("--network")
  ? process.argv[process.argv.indexOf("--network") + 1]
  : "xlayer_testnet";

const RPC_URLS = {
  xlayer_testnet: process.env.XLAYER_TESTNET_RPC,
  xlayer_mainnet: process.env.XLAYER_MAINNET_RPC,
};

function findImports(importPath) {
  try {
    let resolvedPath;
    if (importPath.startsWith("@openzeppelin/")) {
      resolvedPath = path.join(__dirname, "..", "node_modules", importPath);
    } else {
      resolvedPath = path.join(__dirname, "..", "contracts", importPath);
    }
    return { contents: fs.readFileSync(resolvedPath, "utf8") };
  } catch (e) {
    return { error: `File not found: ${importPath}` };
  }
}

function compile() {
  const factorySource = fs.readFileSync(
    path.join(__dirname, "..", "contracts", "AgentFactory.sol"),
    "utf8"
  );
  const triggerSource = fs.readFileSync(
    path.join(__dirname, "..", "contracts", "TriggerAgent.sol"),
    "utf8"
  );

  const input = {
    language: "Solidity",
    sources: {
      "AgentFactory.sol": { content: factorySource },
      "TriggerAgent.sol": { content: triggerSource },
    },
    settings: {
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object"] },
      },
      optimizer: { enabled: true, runs: 200 },
    },
  };

  console.log("Compiling contracts...");
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  if (output.errors) {
    const fatal = output.errors.filter((e) => e.severity === "error");
    output.errors.forEach((e) => console.log(e.formattedMessage));
    if (fatal.length > 0) {
      throw new Error("Compilation failed with errors above.");
    }
  }

  const factoryOutput = output.contracts["AgentFactory.sol"]["AgentFactory"];
  const triggerOutput = output.contracts["TriggerAgent.sol"]["TriggerAgent"];

  return {
    factory: { abi: factoryOutput.abi, bytecode: factoryOutput.evm.bytecode.object },
    trigger: { abi: triggerOutput.abi, bytecode: triggerOutput.evm.bytecode.object },
  };
}

async function deploy() {
  const rpcUrl = RPC_URLS[NETWORK];
  if (!rpcUrl) throw new Error(`Unknown network: ${NETWORK}`);
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY not set in .env");
  if (!process.env.RESOLVER_ADDRESS) throw new Error("RESOLVER_ADDRESS not set in .env");

  const { factory, trigger } = compile();
  console.log("Compilation successful.\n");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

  console.log(`Deploying from: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} OKB`);
  if (balance === 0n) {
    throw new Error("Deployer wallet has 0 balance. Fund it from the X Layer faucet first.");
  }

  console.log(`\nDeploying AgentFactory to ${NETWORK}...`);
  const FactoryContract = new ethers.ContractFactory(factory.abi, factory.bytecode, wallet);
  const factoryContract = await FactoryContract.deploy(process.env.RESOLVER_ADDRESS);
  await factoryContract.waitForDeployment();
  const factoryAddress = await factoryContract.getAddress();

  console.log(`AgentFactory deployed at: ${factoryAddress}`);

  const deploymentInfo = {
    network: NETWORK,
    deployedAt: new Date().toISOString(),
    deployer: wallet.address,
    resolver: process.env.RESOLVER_ADDRESS,
    contracts: {
      AgentFactory: {
        address: factoryAddress,
        abi: factory.abi,
      },
      TriggerAgent: {
        abi: trigger.abi,
        note: "Deployed dynamically per-agent via AgentFactory.createAgent()",
      },
    },
  };

  const outPath = path.join(__dirname, "..", "deployments", `${NETWORK}.json`);
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nSaved deployment info to deployments/${NETWORK}.json`);

  const explorerBase =
    NETWORK === "xlayer_testnet"
      ? "https://www.okx.com/web3/explorer/xlayer-test/address"
      : "https://www.okx.com/web3/explorer/xlayer/address";
  console.log(`\nView on explorer: ${explorerBase}/${factoryAddress}`);
}

deploy().catch((err) => {
  console.error("\nDeploy failed:", err.message);
  process.exit(1);
});
