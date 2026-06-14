// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// NOT AUDITED - testnet demo only. Do not use with real funds.

/// @title MockEscrowToken
/// @notice Minimal mintable ERC20 for Mantle Sepolia escrow demos.
/// @dev This is intentionally simple and only meant to make local/testnet demos easy.
contract MockEscrowToken {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    address public immutable owner;

    mapping(address account => uint256 balance) public balanceOf;
    mapping(address account => mapping(address spender => uint256 amount)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    error NotOwner();
    error InvalidRecipient();
    error InsufficientBalance();
    error InsufficientAllowance();

    constructor(string memory tokenName, string memory tokenSymbol, uint8 tokenDecimals, address initialRecipient, uint256 initialSupply) {
        owner = msg.sender;
        name = tokenName;
        symbol = tokenSymbol;
        decimals = tokenDecimals;
        if (initialSupply > 0) {
            _mint(initialRecipient == address(0) ? msg.sender : initialRecipient, initialSupply);
        }
    }

    /// @notice Mints demo tokens. Owner-only to avoid uncontrolled public minting.
    function mint(address to, uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        _mint(to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance < amount) revert InsufficientAllowance();
        allowance[from][msg.sender] = currentAllowance - amount;
        emit Approval(from, msg.sender, allowance[from][msg.sender]);
        _transfer(from, to, amount);
        return true;
    }

    function _mint(address to, uint256 amount) private {
        if (to == address(0)) revert InvalidRecipient();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _transfer(address from, address to, uint256 amount) private {
        if (to == address(0)) revert InvalidRecipient();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
