// Wallet-signature guardian auth.
// Guardian signs a standard message with their Ethereum wallet.
// Server verifies the signature — proves they control the address,
// no password or magic-link needed.

const { ethers } = require("ethers");

// The message guardians sign — includes agent hash to prevent replay across agents
function buildMessage(agentHash, guardianAddress) {
  return `BuildOS guardian check-in\nagent:${agentHash}\nguardian:${guardianAddress.toLowerCase()}`;
}

// Verify a signature and return the recovered address, or null if invalid
function verifySignature(agentHash, guardianAddress, signature) {
  try {
    const message = buildMessage(agentHash, guardianAddress);
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === guardianAddress.toLowerCase() ? recovered : null;
  } catch (e) {
    console.warn("[walletsig] verify error:", e.message);
    return null;
  }
}

// Check if a guardian address is registered for an agent
function isRegisteredGuardian(state, guardianAddress) {
  const guardians = state.guardians || [];
  return guardians.some(
    (g) =>
      typeof g === "object"
        ? (g.address || "").toLowerCase() === guardianAddress.toLowerCase()
        : false
  );
}

module.exports = { buildMessage, verifySignature, isRegisteredGuardian };
