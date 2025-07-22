const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying PushFundz smart contracts...");

  const CollateralContract = await ethers.getContractFactory("CollateralContract");
  const collateralContract = await CollateralContract.deploy();
  await collateralContract.deployed();
  console.log("CollateralContract deployed to:", collateralContract.address);

  const LoanContract = await ethers.getContractFactory("LoanContract");
  const loanContract = await LoanContract.deploy(collateralContract.address);
  await loanContract.deployed();
  console.log("LoanContract deployed to:", loanContract.address);

  const PointsContract = await ethers.getContractFactory("PointsContract");
  const pointsContract = await PointsContract.deploy();
  await pointsContract.deployed();
  console.log("PointsContract deployed to:", pointsContract.address);

  console.log("\nDeployment completed!");
  console.log("Contract addresses:");
  console.log("- CollateralContract:", collateralContract.address);
  console.log("- LoanContract:", loanContract.address);
  console.log("- PointsContract:", pointsContract.address);

  const deploymentInfo = {
    network: hre.network.name,
    timestamp: new Date().toISOString(),
    contracts: {
      CollateralContract: collateralContract.address,
      LoanContract: loanContract.address,
      PointsContract: pointsContract.address
    }
  };

  const fs = require("fs");
  fs.writeFileSync(
    `deployments/${hre.network.name}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
