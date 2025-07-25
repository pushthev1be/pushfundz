const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PushFundz Lending Contracts", function () {
  let collateralContract, loanContract, pointsContract, mockToken;
  let owner, borrower, lender;
  
  beforeEach(async function () {
    [owner, borrower, lender] = await ethers.getSigners();
    
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    await mockToken.waitForDeployment();
    
    const PointsContract = await ethers.getContractFactory("PointsContract");
    pointsContract = await PointsContract.deploy();
    await pointsContract.waitForDeployment();
    
    const CollateralContract = await ethers.getContractFactory("CollateralContract");
    collateralContract = await CollateralContract.deploy();
    await collateralContract.waitForDeployment();
    
    const LoanContract = await ethers.getContractFactory("LoanContract");
    loanContract = await LoanContract.deploy(
      await collateralContract.getAddress()
    );
    await loanContract.waitForDeployment();
    
    await collateralContract.connect(owner).setAuthorizedContract(await loanContract.getAddress(), true);
    
    await mockToken.mint(borrower.address, ethers.parseUnits("10000", 6));
  });

  describe("CollateralContract", function () {
    it("Should allow depositing collateral", async function () {
      const collateralAmount = ethers.parseUnits("1000", 6);
      
      await mockToken.connect(borrower).approve(await collateralContract.getAddress(), collateralAmount);
      await collateralContract.connect(borrower).depositCollateral(
        await mockToken.getAddress(),
        collateralAmount,
        0, // loanId (0 for standalone collateral)
        8000 // liquidationThreshold (80%)
      );
      
      const deposit = await collateralContract.getCollateralDeposit(1);
      const balance = deposit.amount;
      expect(balance).to.equal(collateralAmount);
    });

    it("Should allow withdrawing collateral", async function () {
      const collateralAmount = ethers.parseUnits("1000", 6);
      
      await mockToken.connect(borrower).approve(await collateralContract.getAddress(), collateralAmount);
      const tx = await collateralContract.connect(borrower).depositCollateral(
        await mockToken.getAddress(),
        collateralAmount,
        0, // loanId
        8000 // liquidationThreshold
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'CollateralDeposited');
      const depositId = event ? event.args[0] : 1;
      
      await collateralContract.connect(borrower).releaseCollateral(depositId);
      
      const deposit = await collateralContract.getCollateralDeposit(depositId);
      expect(deposit.isActive).to.equal(false);
    });
  });

  describe("LoanContract", function () {
    let collateralDepositId;
    
    beforeEach(async function () {
      const collateralAmount = ethers.parseUnits("2000", 6);
      await mockToken.connect(borrower).approve(await collateralContract.getAddress(), collateralAmount);
      
      const tx = await collateralContract.connect(borrower).depositCollateral(
        await mockToken.getAddress(),
        collateralAmount,
        0, // loanId
        8000 // liquidationThreshold
      );
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'CollateralDeposited');
      collateralDepositId = event ? event.args[0] : 1; // Default to 1 if event parsing fails
    });

    it("Should create a loan request", async function () {
      const loanAmount = ethers.parseUnits("1000", 6);
      const collateralAmount = ethers.parseUnits("2000", 6);
      const interestRate = 1200; // 12%
      const duration = 30 * 24 * 60 * 60; // 30 days
      
      await loanContract.connect(borrower).requestLoan(
        loanAmount,
        await mockToken.getAddress(),
        interestRate,
        duration,
        collateralDepositId
      );
      
      const loan = await loanContract.loans(1); // Loans start at ID 1
      expect(loan.borrower).to.equal(borrower.address);
      expect(loan.amount).to.equal(loanAmount);
      expect(loan.status).to.equal(0); // PENDING
    });

    it("Should approve and fund a loan", async function () {
      const loanAmount = ethers.parseUnits("1000", 6);
      const collateralAmount = ethers.parseUnits("2000", 6);
      const interestRate = 1200;
      const duration = 30 * 24 * 60 * 60;
      
      await loanContract.connect(borrower).requestLoan(
        loanAmount,
        await mockToken.getAddress(),
        interestRate,
        duration,
        collateralDepositId
      );
      
      await mockToken.mint(await loanContract.getAddress(), loanAmount);
      
      await loanContract.connect(owner).approveLoan(1); // Use loan ID 1
      
      const loan = await loanContract.loans(1);
      expect(loan.status).to.equal(1); // ACTIVE
    });
  });

  describe("PointsContract", function () {
    it("Should mint points for early repayment", async function () {
      const pointsAmount = 100;
      
      await pointsContract.connect(owner).awardPoints(borrower.address, pointsAmount, "Test reward");
      
      const balance = await pointsContract.balanceOf(borrower.address);
      expect(balance).to.equal(pointsAmount);
    });

    it("Should burn points for redemption", async function () {
      const pointsAmount = 100;
      const burnAmount = 50;
      
      await pointsContract.connect(owner).awardPoints(borrower.address, pointsAmount, "Test reward");
      
      await pointsContract.connect(owner).redeemPoints(borrower.address, burnAmount, "Test redemption");
      
      const balance = await pointsContract.balanceOf(borrower.address);
      expect(balance).to.equal(pointsAmount - burnAmount);
    });
  });

  describe("Integration Tests", function () {
    it("Should complete full loan lifecycle with points", async function () {
      const loanAmount = ethers.parseUnits("1000", 6);
      const collateralAmount = ethers.parseUnits("2000", 6);
      const interestRate = 1200;
      const duration = 30 * 24 * 60 * 60;
      
      await mockToken.connect(borrower).approve(await collateralContract.getAddress(), collateralAmount);
      const tx = await collateralContract.connect(borrower).depositCollateral(
        await mockToken.getAddress(),
        collateralAmount,
        0, // loanId
        8000 // liquidationThreshold
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'CollateralDeposited');
      const collateralDepositId = event ? event.args[0] : 1;
      
      await loanContract.connect(borrower).requestLoan(
        loanAmount,
        await mockToken.getAddress(),
        interestRate,
        duration,
        collateralDepositId
      );
      
      await mockToken.mint(await loanContract.getAddress(), loanAmount);
      await loanContract.connect(owner).approveLoan(1); // Use loan ID 1
      await loanContract.connect(owner).disburseLoan(1); // Disburse the loan to make it active
      
      const repaymentAmount = loanAmount + (loanAmount * BigInt(interestRate) / BigInt(10000));
      await mockToken.mint(borrower.address, repaymentAmount);
      await mockToken.connect(borrower).approve(await loanContract.getAddress(), repaymentAmount);
      
      await loanContract.connect(borrower).repayLoan(1); // Use loan ID 1
      
      const loan = await loanContract.loans(1);
      expect(loan.status).to.equal(3); // REPAID
      
      await pointsContract.connect(owner).awardPoints(borrower.address, 50, "Early repayment bonus");
      const pointsBalance = await pointsContract.balanceOf(borrower.address);
      expect(pointsBalance).to.equal(50);
    });
  });
});
