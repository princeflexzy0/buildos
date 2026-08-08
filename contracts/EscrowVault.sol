// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract EscrowVault {
    address public constant NATIVE = address(0);

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
    event Withdrawn(uint256 indexed id, address indexed recipient, uint256 amount);
    event Reclaimed(uint256 indexed id, address indexed depositor, uint256 amount);

    error InvalidUnlockTime();
    error InvalidRecipient();
    error InvalidAmount();
    error NotYetUnlocked();
    error AlreadySettled();
    error NotRecipient();
    error NotDepositor();
    error GracePeriodNotReached();
    error NativeTransferFailed();
    error ERC20TransferFailed();
    error NoNativeWithErc20();

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
        _payOut(d.token, msg.sender, d.amount);

        emit Withdrawn(id, msg.sender, d.amount);
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
