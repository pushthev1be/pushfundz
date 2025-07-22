// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PointsContract is ERC20, Ownable {
    mapping(address => uint256) public userTiers;
    mapping(address => uint256) public totalPointsEarned;
    mapping(address => uint256) public totalPointsRedeemed;

    event PointsAwarded(address indexed user, uint256 amount, string reason);
    event PointsRedeemed(address indexed user, uint256 amount, string purpose);
    event TierUpdated(address indexed user, uint256 newTier);

    constructor() ERC20("PushFundz Points", "PFP") {}

    function awardPoints(
        address user,
        uint256 amount,
        string memory reason
    ) external onlyOwner {
        require(user != address(0), "Invalid user address");
        require(amount > 0, "Amount must be greater than 0");

        _mint(user, amount);
        totalPointsEarned[user] += amount;

        // Update user tier based on total points earned
        updateUserTier(user);

        emit PointsAwarded(user, amount, reason);
    }

    function redeemPoints(
        address user,
        uint256 amount,
        string memory purpose
    ) external onlyOwner {
        require(user != address(0), "Invalid user address");
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(user) >= amount, "Insufficient points balance");

        _burn(user, amount);
        totalPointsRedeemed[user] += amount;

        emit PointsRedeemed(user, amount, purpose);
    }

    function updateUserTier(address user) internal {
        uint256 totalEarned = totalPointsEarned[user];
        uint256 newTier;

        if (totalEarned >= 10000) {
            newTier = 3; // Platinum
        } else if (totalEarned >= 5000) {
            newTier = 2; // Gold
        } else if (totalEarned >= 1000) {
            newTier = 1; // Silver
        } else {
            newTier = 0; // Bronze
        }

        if (userTiers[user] != newTier) {
            userTiers[user] = newTier;
            emit TierUpdated(user, newTier);
        }
    }

    function getUserTier(address user) external view returns (uint256) {
        return userTiers[user];
    }

    function getUserStats(address user) external view returns (
        uint256 currentBalance,
        uint256 totalEarned,
        uint256 totalRedeemed,
        uint256 tier
    ) {
        return (
            balanceOf(user),
            totalPointsEarned[user],
            totalPointsRedeemed[user],
            userTiers[user]
        );
    }

    // Prevent regular transfers to maintain points integrity
    function transfer(address, uint256) public pure override returns (bool) {
        revert("Points cannot be transferred");
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert("Points cannot be transferred");
    }
}
