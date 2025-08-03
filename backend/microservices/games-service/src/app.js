const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3006;

app.use(express.json());
app.use(require('cors')());

const dbPath = path.join(__dirname, '../../../../crypto-lending-backend/pushfundz.db');
const db = new sqlite3.Database(dbPath);

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
  LOW: { min: 20, max: 50, rewards: [0, 25, 35, 50], winChance: 0.08 },
  MEDIUM: { min: 51, max: 100, rewards: [0, 50, 80, 150], winChance: 0.05 },
  HIGH: { min: 101, max: 200, rewards: [0, 100, 250, 600], winChance: 0.02 }
};

const WHOT_REWARDS = {
  WIN: 300,
  LOSS: 0,
  WIN_CHANCE: 0.015 // 1.5% win rate - expert AI difficulty
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
    
    const outcome = Math.random();
    let computerChoice;
    
    if (outcome < 0.65) {
      if (choice === 'rock') computerChoice = 'paper';
      else if (choice === 'paper') computerChoice = 'scissors';
      else computerChoice = 'rock';
    } else if (outcome < 0.9) {
      computerChoice = choice;
    } else {
      if (choice === 'rock') computerChoice = 'scissors';
      else if (choice === 'paper') computerChoice = 'rock';
      else computerChoice = 'paper';
    }
    
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
    
    const gameSimulation = simulateWhotGame();
    
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
      difficulty: 'expert',
      message: isWin ? 'Incredible! You managed to outsmart the expert AI!' : `CPU wins! ${gameSimulation.strategy}`
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
    const lastClaim = await new Promise((resolve, reject) => {
      db.get(
        `SELECT event_timestamp FROM points_ledger 
         WHERE user_id = ? AND event_type = 'DAILY_DRIP' 
         AND DATE(event_timestamp) = ?`,
        [userId, today],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (lastClaim) {
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

function getUserRP(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(SUM(points_delta), 0) as total_rp 
       FROM points_ledger WHERE user_id = ?`,
      [userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(parseInt(row?.total_rp || 0));
      }
    );
  });
}

function updateUserRP(userId, rpDelta, eventType) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO points_ledger (user_id, event_type, points_delta, description, event_timestamp)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [userId, eventType, rpDelta, `${eventType}: ${rpDelta} RP`],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
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

function simulateWhotGame() {
  const strategies = [
    'AI saved Whot cards for the final move and forced you into an unfavorable shape.',
    'AI prioritized special cards and blocked your winning opportunities.',
    'AI analyzed your pattern and countered with perfect card selection.',
    'AI used advanced probability calculations to predict your moves.',
    'AI employed defensive strategy, forcing you to draw multiple cards.',
    'AI executed a perfect endgame sequence with optimal card management.',
    'AI manipulated the deck order using advanced card counting techniques.',
    'AI forced you to pick multiple penalty cards at crucial moments.',
    'AI held back powerful cards until the perfect strategic moment.',
    'AI predicted your next move and countered with surgical precision.',
    'AI used psychological warfare to force suboptimal plays.',
    'AI exploited deck probability to ensure optimal card distribution.',
    'AI calculated all possible outcomes and chose the winning path.',
    'AI used advanced game theory to dominate the match.'
  ];
  
  const cpuAdvantage = Math.random() < 0.95; // 95% chance CPU gets better cards
  
  return {
    strategy: strategies[Math.floor(Math.random() * strategies.length)],
    cpuAdvantage
  };
}

app.listen(PORT, () => {
  console.log(`Games Service running on port ${PORT}`);
});

module.exports = app;
