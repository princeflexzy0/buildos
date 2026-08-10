// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract EscrowVault {
    address public constant NATIVE = address(0);
    uint256 public constant FEE_BPS = 100; // 1% protocol fee, in basis points (100 = 1%)
    address public immutable feeRecipient;
    address public relayer;

    struct Deposit {
        address depositor;
        address recipient;
        address token;
        uint256 amount;
        uint256 unlockAt;
        bool released;
        bool refunded;
    }

    uint256 public nextDepositId;
    mapping(uint256 => Deposit) public deposits;
    uint256 public constant RECLAIM_GRACE_PERIOD = 90 days;

    event Deposited(uint256 indexed id, address indexed depositor, address indexed recipient, address token, uint256 amount, uint256 unlockAt);
    event Withdrawn(uint256 indexed id, address indexed recipient, uint256 payoutAmount, uint256 feeAmount);
    event Reclaimed(uint256 indexed id, address indexed depositor, uint256 amount);

    error InvalidUnlockTime();
    error InvalidRecipient();
    error InvalidAmount();
    error NotYetUnlocked();
    error AlreadySettled();
    error NotRecipient();
    error NotRelayer();
    error NotDepositor();
    error GracePeriodNotReached();
    error NativeTransferFailed();
    error ERC20TransferFailed();
    error NoNativeWithErc20();
    error InvalidFeeRecipient();

    constructor(address _feeRecipient) {
        if (_feeRecipient == address(0)) revert InvalidFeeRecipient();
        feeRecipient = _feeRecipient;
        relayer = msg.sender;
    }

    function setRelayer(address _relayer) external {
        if (msg.sender != relayer) revert NotRelayer();
        if (_relayer == address(0)) revert InvalidRecipient();
        relayer = _relayer;
    }

    function depositNative(address recipient, uint256 unlockAt) external payable returns (uint256 id) {
        if (recipient == address(0)) revert InvalidRecipient();
        if (unlockAt <= block.timestamp) revert InvalidUnlockTime();
        if (msg.value == 0) revert InvalidAmount();

        id = nextDepositId++;
        deposits[id] = Deposit(msg.sender, recipient, NATIVE, msg.value, unlockAt, false, false);

        emit Deposited(id, msg.sender, recipient, NATIVE, msg.value, unlockAt);
    }

    function depositERC20(address token, address recipient, uint256 amount, uint256 unlockAt) external returns (uint256 id) {
        if (token == NATIVE) revert NoNativeWithErc20();
        if (recipient == address(0)) revert InvalidRecipient();
        if (unlockAt <= block.timestamp) revert InvalidUnlockTime();
        if (amount == 0) revert InvalidAmount();

        bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
        if (!ok) revert ERC20TransferFailed();

        id = nextDepositId++;
        deposits[id] = Deposit(msg.sender, recipient, token, amount, unlockAt, false, false);

        emit Deposited(id, msg.sender, recipient, token, amount, unlockAt);
    }

    function withdraw(uint256 id) external {
        Deposit storage d = deposits[id];
        if (d.released || d.refunded) revert AlreadySettled();
        if (msg.sender != d.recipient) revert NotRecipient();
        if (block.timestamp < d.unlockAt) revert NotYetUnlocked();

        d.released = true;

        uint256 fee = (d.amount * FEE_BPS) / 10000;
        uint256 payout = d.amount - fee;

        if (fee > 0) _payOut(d.token, feeRecipient, fee);
        _payOut(d.token, msg.sender, payout);

        emit Withdrawn(id, msg.sender, payout, fee);
    }

    // Relayer-authorized withdrawal — pays out ONLY to the recipient address
    // that was locked in at deposit time. The relayer cannot redirect funds
    // to any other address; it can only trigger payout to d.recipient.
    function withdrawFor(uint256 id) external {
        if (msg.sender != relayer) revert NotRelayer();
        Deposit storage d = deposits[id];
        if (d.released || d.refunded) revert AlreadySettled();
        if (block.timestamp < d.unlockAt) revert NotYetUnlocked();

        d.released = true;

        uint256 fee = (d.amount * FEE_BPS) / 10000;
        uint256 payout = d.amount - fee;

        if (fee > 0) _payOut(d.token, feeRecipient, fee);
        _payOut(d.token, d.recipient, payout);

        emit Withdrawn(id, d.recipient, payout, fee);
    }

    function reclaim(uint256 id) external {
        Deposit storage d = deposits[id];
        if (d.released || d.refunded) revert AlreadySettled();
        if (msg.sender != d.depositor) revert NotDepositor();
        if (block.timestamp < d.unlockAt + RECLAIM_GRACE_PERIOD) revert GracePeriodNotReached();

        d.refunded = true;
        _payOut(d.token, msg.sender, d.amount);

        emit Reclaimed(id, msg.sender, d.amount);
    }

    function _payOut(address token, address to, uint256 amount) internal {
        if (token == NATIVE) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert NativeTransferFailed();
        } else {
            bool ok = IERC20(token).transfer(to, amount);
            if (!ok) revert ERC20TransferFailed();
        }
    }

    function timeUntilUnlock(uint256 id) external view returns (uint256) {
        Deposit storage d = deposits[id];
        if (block.timestamp >= d.unlockAt) return 0;
        return d.unlockAt - block.timestamp;
    }

    function getDeposit(uint256 id) external view returns (Deposit memory) {
        return deposits[id];
    }
}
