// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// NOT AUDITED - testnet demo only. Do not use with real funds.

/// @title OutcomeReferralEscrow
/// @notice Minimal ERC20 escrow for outcome-based referral settlement demos on Mantle Sepolia only.
/// @dev This contract intentionally avoids production payment complexity. A third-party audit is required before mainnet use.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Holds ERC20 funds per referral until the payer releases or refunds them.
contract OutcomeReferralEscrow {
    struct Escrow {
        address payer;
        address payee;
        uint256 amount;
        bool released;
        bool refunded;
    }

    IERC20 public immutable settlementToken;
    mapping(string referralId => Escrow escrow) public escrows;

    event Deposited(string indexed referralId, address indexed payer, address indexed payee, uint256 amount);
    event Released(string indexed referralId, address indexed payer, address indexed payee, uint256 amount);
    event Refunded(string indexed referralId, address indexed payer, uint256 amount);

    error InvalidPayee();
    error InvalidAmount();
    error EscrowAlreadyExists();
    error EscrowNotFound();
    error NotPayer();
    error EscrowAlreadyClosed();
    error TransferFailed();

    /// @param token ERC20 token address used for settlement, such as testnet USDC or a mock ERC20.
    constructor(address token) {
        if (token == address(0)) revert InvalidPayee();
        settlementToken = IERC20(token);
    }

    /// @notice Deposits ERC20 funds for a referral.
    /// @dev The payer must approve this contract for `amount` before calling.
    function deposit(string calldata referralId, address payee, uint256 amount) external {
        if (payee == address(0)) revert InvalidPayee();
        if (amount == 0) revert InvalidAmount();

        Escrow storage escrow = escrows[referralId];
        if (escrow.amount != 0) revert EscrowAlreadyExists();

        escrow.payer = msg.sender;
        escrow.payee = payee;
        escrow.amount = amount;

        if (!settlementToken.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Deposited(referralId, msg.sender, payee, amount);
    }

    /// @notice Releases escrowed funds to the payee when the outcome is met.
    function release(string calldata referralId) external {
        Escrow storage escrow = escrows[referralId];
        _requireOpenEscrow(escrow);
        if (msg.sender != escrow.payer) revert NotPayer();

        escrow.released = true;
        if (!settlementToken.transfer(escrow.payee, escrow.amount)) revert TransferFailed();
        emit Released(referralId, escrow.payer, escrow.payee, escrow.amount);
    }

    /// @notice Refunds escrowed funds to the payer when the outcome is not met.
    function refund(string calldata referralId) external {
        Escrow storage escrow = escrows[referralId];
        _requireOpenEscrow(escrow);
        if (msg.sender != escrow.payer) revert NotPayer();

        escrow.refunded = true;
        if (!settlementToken.transfer(escrow.payer, escrow.amount)) revert TransferFailed();
        emit Refunded(referralId, escrow.payer, escrow.amount);
    }

    function _requireOpenEscrow(Escrow storage escrow) private view {
        if (escrow.amount == 0) revert EscrowNotFound();
        if (escrow.released || escrow.refunded) revert EscrowAlreadyClosed();
    }
}
