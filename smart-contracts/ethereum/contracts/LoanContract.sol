// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./CollateralContract.sol";

contract LoanContract is ReentrancyGuard, Ownable {
    enum LoanStatus { Pending, Approved, Active, Repaid, Defaulted }

    struct Loan {
        uint256 id;
        address borrower;
        uint256 amount;
        address loanToken;
        uint256 interestRate; // in basis points (e.g., 1200 = 12%)
        uint256 duration; // in seconds
        uint256 collateralDepositId;
        LoanStatus status;
        uint256 createdAt;
        uint256 approvedAt;
        uint256 dueDate;
        uint256 repaidAmount;
        uint256 repaidAt;
    }

    mapping(uint256 => Loan) public loans;
    mapping(address => uint256[]) public borrowerLoans;
    
    uint256 public nextLoanId = 1;
    uint256 public constant BASIS_POINTS = 10000;
    
    CollateralContract public collateralContract;

    event LoanRequested(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 amount,
        address loanToken,
        uint256 interestRate,
        uint256 duration
    );

    event LoanApproved(uint256 indexed loanId, uint256 approvedAt);
    event LoanDisbursed(uint256 indexed loanId, uint256 amount);
    event LoanRepaid(uint256 indexed loanId, uint256 amount, uint256 repaidAt);
    event LoanDefaulted(uint256 indexed loanId);

    constructor(address _collateralContract) {
        collateralContract = CollateralContract(_collateralContract);
    }

    function requestLoan(
        uint256 amount,
        address loanToken,
        uint256 interestRate,
        uint256 duration,
        uint256 collateralDepositId
    ) external nonReentrant returns (uint256) {
        require(amount > 0, "Amount must be greater than 0");
        require(loanToken != address(0), "Invalid loan token");
        require(duration > 0, "Duration must be greater than 0");

        // Verify collateral deposit exists and belongs to borrower
        CollateralContract.CollateralDeposit memory deposit = collateralContract.getCollateralDeposit(collateralDepositId);
        require(deposit.borrower == msg.sender, "Invalid collateral deposit");
        require(deposit.isActive, "Collateral deposit not active");

        uint256 loanId = nextLoanId++;

        loans[loanId] = Loan({
            id: loanId,
            borrower: msg.sender,
            amount: amount,
            loanToken: loanToken,
            interestRate: interestRate,
            duration: duration,
            collateralDepositId: collateralDepositId,
            status: LoanStatus.Pending,
            createdAt: block.timestamp,
            approvedAt: 0,
            dueDate: 0,
            repaidAmount: 0,
            repaidAt: 0
        });

        borrowerLoans[msg.sender].push(loanId);

        emit LoanRequested(loanId, msg.sender, amount, loanToken, interestRate, duration);
        
        return loanId;
    }

    function approveLoan(uint256 loanId) external onlyOwner {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Pending, "Loan not pending");

        loan.status = LoanStatus.Approved;
        loan.approvedAt = block.timestamp;
        loan.dueDate = block.timestamp + loan.duration;

        emit LoanApproved(loanId, block.timestamp);
    }

    function disburseLoan(uint256 loanId) external onlyOwner nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Approved, "Loan not approved");

        loan.status = LoanStatus.Active;

        IERC20 token = IERC20(loan.loanToken);
        require(
            token.transfer(loan.borrower, loan.amount),
            "Loan disbursement failed"
        );

        emit LoanDisbursed(loanId, loan.amount);
    }

    function repayLoan(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Active, "Loan not active");
        require(loan.borrower == msg.sender, "Not loan borrower");

        uint256 totalRepayment = calculateTotalRepayment(loanId);

        IERC20 token = IERC20(loan.loanToken);
        require(
            token.transferFrom(msg.sender, address(this), totalRepayment),
            "Repayment transfer failed"
        );

        loan.status = LoanStatus.Repaid;
        loan.repaidAmount = totalRepayment;
        loan.repaidAt = block.timestamp;

        // Release collateral
        collateralContract.releaseCollateral(loan.collateralDepositId);

        emit LoanRepaid(loanId, totalRepayment, block.timestamp);
    }

    function markLoanAsDefaulted(uint256 loanId) external onlyOwner {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Active, "Loan not active");
        require(block.timestamp > loan.dueDate, "Loan not overdue");

        loan.status = LoanStatus.Defaulted;

        // Liquidate collateral
        collateralContract.liquidateCollateral(loan.collateralDepositId);

        emit LoanDefaulted(loanId);
    }

    function calculateTotalRepayment(uint256 loanId) public view returns (uint256) {
        Loan memory loan = loans[loanId];
        uint256 interest = (loan.amount * loan.interestRate) / BASIS_POINTS;
        return loan.amount + interest;
    }

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function getBorrowerLoans(address borrower) external view returns (uint256[] memory) {
        return borrowerLoans[borrower];
    }

    function isLoanOverdue(uint256 loanId) external view returns (bool) {
        Loan memory loan = loans[loanId];
        return loan.status == LoanStatus.Active && block.timestamp > loan.dueDate;
    }
}
