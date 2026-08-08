// BuildOS deploy script - compiles + deploys EscrowVault to X Layer
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
  const escrowSource = fs.readFileSync(
    path.join(__dirname, "..", "contracts", "EscrowVault.sol"),
    "utf8"
  );

  const input = {
    language: "Solidity",
    sources: {
      "EscrowVault.sol": { content: escrowSource },
    },
    settings: {
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object"] },
      },
      optimizer: { enabled: true, runs: 200 },
    },
  };

  console.log("Compiling EscrowVault...");
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  if (output.errors) {
    const fatal = output.errors.filter((e) => e.severity === "error");
    output.errors.forEach((e) => console.log(e.formattedMessage));
    if (fatal.length > 0) {
      throw new Error("Compilation failed with errors above.");
    }
  }

  const escrowOutput = output.contracts["EscrowVault.sol"]["EscrowVault"];

  return {
    abi: escrowOutput.abi,
    bytecode: escrowOutput.evm.bytecode.object,
  };
}

async function deploy() {
  const rpcUrl = RPC_URLS[NETWORK];
  if (!rpcUrl) throw new Error(`Unknown network: ${NETWORK}`);
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY not set in .env");

  const { abi, bytecode } = compile();
  console.log("Compilation successful.\n");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

  console.log(`Deploying from: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} OKB`);
  if (balance === 0n) {
    throw new Error("Deployer wallet has 0 balance. Fund it from the X Layer faucet first.");
  }

  const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS || wallet.address;
  console.log(`\nDeploying EscrowVault to ${NETWORK}... (fee recipient: ${feeRecipient})`);
  const EscrowFactory = new ethers.ContractFactory(abi, bytecode, wallet);
  const escrowContract = await EscrowFactory.deploy(feeRecipient);
  await escrowContract.waitForDeployment();
  const escrowAddress = await escrowContract.getAddress();

  console.log(`EscrowVault deployed at: ${escrowAddress}`);

  const deploymentsPath = path.join(__dirname, "..", "deployments", `${NETWORK}.json`);
  let deploymentInfo = {};
  if (fs.existsSync(deploymentsPath)) {
    deploymentInfo = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  }
  deploymentInfo.contracts = deploymentInfo.contracts || {};
  deploymentInfo.contracts.EscrowVault = {
    address: escrowAddress,
    abi,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(deploymentsPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nSaved deployment info to deployments/${NETWORK}.json`);

  const explorerBase =
    NETWORK === "xlayer_testnet"
      ? "https://www.okx.com/web3/explorer/xlayer-test/address"
      : "https://www.okx.com/web3/explorer/xlayer/address";
  console.log(`\nView on explorer: ${explorerBase}/${escrowAddress}`);
}

deploy().catch((err) => {
  console.error("\nDeploy failed:", err.message);
  process.exit(1);
});
