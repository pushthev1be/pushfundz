const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3006;

app.use(express.json());
app.use(require('cors')());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/pushfundz_db',
});

const GAME_COSTS = {
  ROCK_PAPER_SCISSORS: 15,
  SPIN_WHEEL_MIN: 20,
  SPIN_WHEEL_MAX: 200,
  WHOT: 100
};

const RPS_REWARDS = {
  WIN: 30,
  DRAW: 15,
  LOSS: 0
};

const SPIN_TIERS = {
  LOW: { min: 20, max: 50, rewards: [0, 25, 35, 50], winChance: 0.6 },
  MEDIUM: { min: 51, max: 100, rewards: [0, 50, 80, 150], winChance: 0.65 },
  HIGH: { min: 101, max: 200, rewards: [0, 100, 250, 600], winChance: 0.7 }
};

const WHOT_REWARDS = {
  WIN: 300,
  LOSS: 0,
  WIN_CHANCE: 0.12 // 12% win rate - very difficult
};

app.post('/game/rps', async (req, res) => {
  try {
    const { user_id, choice } = req.body;
    
    const userRP = await getUserRP(user_id);
    if (userRP < GAME_COSTS.ROCK_PAPER_SCISSORS) {
      return res.status(400).json({ error: 'Insufficient RP to play' });
    }
    
    await updateUserRP(user_id, -GAME_COSTS.ROCK_PAPER_SCISSORS, 'RPS_GAME_COST');
    
    const choices = ['rock', 'paper', 'scissors'];
    const computerChoice = choices[Math.floor(Math.random() * 3)];
    
    let result, rp_won = 0;
    if (choice === computerChoice) {
      result = 'draw';
      rp_won = RPS_REWARDS.DRAW;
    } else if (
      (choice === 'rock' && computerChoice === 'scissors') ||
      (choice === 'paper' && computerChoice === 'rock') ||
      (choice === 'scissors' && computerChoice === 'paper')
    ) {
      result = 'win';
      rp_won = RPS_REWARDS.WIN;
    } else {
      result = 'loss';
      rp_won = RPS_REWARDS.LOSS;
    }
    
    if (rp_won > 0) {
      await updateUserRP(user_id, rp_won, `RPS_${result.toUpperCase()}`);
    }
    
    const newBalance = await getUserRP(user_id);
    
    res.json({
      result,
      rp_spent: GAME_COSTS.ROCK_PAPER_SCISSORS,
      rp_won,
      new_rp_balance: newBalance,
      computer_choice: computerChoice,
      player_choice: choice
    });
  } catch (error) {
    console.error('RPS game error:', error);
    res.status(500).json({ error: 'Game failed' });
  }
});

app.post('/game/spin', async (req, res) => {
  try {
    const { user_id, rp_stake } = req.body;
    
    if (rp_stake < GAME_COSTS.SPIN_WHEEL_MIN || rp_stake > GAME_COSTS.SPIN_WHEEL_MAX) {
      return res.status(400).json({ 
        error: `Stake must be between ${GAME_COSTS.SPIN_WHEEL_MIN} and ${GAME_COSTS.SPIN_WHEEL_MAX} RP` 
      });
    }
    
    const userRP = await getUserRP(user_id);
    if (userRP < rp_stake) {
      return res.status(400).json({ error: 'Insufficient RP to play' });
    }
    
    let tier;
    if (rp_stake <= SPIN_TIERS.LOW.max) {
      tier = SPIN_TIERS.LOW;
    } else if (rp_stake <= SPIN_TIERS.MEDIUM.max) {
      tier = SPIN_TIERS.MEDIUM;
    } else {
      tier = SPIN_TIERS.HIGH;
    }
    
    await updateUserRP(user_id, -rp_stake, 'SPIN_GAME_COST');
    
    const isWin = Math.random() < tier.winChance;
    let rp_won = 0;
    
    if (isWin) {
      const rewardIndex = Math.floor(Math.random() * tier.rewards.length);
      rp_won = tier.rewards[rewardIndex];
      
      if (rp_won > 0) {
        await updateUserRP(user_id, rp_won, 'SPIN_WIN');
      }
    }
    
    const newBalance = await getUserRP(user_id);
    
    res.json({
      result: isWin ? 'win' : 'lose',
      rp_spent: rp_stake,
      rp_won,
      new_rp_balance: newBalance,
      tier: tier === SPIN_TIERS.LOW ? 'low' : tier === SPIN_TIERS.MEDIUM ? 'medium' : 'high'
    });
  } catch (error) {
    console.error('Spin game error:', error);
    res.status(500).json({ error: 'Game failed' });
  }
});

app.post('/game/whot', async (req, res) => {
  try {
    const { user_id, difficulty = 'hard' } = req.body;
    
    const userRP = await getUserRP(user_id);
    if (userRP < GAME_COSTS.WHOT) {
      return res.status(400).json({ error: 'Insufficient RP to play Whot' });
    }
    
    await updateUserRP(user_id, -GAME_COSTS.WHOT, 'WHOT_GAME_COST');
    
    const isWin = Math.random() < WHOT_REWARDS.WIN_CHANCE;
    let rp_won = 0;
    
    if (isWin) {
      rp_won = WHOT_REWARDS.WIN;
      await updateUserRP(user_id, rp_won, 'WHOT_WIN');
    }
    
    const newBalance = await getUserRP(user_id);
    
    res.json({
      result: isWin ? 'win' : 'lose',
      rp_spent: GAME_COSTS.WHOT,
      rp_won,
      new_rp_balance: newBalance,
      difficulty: 'hard',
      message: isWin ? 'Congratulations! You beat the CPU!' : 'CPU won this round. Try again!'
    });
  } catch (error) {
    console.error('Whot game error:', error);
    res.status(500).json({ error: 'Game failed' });
  }
});

app.post('/daily-drip', async (req, res) => {
  try {
    const { userId } = req.body;
    
    const today = new Date().toISOString().split('T')[0];
    const lastClaim = await pool.query(
      `SELECT event_timestamp FROM points_ledger 
       WHERE user_id = $1 AND event_type = 'DAILY_DRIP' 
       AND DATE(event_timestamp) = $2`,
      [userId, today]
    );
    
    if (lastClaim.rows.length > 0) {
      return res.status(400).json({ error: 'Daily RP already claimed today' });
    }
    
    const dailyRP = 20;
    await updateUserRP(userId, dailyRP, 'DAILY_DRIP');
    
    res.json({
      rpAwarded: dailyRP,
      newBalance: await getUserRP(userId),
      message: 'Daily RP claimed successfully!'
    });
  } catch (error) {
    console.error('Daily drip error:', error);
    res.status(500).json({ error: 'Failed to claim daily RP' });
  }
});

async function getUserRP(userId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(points_delta), 0) as total_rp 
     FROM points_ledger WHERE user_id = $1`,
    [userId]
  );
  return parseInt(result.rows[0].total_rp);
}

async function updateUserRP(userId, rpDelta, eventType) {
  await pool.query(
    `INSERT INTO points_ledger (user_id, event_type, points_delta, description, event_timestamp)
     VALUES ($1, $2, $3, $4, NOW())`,
    [userId, eventType, rpDelta, `${eventType}: ${rpDelta} RP`]
  );
}

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'games-service',
    gameCosts: GAME_COSTS,
    rpsRewards: RPS_REWARDS,
    spinTiers: SPIN_TIERS,
    whotRewards: WHOT_REWARDS
  });
});

app.listen(PORT, () => {
  console.log(`Games Service running on port ${PORT}`);
});

module.exports = app;
