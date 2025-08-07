import { useState, useEffect, useRef } from 'react';
import { Gift, ShoppingCart, Gamepad2, Coins, Clock, RefreshCw, PlayCircle } from 'lucide-react';

// API functions for RP system
const rpApi = {
  async getDailyReward(userId: string) {
    const response = await fetch(`http://localhost:8000/api/rp/daily-reward?user_id=${userId}`, {
      method: 'POST'
    });
    return response.json();
  },

  async getUserRP(userId: string) {
    const response = await fetch(`http://localhost:8000/api/rp/balance?user_id=${userId}`);
    return response.json();
  },

  async purchaseRP(userId: string, bundle: string) {
    const response = await fetch(`http://localhost:8000/api/rp/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, bundle })
    });
    return response.json();
  },

  async playGame(userId: string, game: string, bet: any) {
    const response = await fetch(`http://localhost:8000/api/games/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, game, bet })
    });
    return response.json();
  }
};

// RP Shop Component
const RPShop = ({ userId, onPurchase }: { userId: string, onPurchase: (amount: number) => void }) => {
  const [loading, setLoading] = useState(false);

  const bundles = [
    { id: 'starter', name: 'Starter Pack', rp: 100, price: 5, bonus: 0, popular: false },
    { id: 'popular', name: 'Popular Bundle', rp: 500, price: 20, bonus: 50, popular: true },
    { id: 'value', name: 'Value Pack', rp: 1200, price: 40, bonus: 200, popular: false },
    { id: 'premium', name: 'Premium Pack', rp: 3000, price: 90, bonus: 600, popular: false }
  ];

  const handlePurchase = async (bundleId: string) => {
    setLoading(true);
    try {
      const result = await rpApi.purchaseRP(userId, bundleId);
      onPurchase(result.rp_received);
    } catch (error) {
      console.error('Purchase failed:', error);
    }
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-md">
      <div className="flex items-center gap-3 mb-6">
        <ShoppingCart className="h-6 w-6 text-purple-600" />
        <h3 className="text-xl font-bold">RP Shop</h3>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        {bundles.map(bundle => (
          <div key={bundle.id} className={`relative border-2 rounded-xl p-4 ${bundle.popular ? 'border-purple-500 bg-purple-50' : 'border-gray-200'}`}>
            {bundle.popular && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-purple-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </span>
              </div>
            )}
            
            <div className="text-center">
              <h4 className="font-bold text-lg">{bundle.name}</h4>
              <div className="my-3">
                <span className="text-3xl font-bold text-purple-600">{bundle.rp}</span>
                <span className="text-gray-600"> RP</span>
                {bundle.bonus > 0 && (
                  <div className="text-sm text-green-600 font-medium">
                    +{bundle.bonus} Bonus RP
                  </div>
                )}
              </div>
              <div className="text-2xl font-bold mb-4">${bundle.price}</div>
              <button
                onClick={() => handlePurchase(bundle.id)}
                disabled={loading}
                className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Purchase'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const RockPaperScissors = ({ userId, userRP, onGameResult }: { userId: string, userRP: number, onGameResult: (change: number) => void }) => {
  const [bet, setBet] = useState(10);
  const [gameState, setGameState] = useState('waiting');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const choices = [
    { id: 'rock', name: 'Rock', emoji: '🪨' },
    { id: 'paper', name: 'Paper', emoji: '📄' },
    { id: 'scissors', name: 'Scissors', emoji: '✂️' }
  ];

  const playGame = async (choice: any) => {
    if (userRP < bet) {
      alert('Insufficient RP balance!');
      return;
    }

    setLoading(true);
    try {
      const result = await rpApi.playGame(userId, 'rps', { amount: bet, choice });
      setResult(result);
      setGameState('result');
      onGameResult(result.rpChange);
    } catch (error) {
      console.error('Game failed:', error);
    }
    setLoading(false);
  };

  const resetGame = () => {
    setGameState('waiting');
    setResult(null);
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-md">
      <div className="flex items-center gap-3 mb-6">
        <Gamepad2 className="h-6 w-6 text-blue-600" />
        <h3 className="text-xl font-bold">Rock Paper Scissors</h3>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Bet Amount (RP)</label>
        <input
          type="number"
          value={bet}
          onChange={(e) => setBet(Math.max(10, parseInt(e.target.value) || 10))}
          min="10"
          max={userRP}
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>

      {gameState === 'waiting' && (
        <div className="grid grid-cols-3 gap-4">
          {choices.map(choice => (
            <button
              key={choice.id}
              onClick={() => playGame(choice.id)}
              disabled={loading}
              className="flex flex-col items-center p-4 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              <span className="text-4xl mb-2">{choice.emoji}</span>
              <span className="font-medium">{choice.name}</span>
            </button>
          ))}
        </div>
      )}

      {gameState === 'result' && result && (
        <div className="text-center">
          <div className="flex justify-center items-center gap-8 mb-6">
            <div className="text-center">
              <div className="text-4xl mb-2">
                {choices.find(c => c.id === result.playerChoice)?.emoji}
              </div>
              <div className="font-medium">You</div>
            </div>
            <div className="text-2xl">VS</div>
            <div className="text-center">
              <div className="text-4xl mb-2">
                {choices.find(c => c.id === result.cpuChoice)?.emoji}
              </div>
              <div className="font-medium">CPU</div>
            </div>
          </div>

          <div className={`text-2xl font-bold mb-4 ${
            result.result === 'win' ? 'text-green-600' : 
            result.result === 'lose' ? 'text-red-600' : 'text-yellow-600'
          }`}>
            {result.result === 'win' ? '🎉 You Win!' : 
             result.result === 'lose' ? '😔 You Lose!' : '🤝 Draw!'}
          </div>

          <div className={`text-lg mb-4 ${result.rpChange > 0 ? 'text-green-600' : result.rpChange < 0 ? 'text-red-600' : 'text-gray-600'}`}>
            {result.rpChange > 0 ? `+${result.rpChange}` : result.rpChange} RP
          </div>

          <button
            onClick={resetGame}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
};

const SpinWheel = ({ userId, userRP, onGameResult }: { userId: string, userRP: number, onGameResult: (change: number) => void }) => {
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  const segments = [
    { value: 0, label: '0 RP', color: '#ef4444' },
    { value: 5, label: '5 RP', color: '#f97316' },
    { value: 10, label: '10 RP', color: '#eab308' },
    { value: 15, label: '15 RP', color: '#22c55e' },
    { value: 20, label: '20 RP', color: '#3b82f6' },
    { value: 50, label: '50 RP', color: '#8b5cf6' },
    { value: 100, label: '100 RP', color: '#ec4899' },
    { value: 0, label: '0 RP', color: '#ef4444' }
  ];

  const spinWheel = async () => {
    if (userRP < 25) {
      alert('Need 25 RP to spin!');
      return;
    }

    setSpinning(true);
    try {
      const response = await rpApi.playGame(userId, 'wheel', {});
      const winSegment = segments.find(s => s.value === response.prize);
      const segmentIndex = segments.indexOf(winSegment || segments[0]);
      
      const segmentAngle = 360 / segments.length;
      const finalRotation = 1440 + (segmentIndex * segmentAngle);
      
      if (wheelRef.current) {
        wheelRef.current.style.transform = `rotate(${finalRotation}deg)`;
      }
      
      setTimeout(() => {
        setResult(response);
        onGameResult(response.netChange);
        setSpinning(false);
      }, 3000);
    } catch (error) {
      console.error('Spin failed:', error);
      setSpinning(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-md">
      <div className="flex items-center gap-3 mb-6">
        <RefreshCw className="h-6 w-6 text-green-600" />
        <h3 className="text-xl font-bold">Spin the Wheel</h3>
      </div>

      <div className="text-center mb-6">
        <div className="relative inline-block">
          <div
            ref={wheelRef}
            className="w-48 h-48 rounded-full border-4 border-gray-300 transition-transform duration-3000 ease-out"
            style={{
              background: `conic-gradient(${segments.map((seg, i) => 
                `${seg.color} ${(i * 360) / segments.length}deg ${((i + 1) * 360) / segments.length}deg`
              ).join(', ')})`
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-4 h-4 bg-white rounded-full border-2 border-gray-800"></div>
            </div>
          </div>
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-2">
            <div className="w-0 h-0 border-l-4 border-r-4 border-b-8 border-l-transparent border-r-transparent border-b-gray-800"></div>
          </div>
        </div>
      </div>

      <div className="text-center mb-4">
        <div className="text-sm text-gray-600 mb-2">Cost: 25 RP per spin</div>
        <button
          onClick={spinWheel}
          disabled={spinning || userRP < 25}
          className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {spinning ? 'Spinning...' : 'Spin (25 RP)'}
        </button>
      </div>

      {result && !spinning && (
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="text-lg font-bold mb-2">
            You won {result.prize} RP!
          </div>
          <div className={`text-sm ${result.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            Net: {result.netChange >= 0 ? '+' : ''}{result.netChange} RP
          </div>
        </div>
      )}
    </div>
  );
};

const WhotGame = ({ userId, userRP, onGameResult }: { userId: string, userRP: number, onGameResult: (change: number) => void }) => {
  const [bet, setBet] = useState(50);
  const [gameState, setGameState] = useState('waiting');
  const [result, setResult] = useState<any>(null);
  const playWhot = async () => {
    if (userRP < bet) {
      alert('Insufficient RP balance!');
      return;
    }

    setGameState('playing');
    
    try {
      const response = await rpApi.playGame(userId, 'whot', { amount: bet });
      
      setTimeout(() => {
        setResult(response);
        setGameState('result');
        onGameResult(response.rpChange);
      }, 2000);
    } catch (error) {
      console.error('Whot game failed:', error);
      setGameState('waiting');
    }
  };

  const resetGame = () => {
    setGameState('waiting');
    setResult(null);
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-md">
      <div className="flex items-center gap-3 mb-6">
        <PlayCircle className="h-6 w-6 text-red-600" />
        <h3 className="text-xl font-bold">Whot Card Game</h3>
      </div>

      {gameState === 'waiting' && (
        <div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Bet Amount (RP)</label>
            <input
              type="number"
              value={bet}
              onChange={(e) => setBet(Math.max(50, parseInt(e.target.value) || 50))}
              min="50"
              max={userRP}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div className="text-center">
            <div className="text-sm text-gray-600 mb-4">
              Play against AI • Win 2x your bet
            </div>
            <button
              onClick={playWhot}
              disabled={userRP < bet}
              className="bg-red-600 text-white px-8 py-3 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              Play Whot ({bet} RP)
            </button>
          </div>
        </div>
      )}

      {gameState === 'playing' && (
        <div className="text-center py-8">
          <div className="animate-spin w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <div className="text-lg font-medium">Playing against AI...</div>
        </div>
      )}

      {gameState === 'result' && result && (
        <div className="text-center">
          <div className={`text-3xl font-bold mb-4 ${
            result.result === 'win' ? 'text-green-600' : 'text-red-600'
          }`}>
            {result.result === 'win' ? '🎉 You Win!' : '😔 You Lose!'}
          </div>

          <div className={`text-xl mb-6 ${result.rpChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {result.rpChange > 0 ? `+${result.rpChange}` : result.rpChange} RP
          </div>

          <button
            onClick={resetGame}
            className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700"
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
};

// Daily Rewards Component
const DailyRewards = ({ userId, onRewardClaimed }: { userId: string, onRewardClaimed: (reward: number) => void }) => {
  const [rewardData, setRewardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRewardData();
  }, [userId]);

  const fetchRewardData = async () => {
    try {
      const data = await rpApi.getUserRP(userId);
      setRewardData(data);
    } catch (error) {
      console.error('Failed to fetch reward data:', error);
    }
    setLoading(false);
  };

  const claimReward = async () => {
    try {
      const result = await rpApi.getDailyReward(userId);
      if (result.claimed) {
        onRewardClaimed(result.reward);
        fetchRewardData();
      }
    } catch (error) {
      console.error('Failed to claim reward:', error);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-md">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-md">
      <div className="flex items-center gap-3 mb-6">
        <Gift className="h-6 w-6 text-yellow-600" />
        <h3 className="text-xl font-bold">Daily Login Rewards</h3>
      </div>

      <div className="text-center">
        <div className="mb-4">
          <div className="text-3xl font-bold text-yellow-600 mb-2">
            {rewardData?.streak || 0} Day Streak
          </div>
          <div className="text-sm text-gray-600">
            Keep logging in daily to maintain your streak!
          </div>
        </div>

        {rewardData?.canClaimDaily ? (
          <button
            onClick={claimReward}
            className="bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 flex items-center gap-2 mx-auto"
          >
            <Gift className="h-5 w-5" />
            Claim Daily Reward
          </button>
        ) : (
          <div className="text-gray-500">
            <Clock className="h-8 w-8 mx-auto mb-2" />
            <div>Come back tomorrow for your next reward!</div>
          </div>
        )}
      </div>
    </div>
  );
};

// Main Gaming Hub Component
const GamingHub = ({ userId }: { userId: string }) => {
  const [userRP, setUserRP] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserRP();
  }, [userId]);

  const fetchUserRP = async () => {
    try {
      const data = await rpApi.getUserRP(userId);
      setUserRP(data.balance);
    } catch (error) {
      console.error('Failed to fetch RP balance:', error);
    }
    setLoading(false);
  };

  const handleGameResult = (rpChange: number) => {
    setUserRP(prev => prev + rpChange);
  };

  const handlePurchase = (rpAmount: number) => {
    setUserRP(prev => prev + rpAmount);
  };

  const handleRewardClaimed = (reward: number) => {
    setUserRP(prev => prev + reward);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-6"></div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-64 bg-gray-200 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gaming Hub</h1>
            <p className="text-gray-600">Earn and spend RP through exciting games</p>
          </div>
          <div className="bg-white rounded-2xl px-6 py-4 shadow-md">
            <div className="flex items-center gap-3">
              <Coins className="h-6 w-6 text-purple-600" />
              <div>
                <div className="text-sm text-gray-600">Your RP Balance</div>
                <div className="text-2xl font-bold text-purple-600">{userRP}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <DailyRewards 
            userId={userId} 
            onRewardClaimed={handleRewardClaimed}
          />
          
          <RPShop 
            userId={userId} 
            onPurchase={handlePurchase}
          />
          
          <RockPaperScissors 
            userId={userId} 
            userRP={userRP} 
            onGameResult={handleGameResult}
          />
          
          <SpinWheel 
            userId={userId} 
            userRP={userRP} 
            onGameResult={handleGameResult}
          />
          
          <WhotGame 
            userId={userId} 
            userRP={userRP} 
            onGameResult={handleGameResult}
          />
        </div>
      </div>
    </div>
  );
};

export default GamingHub;
