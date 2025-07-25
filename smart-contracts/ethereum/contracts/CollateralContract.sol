// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CollateralContract is ReentrancyGuard, Ownable {
    struct CollateralDeposit {
        address borrower;
        address tokenAddress;
        uint256 amount;
        uint256 loanId;
        bool isActive;
        uint256 liquidationThreshold;
        uint256 depositTime;
    }

    mapping(uint256 => CollateralDeposit) public collateralDeposits;
    mapping(address => uint256[]) public borrowerDeposits;
    
    uint256 public nextDepositId = 1;
    uint256 public constant LIQUIDATION_PENALTY = 500; // 5%
    uint256 public constant BASIS_POINTS = 10000;

    event CollateralDeposited(
        uint256 indexed depositId,
        address indexed borrower,
        address indexed token,
        uint256 amount,
        uint256 loanId
    );

    event CollateralReleased(
        uint256 indexed depositId,
        address indexed borrower,
        uint256 amount
    );

    event CollateralLiquidated(
        uint256 indexed depositId,
        address indexed borrower,
        uint256 amount,
        uint256 penalty
    );

    function depositCollateral(
        address tokenAddress,
        uint256 amount,
        uint256 loanId,
        uint256 liquidationThreshold
    ) external nonReentrant returns (uint256) {
        require(amount > 0, "Amount must be greater than 0");
        require(tokenAddress != address(0), "Invalid token address");

        IERC20 token = IERC20(tokenAddress);
        require(
            token.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );

        uint256 depositId = nextDepositId++;
        
        collateralDeposits[depositId] = CollateralDeposit({
            borrower: msg.sender,
            tokenAddress: tokenAddress,
            amount: amount,
            loanId: loanId,
            isActive: true,
            liquidationThreshold: liquidationThreshold,
            depositTime: block.timestamp
        });

        borrowerDeposits[msg.sender].push(depositId);

        emit CollateralDeposited(depositId, msg.sender, tokenAddress, amount, loanId);
        
        return depositId;
    }

    mapping(address => bool) public authorizedContracts;

    modifier onlyAuthorized(uint256 depositId) {
        CollateralDeposit storage deposit = collateralDeposits[depositId];
        require(
            deposit.borrower == msg.sender || 
            msg.sender == owner() || 
            authorizedContracts[msg.sender], 
            "Unauthorized"
        );
        _;
    }

    function setAuthorizedContract(address contractAddress, bool authorized) external onlyOwner {
        authorizedContracts[contractAddress] = authorized;
    }

    function releaseCollateral(uint256 depositId) external nonReentrant onlyAuthorized(depositId) {
        CollateralDeposit storage deposit = collateralDeposits[depositId];
        require(deposit.isActive, "Deposit not active");

        deposit.isActive = false;

        IERC20 token = IERC20(deposit.tokenAddress);
        require(
            token.transfer(deposit.borrower, deposit.amount),
            "Transfer failed"
        );

        emit CollateralReleased(depositId, deposit.borrower, deposit.amount);
    }

    function liquidateCollateral(uint256 depositId) external onlyOwner nonReentrant {
        CollateralDeposit storage deposit = collateralDeposits[depositId];
        require(deposit.isActive, "Deposit not active");

        uint256 penalty = (deposit.amount * LIQUIDATION_PENALTY) / BASIS_POINTS;
        uint256 remainingAmount = deposit.amount - penalty;

        deposit.isActive = false;

        IERC20 token = IERC20(deposit.tokenAddress);
        
        // Transfer penalty to contract owner
        require(token.transfer(owner(), penalty), "Penalty transfer failed");
        
        // Transfer remaining amount to borrower
        require(token.transfer(deposit.borrower, remainingAmount), "Remaining transfer failed");

        emit CollateralLiquidated(depositId, deposit.borrower, deposit.amount, penalty);
    }

    function getCollateralDeposit(uint256 depositId) external view returns (CollateralDeposit memory) {
        return collateralDeposits[depositId];
    }

    function getBorrowerDeposits(address borrower) external view returns (uint256[] memory) {
        return borrowerDeposits[borrower];
    }
}
