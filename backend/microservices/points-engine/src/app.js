const express = require('express');
const { Pool } = require('pg');
const { ethers } = require('ethers');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/pushfundz_db',
});

const ethProvider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL || 'https://polygon-mumbai.g.alchemy.com/v2/demo');
const ethWallet = new ethers.Wallet(process.env.PRIVATE_KEY || '0x' + '0'.repeat(64), ethProvider);

const POINTS_CONTRACT_ADDRESS = process.env.POINTS_CONTRACT_ADDRESS;
const POINTS_CONTRACT_ABI = [
  "function mintPoints(address to, uint256 amount) external",
  "function burnPoints(address from, uint256 amount) external",
  "function balanceOf(address account) external view returns (uint256)"
];

const pointsContract = POINTS_CONTRACT_ADDRESS ? 
  new ethers.Contract(POINTS_CONTRACT_ADDRESS, POINTS_CONTRACT_ABI, ethWallet) : null;

const POINTS_RULES = {
  LOAN_REPAID_ON_TIME: 10,
  EARLY_REPAYMENT: 25,
  REFERRAL_SIGNUP: 50,
  REFERRAL_FIRST_LOAN: 100,
  CONSECUTIVE_REPAYMENTS: 5, // per consecutive repayment
  LARGE_LOAN_BONUS: 20, // for loans > $1000
  LOYALTY_MONTHLY: 15 // monthly loyalty bonus
};

const TIER_THRESHOLDS = {
  BRONZE: 0,
  SILVER: 500,
  GOLD: 2000,
  PLATINUM: 5000
};

app.post('/award-points', async (req, res) => {
  try {
    const { userId, eventType, metadata = {} } = req.body;
    
    let pointsToAward = 0;
    let description = '';
    
    switch (eventType) {
      case 'LOAN_REPAID_ON_TIME':
        pointsToAward = POINTS_RULES.LOAN_REPAID_ON_TIME;
        description = 'Loan repaid on time';
        break;
      case 'EARLY_REPAYMENT':
        pointsToAward = POINTS_RULES.EARLY_REPAYMENT;
        description = `Early repayment - ${metadata.daysEarly} days early`;
        break;
      case 'REFERRAL_SIGNUP':
        pointsToAward = POINTS_RULES.REFERRAL_SIGNUP;
        description = `Referred user: ${metadata.referredUserId}`;
        break;
      case 'REFERRAL_FIRST_LOAN':
        pointsToAward = POINTS_RULES.REFERRAL_FIRST_LOAN;
        description = `Referral first loan: ${metadata.referredUserId}`;
        break;
      case 'CONSECUTIVE_REPAYMENTS':
        pointsToAward = POINTS_RULES.CONSECUTIVE_REPAYMENTS * (metadata.consecutiveCount || 1);
        description = `${metadata.consecutiveCount} consecutive repayments`;
        break;
      case 'LARGE_LOAN_BONUS':
        pointsToAward = POINTS_RULES.LARGE_LOAN_BONUS;
        description = `Large loan bonus: $${metadata.loanAmount}`;
        break;
      case 'LOYALTY_MONTHLY':
        pointsToAward = POINTS_RULES.LOYALTY_MONTHLY;
        description = 'Monthly loyalty bonus';
        break;
      default:
        return res.status(400).json({ error: 'Invalid event type' });
    }
    
    const result = await pool.query(
      `INSERT INTO points_ledger (user_id, event_type, points_delta, description, event_timestamp)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [userId, eventType, pointsToAward, description]
    );
    
    let blockchainTxHash = null;
    if (pointsContract && metadata.walletAddress) {
      try {
        const tx = await pointsContract.mintPoints(metadata.walletAddress, pointsToAward);
        blockchainTxHash = tx.hash;
        
        await pool.query(
          `UPDATE points_ledger SET blockchain_tx_hash = $1 WHERE id = $2`,
          [blockchainTxHash, result.rows[0].id]
        );
      } catch (blockchainError) {
        console.error('Blockchain minting failed:', blockchainError);
      }
    }
    
    const totalPoints = await getUserTotalPoints(userId);
    const newTier = calculateUserTier(totalPoints);
    
    res.json({
      success: true,
      pointsAwarded: pointsToAward,
      totalPoints,
      newTier,
      blockchainTxHash,
      ledgerEntry: result.rows[0]
    });
  } catch (error) {
    console.error('Points award error:', error);
    res.status(500).json({ error: 'Failed to award points' });
  }
});

app.post('/redeem-points', async (req, res) => {
  try {
    const { userId, pointsToRedeem, redeemFor, metadata = {} } = req.body;
    
    const totalPoints = await getUserTotalPoints(userId);
    
    if (totalPoints < pointsToRedeem) {
      return res.status(400).json({ error: 'Insufficient points' });
    }
    
    let description = '';
    let benefit = {};
    
    switch (redeemFor) {
      case 'FEE_WAIVER':
        description = 'Fee waiver redemption';
        benefit = { type: 'fee_waiver', amount: metadata.feeAmount };
        break;
      case 'INTEREST_DISCOUNT':
        description = `Interest rate discount: ${metadata.discountPercent}%`;
        benefit = { type: 'interest_discount', percent: metadata.discountPercent };
        break;
      case 'LOAN_LIMIT_INCREASE':
        description = `Loan limit increase: $${metadata.increaseAmount}`;
        benefit = { type: 'loan_limit_increase', amount: metadata.increaseAmount };
        break;
      default:
        return res.status(400).json({ error: 'Invalid redemption type' });
    }
    
    const result = await pool.query(
      `INSERT INTO points_ledger (user_id, event_type, points_delta, description, event_timestamp)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [userId, 'REDEMPTION', -pointsToRedeem, description]
    );
    
    let blockchainTxHash = null;
    if (pointsContract && metadata.walletAddress) {
      try {
        const tx = await pointsContract.burnPoints(metadata.walletAddress, pointsToRedeem);
        blockchainTxHash = tx.hash;
        
        await pool.query(
          `UPDATE points_ledger SET blockchain_tx_hash = $1 WHERE id = $2`,
          [blockchainTxHash, result.rows[0].id]
        );
      } catch (blockchainError) {
        console.error('Blockchain burning failed:', blockchainError);
      }
    }
    
    const remainingPoints = totalPoints - pointsToRedeem;
    const newTier = calculateUserTier(remainingPoints);
    
    res.json({
      success: true,
      pointsRedeemed: pointsToRedeem,
      remainingPoints,
      newTier,
      benefit,
      blockchainTxHash,
      ledgerEntry: result.rows[0]
    });
  } catch (error) {
    console.error('Points redemption error:', error);
    res.status(500).json({ error: 'Failed to redeem points' });
  }
});

app.get('/user/:userId/points', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const totalPoints = await getUserTotalPoints(userId);
    const tier = calculateUserTier(totalPoints);
    
    const historyResult = await pool.query(
      `SELECT * FROM points_ledger 
       WHERE user_id = $1 
       ORDER BY event_timestamp DESC 
       LIMIT 20`,
      [userId]
    );
    
    res.json({
      userId,
      totalPoints,
      tier,
      tierThresholds: TIER_THRESHOLDS,
      recentHistory: historyResult.rows
    });
  } catch (error) {
    console.error('Points fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch points' });
  }
});

app.get('/leaderboard', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const result = await pool.query(
      `SELECT 
         u.id, u.name, u.tier,
         COALESCE(SUM(pl.points_delta), 0) as total_points
       FROM users u
       LEFT JOIN points_ledger pl ON u.id = pl.user_id
       GROUP BY u.id, u.name, u.tier
       ORDER BY total_points DESC
       LIMIT $1`,
      [limit]
    );
    
    const leaderboard = result.rows.map((row, index) => ({
      rank: index + 1,
      userId: row.id,
      name: row.name,
      tier: calculateUserTier(row.total_points),
      totalPoints: parseInt(row.total_points)
    }));
    
    res.json({ leaderboard });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

async function getUserTotalPoints(userId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(points_delta), 0) as total_points 
     FROM points_ledger 
     WHERE user_id = $1`,
    [userId]
  );
  return parseInt(result.rows[0].total_points);
}

function calculateUserTier(totalPoints) {
  if (totalPoints >= TIER_THRESHOLDS.PLATINUM) return 'PLATINUM';
  if (totalPoints >= TIER_THRESHOLDS.GOLD) return 'GOLD';
  if (totalPoints >= TIER_THRESHOLDS.SILVER) return 'SILVER';
  return 'BRONZE';
}

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'points-engine',
    pointsRules: POINTS_RULES,
    tierThresholds: TIER_THRESHOLDS
  });
});

app.listen(PORT, () => {
  console.log(`Points Engine Service running on port ${PORT}`);
});

module.exports = app;
