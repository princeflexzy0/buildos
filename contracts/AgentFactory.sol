// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./TriggerAgent.sol";

contract AgentFactory is Ownable, ReentrancyGuard {
    enum AgentStatus { Active, Resolved, Cancelled }
    struct AgentRecord {
        address owner;
        address agentContract;
        bytes32 configHash;
        uint256 maxSpendWei;
        uint256 balance;
        AgentStatus status;
        uint256 createdAt;
        string agentType;
    }
    uint256 public nextAgentId;
    mapping(uint256 => AgentRecord) public agents;
    mapping(address => uint256[]) public ownerAgents;
    address public resolver;
    event AgentCreated(uint256 indexed agentId, address indexed owner, address agentContract, bytes32 configHash, string agentType, uint256 maxSpendWei);
    event AgentFunded(uint256 indexed agentId, address indexed funder, uint256 amount, uint256 newBalance);
    event AgentResolved(uint256 indexed agentId, address agentContract);
    event AgentCancelled(uint256 indexed agentId, address indexed owner, uint256 refundAmount);
    event ResolverUpdated(address indexed oldResolver, address indexed newResolver);
    error NotAgentOwner(); error AgentNotActive(); error OnlyResolver(); error InvalidResolver(); error ZeroMaxSpend();
    constructor(address _resolver) Ownable(msg.sender) {
        if (_resolver == address(0)) revert InvalidResolver();
        resolver = _resolver;
    }
    function createAgent(bytes32 configHash, uint256 maxSpendWei, string calldata agentType) external returns (uint256 agentId) {
        if (maxSpendWei == 0) revert ZeroMaxSpend();
        agentId = nextAgentId++;
        TriggerAgent agentContract = new TriggerAgent(agentId, msg.sender, resolver, maxSpendWei, configHash);
        agents[agentId] = AgentRecord({ owner: msg.sender, agentContract: address(agentContract), configHash: configHash, maxSpendWei: maxSpendWei, balance: 0, status: AgentStatus.Active, createdAt: block.timestamp, agentType: agentType });
        ownerAgents[msg.sender].push(agentId);
        emit AgentCreated(agentId, msg.sender, address(agentContract), configHash, agentType, maxSpendWei);
    }
    function fundAgent(uint256 agentId) external payable nonReentrant {
        AgentRecord storage rec = agents[agentId];
        if (rec.status != AgentStatus.Active) revert AgentNotActive();
        rec.balance += msg.value;
        emit AgentFunded(agentId, msg.sender, msg.value, rec.balance);
    }
    function settleAgent(uint256 agentId, address payable beneficiary) external nonReentrant {
        if (msg.sender != resolver) revert OnlyResolver();
        AgentRecord storage rec = agents[agentId];
        if (rec.status != AgentStatus.Active) revert AgentNotActive();
        rec.status = AgentStatus.Resolved;
        uint256 payout = rec.balance;
        rec.balance = 0;
        TriggerAgent(rec.agentContract).markResolved();
        if (payout > 0) { (bool ok, ) = beneficiary.call{value: payout}(""); require(ok, "Transfer failed"); }
        emit AgentResolved(agentId, rec.agentContract);
    }
    function cancelAgent(uint256 agentId) external nonReentrant {
        AgentRecord storage rec = agents[agentId];
        if (rec.owner != msg.sender) revert NotAgentOwner();
        if (rec.status != AgentStatus.Active) revert AgentNotActive();
        rec.status = AgentStatus.Cancelled;
        uint256 refund = rec.balance;
        rec.balance = 0;
        TriggerAgent(rec.agentContract).markCancelled();
        if (refund > 0) { (bool ok, ) = payable(msg.sender).call{value: refund}(""); require(ok, "Refund failed"); }
        emit AgentCancelled(agentId, msg.sender, refund);
    }
    function updateResolver(address newResolver) external onlyOwner {
        if (newResolver == address(0)) revert InvalidResolver();
        emit ResolverUpdated(resolver, newResolver);
        resolver = newResolver;
    }
    function getAgent(uint256 agentId) external view returns (AgentRecord memory) { return agents[agentId]; }
    function getOwnerAgents(address owner) external view returns (uint256[] memory) { return ownerAgents[owner]; }
    function totalAgents() external view returns (uint256) { return nextAgentId; }
}
