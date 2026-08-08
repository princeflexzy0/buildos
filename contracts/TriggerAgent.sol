// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TriggerAgent {
    enum AgentStatus { Active, Resolved, Cancelled }
    struct Signal { string signalType; string signalHash; uint256 timestamp; bool positive; }
    struct Verdict { bool triggered; string reasoningHash; uint256 timestamp; uint8 signalsInFavor; uint8 signalsTotal; }
    uint256 public immutable agentId;
    address public owner;
    address public resolver;
    uint256 public immutable maxSpendWei;
    bytes32 public immutable configHash;
    AgentStatus public status;
    Signal[] public signals;
    Verdict public lastVerdict;
    uint256 public lastCheckin;
    address public beneficiary;
    event SignalRegistered(uint256 indexed agentId, string signalType, string signalHash, bool positive, uint256 timestamp);
    event VerdictLogged(uint256 indexed agentId, bool triggered, string reasoningHash, uint8 signalsInFavor, uint8 signalsTotal);
    event CheckinRecorded(uint256 indexed agentId, address indexed owner, uint256 timestamp);
    event BeneficiaryUpdated(uint256 indexed agentId, address oldBeneficiary, address newBeneficiary);
    event StatusChanged(uint256 indexed agentId, AgentStatus newStatus);
    error OnlyOwner(); error OnlyResolver(); error NotActive();
    constructor(uint256 _agentId, address _owner, address _resolver, uint256 _maxSpendWei, bytes32 _configHash) {
        agentId = _agentId; owner = _owner; resolver = _resolver; maxSpendWei = _maxSpendWei; configHash = _configHash;
        status = AgentStatus.Active; lastCheckin = block.timestamp;
    }
    modifier onlyOwner() { if (msg.sender != owner) revert OnlyOwner(); _; }
    modifier onlyResolver() { if (msg.sender != resolver) revert OnlyResolver(); _; }
    modifier onlyActive() { if (status != AgentStatus.Active) revert NotActive(); _; }
    function registerSignal(string calldata signalType, string calldata signalHash, bool positive) external onlyResolver onlyActive {
        signals.push(Signal({ signalType: signalType, signalHash: signalHash, timestamp: block.timestamp, positive: positive }));
        emit SignalRegistered(agentId, signalType, signalHash, positive, block.timestamp);
    }
    function logVerdict(bool triggered, string calldata reasoningHash, uint8 signalsInFavor, uint8 signalsTotal) external onlyResolver onlyActive {
        lastVerdict = Verdict({ triggered: triggered, reasoningHash: reasoningHash, timestamp: block.timestamp, signalsInFavor: signalsInFavor, signalsTotal: signalsTotal });
        emit VerdictLogged(agentId, triggered, reasoningHash, signalsInFavor, signalsTotal);
    }
    function checkin() external onlyOwner onlyActive { lastCheckin = block.timestamp; emit CheckinRecorded(agentId, msg.sender, block.timestamp); }
    function updateBeneficiary(address newBeneficiary) external onlyOwner onlyActive { emit BeneficiaryUpdated(agentId, beneficiary, newBeneficiary); beneficiary = newBeneficiary; }
    function markResolved() external onlyResolver { status = AgentStatus.Resolved; emit StatusChanged(agentId, AgentStatus.Resolved); }
    function markCancelled() external onlyResolver { status = AgentStatus.Cancelled; emit StatusChanged(agentId, AgentStatus.Cancelled); }
    function getSignalCount() external view returns (uint256) { return signals.length; }
    function getAllSignals() external view returns (Signal[] memory) { return signals; }
    function secondsSinceCheckin() external view returns (uint256) { return block.timestamp - lastCheckin; }
    function getLastVerdict() external view returns (Verdict memory) { return lastVerdict; }
}
