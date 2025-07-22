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
      await collateralContract.getAddress(),
      await pointsContract.getAddress()
    );
    await loanContract.waitForDeployment();
    
    await mockToken.mint(borrower.address, ethers.parseUnits("10000", 6));
  });

  describe("CollateralContract", function () {
    it("Should allow depositing collateral", async function () {
      const collateralAmount = ethers.parseUnits("1000", 6);
      
      await mockToken.connect(borrower).approve(await collateralContract.getAddress(), collateralAmount);
      await collateralContract.connect(borrower).depositCollateral(
        await mockToken.getAddress(),
        collateralAmount
      );
      
      const balance = await collateralContract.getCollateralBalance(
        borrower.address,
        await mockToken.getAddress()
      );
      expect(balance).to.equal(collateralAmount);
    });

    it("Should allow withdrawing collateral", async function () {
      const collateralAmount = ethers.parseUnits("1000", 6);
      
      await mockToken.connect(borrower).approve(await collateralContract.getAddress(), collateralAmount);
      await collateralContract.connect(borrower).depositCollateral(
        await mockToken.getAddress(),
        collateralAmount
      );
      
      await collateralContract.connect(borrower).withdrawCollateral(
        await mockToken.getAddress(),
        collateralAmount
      );
      
      const balance = await collateralContract.getCollateralBalance(
        borrower.address,
        await mockToken.getAddress()
      );
      expect(balance).to.equal(0);
    });
  });

  describe("LoanContract", function () {
    beforeEach(async function () {
      const collateralAmount = ethers.parseUnits("2000", 6);
      await mockToken.connect(borrower).approve(await collateralContract.getAddress(), collateralAmount);
      await collateralContract.connect(borrower).depositCollateral(
        await mockToken.getAddress(),
        collateralAmount
      );
    });

    it("Should create a loan request", async function () {
      const loanAmount = ethers.parseUnits("1000", 6);
      const collateralAmount = ethers.parseUnits("2000", 6);
      const interestRate = 1200; // 12%
      const duration = 30 * 24 * 60 * 60; // 30 days
      
      await loanContract.connect(borrower).requestLoan(
        loanAmount,
        await mockToken.getAddress(),
        collateralAmount,
        interestRate,
        duration
      );
      
      const loan = await loanContract.loans(0);
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
        collateralAmount,
        interestRate,
        duration
      );
      
      await mockToken.mint(await loanContract.getAddress(), loanAmount);
      
      await loanContract.connect(owner).approveLoan(0);
      
      const loan = await loanContract.loans(0);
      expect(loan.status).to.equal(1); // ACTIVE
    });
  });

  describe("PointsContract", function () {
    it("Should mint points for early repayment", async function () {
      const pointsAmount = 100;
      
      await pointsContract.connect(owner).mintPoints(borrower.address, pointsAmount);
      
      const balance = await pointsContract.balanceOf(borrower.address);
      expect(balance).to.equal(pointsAmount);
    });

    it("Should burn points for redemption", async function () {
      const pointsAmount = 100;
      const burnAmount = 50;
      
      await pointsContract.connect(owner).mintPoints(borrower.address, pointsAmount);
      
      await pointsContract.connect(owner).burnPoints(borrower.address, burnAmount);
      
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
      
      await loanContract.connect(borrower).requestLoan(
        loanAmount,
        await mockToken.getAddress(),
        collateralAmount,
        interestRate,
        duration
      );
      
      await mockToken.mint(await loanContract.getAddress(), loanAmount);
      await loanContract.connect(owner).approveLoan(0);
      
      const repaymentAmount = loanAmount + (loanAmount * interestRate / 10000);
      await mockToken.mint(borrower.address, repaymentAmount);
      await mockToken.connect(borrower).approve(await loanContract.getAddress(), repaymentAmount);
      
      await loanContract.connect(borrower).repayLoan(0);
      
      const loan = await loanContract.loans(0);
      expect(loan.status).to.equal(2); // REPAID
      
      await pointsContract.connect(owner).mintPoints(borrower.address, 50); // Early repayment bonus
      const pointsBalance = await pointsContract.balanceOf(borrower.address);
      expect(pointsBalance).to.equal(50);
    });
  });
});
