import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:8000' : 'https://app-brxnwmud.fly.dev');

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow p-4 flex space-x-4 sticky top-0 z-10">
          <Link className="text-blue-600 font-bold" to="/">Dashboard</Link>
          <Link className="text-blue-600 font-bold" to="/games">Games</Link>
          <Link className="text-blue-600 font-bold" to="/borrow">Borrow</Link>
          <Link className="text-blue-600 font-bold" to="/wallet">Wallet</Link>
          <Link className="text-blue-600 font-bold" to="/membership">Membership</Link>
        </nav>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/games" element={<Games />} />
          <Route path="/borrow" element={<Borrow />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/membership" element={<Membership />} />
        </Routes>
      </div>
    </Router>
  );
}

function Dashboard() {
  const [stats] = useState({ total_users: 3, total_loans: 2, active_loans: 0, total_volume_usd: 2000 });

  return (
    <div className="p-4 space-y-8">
      <h1 className="text-2xl font-bold mb-4">📊 Platform Overview</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Users" value={stats.total_users.toString()} icon="👤" />
        <StatCard label="Total Loans" value={stats.total_loans.toString()} icon="💳" />
        <StatCard label="Active Loans" value={stats.active_loans.toString()} icon="⏳" />
        <StatCard label="Total Volume" value={`$${stats.total_volume_usd.toLocaleString()}`} icon="💰" />
      </div>
    </div>
  );
}

function Games() {
  const [message, setMessage] = useState('');
  const [rpBalance, setRpBalance] = useState(0);

  const handleRps = async (choice?: string | number) => {
    if (typeof choice !== 'string') return;
    try {
      const response = await fetch(`${API_URL}/game/rps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: '123', choice })
      });
      const result = await response.json();
      setMessage(`You: ${choice}, CPU: ${result.computer_choice}. ${result.result}! ${result.rp_won > 0 ? `+${result.rp_won}` : '0'} RP`);
      setRpBalance(result.new_rp_balance);
    } catch {
      setMessage('Failed to play RPS');
    }
  };

  const handleSpin = async (stake?: string | number) => {
    const stakeAmount = typeof stake === 'number' ? stake : 50;
    try {
      const response = await fetch(`${API_URL}/game/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: '123', rp_stake: stakeAmount })
      });
      const result = await response.json();
      setMessage(`Spin (${stakeAmount} RP): ${result.result}! ${result.rp_won > 0 ? `+${result.rp_won}` : '0'} RP`);
      setRpBalance(result.new_rp_balance);
    } catch {
      setMessage('Failed to play Spin');
    }
  };

  const handleWhot = async () => {
    try {
      const response = await fetch(`${API_URL}/game/whot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: '123' })
      });
      const result = await response.json();
      setMessage(`Whot vs CPU: ${result.result}! ${result.rp_won > 0 ? `+${result.rp_won}` : '0'} RP. ${result.message}`);
      setRpBalance(result.new_rp_balance);
    } catch {
      setMessage('Failed to play Whot');
    }
  };

  const handleDaily = async () => {
    try {
      const response = await fetch(`${API_URL}/daily-drip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: '123' })
      });
      const result = await response.json();
      setMessage(`${result.message} +${result.rpAwarded} RP`);
    } catch {
      setMessage('Failed to claim daily RP');
    }
  };

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-xl font-semibold mb-4">🎮 RP Games</h2>
      {message && <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">{message}</div>}
      {rpBalance > 0 && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">RP Balance: {rpBalance}</div>}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <GameCard title="Daily RP Drip" description="Claim 20 RP daily" actionLabel="Claim Daily RP" onAction={handleDaily} />
        <GameCard title="Rock Paper Scissors" description="Cost: 15 RP | Win: 30 RP | CPU Favored (65% CPU win)" buttons={["Rock","Paper","Scissors"]} onAction={handleRps} />
        <GameCard title="Spin Wheel" description="Variable stake: 20-200 RP | Rare High Rewards (2-8% win)" inputPlaceholder="Enter RP" actionLabel="Spin" onAction={handleSpin} />
        <GameCard title="Whot" description="Cost: 100 RP | Win: 300 RP | Expert AI (1.5% win rate)" actionLabel="Play Whot" onAction={handleWhot} />
      </div>
    </div>
  );
}

function Borrow() {
  const [currentRepayments] = useState(1);
  const [targetRepayments] = useState(3);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [message, setMessage] = useState('');

  const requestLoan = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setMessage('Please enter a valid loan amount');
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/loans/request-v2?user_id=123`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: parseFloat(amount), 
          currency,
          duration_days: 30,
          collateral_crypto: 'BTC',
          collateral_amount: 0.001,
          purpose: 'Personal loan'
        })
      });
      const result = await response.json();
      if (response.ok) {
        setMessage(`Loan request submitted! ${result.first_loan_benefit ? 'First loan is interest-free!' : `Interest rate: ${result.interest_rate}%`}`);
      } else {
        setMessage(result.detail || 'Loan request failed');
      }
    } catch {
      setMessage('Failed to request loan');
    }
  };

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-xl font-semibold mb-4">💳 Borrow Section</h2>
      {message && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">{message}</div>}
      <div className="bg-white rounded-2xl p-6 shadow-md">
        <p className="mb-4 text-sm text-gray-600">Request a loan in USD or NGN. Membership required. First loan is interest-free!</p>
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <h4 className="font-semibold text-blue-800 mb-2">Tier Limits:</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Starter ($5): $25 USD / ₦40,000 NGN</li>
            <li>• Standard ($10): $100 USD / ₦160,000 NGN</li>
            <li>• Premium ($30): $500 USD / ₦800,000 NGN</li>
          </ul>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Currency</label>
          <select 
            value={currency} 
            onChange={(e) => setCurrency(e.target.value)}
            className="border p-2 rounded w-full mb-2 focus:ring-2 focus:ring-blue-400"
          >
            <option value="USD">USD ($)</option>
            <option value="NGN">NGN (₦)</option>
          </select>
        </div>
        
        <input 
          type="number"
          value={amount} 
          onChange={(e) => setAmount(e.target.value)} 
          className="border p-2 rounded w-full mb-2 focus:ring-2 focus:ring-blue-400" 
          placeholder={`Enter Amount in ${currency}`}
        />
        
        <button 
          onClick={requestLoan} 
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded w-full"
        >
          Request Loan
        </button>
      </div>
      <RepaymentProgress current={currentRepayments} target={targetRepayments} nextCap={25} />
    </div>
  );
}

function Wallet() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");

  const registerUser = async () => {
    if (!name || !email.includes('@')) {
      setError('Please enter valid name and email.');
      return;
    }
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/users/register-with-referral`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, referral_code: referralCode })
      });
      const result = await response.json();
      if (response.ok) {
        setMessage(`Registration successful! ${result.referral_bonus > 0 ? `You earned ${result.referral_bonus} RP bonus!` : ''}`);
      } else {
        setError(result.detail || 'Registration failed');
      }
    } catch {
      setError('Registration failed');
    }
  };

  const generateReferralCode = async () => {
    try {
      const response = await fetch(`${API_URL}/api/referrals/generate?user_id=123`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      if (response.ok) {
        setGeneratedCode(result.referral_code);
        setMessage(`Your referral code: ${result.referral_code}`);
      } else {
        setError('Failed to generate referral code');
      }
    } catch {
      setError('Failed to generate referral code');
    }
  };

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-xl font-semibold mb-4">🔗 Connect Wallet & Register</h2>
      <div className="bg-white rounded-2xl p-6 shadow-md space-y-4">
        <h3 className="text-lg font-semibold">Connect Wallet</h3>
        <WalletButton label="Injected" />
        <WalletButton label="MetaMask" />
        <WalletButton label="Coinbase Wallet" />
        <WalletButton label="WalletConnect" />
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-md space-y-4">
        <h3 className="text-lg font-semibold">Register for PushFundz</h3>
        {error && <div className="text-red-500 text-sm">{error}</div>}
        {message && <div className="text-green-500 text-sm">{message}</div>}
        <input 
          className="border p-3 rounded w-full mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400" 
          placeholder="Full Name" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
        />
        <input 
          className="border p-3 rounded w-full mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400" 
          placeholder="Email Address" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
        />
        <input 
          className="border p-3 rounded w-full mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400" 
          placeholder="Referral Code (Optional)" 
          value={referralCode} 
          onChange={(e) => setReferralCode(e.target.value)} 
        />
        <button 
          onClick={registerUser} 
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-3 rounded w-full transition-colors"
        >
          Register
        </button>
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-md space-y-4">
        <h3 className="text-lg font-semibold">Generate Referral Code</h3>
        <p className="text-sm text-gray-600">Share your referral code to earn 50 RP for each new user!</p>
        {generatedCode && (
          <div className="bg-gray-100 p-3 rounded border">
            <strong>Your Code: {generatedCode}</strong>
          </div>
        )}
        <button 
          onClick={generateReferralCode} 
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded w-full transition-colors"
        >
          Generate Referral Code
        </button>
      </div>
    </div>
  );
}

function Membership() {
  const [message, setMessage] = useState('');
  const [membershipStatus, setMembershipStatus] = useState<{
    has_membership: boolean;
    tier: string;
    price_paid: number;
  } | null>(null);

  const membershipTiers = [
    {
      tier: 'starter',
      price: 5,
      limits: { usd: 25, ngn: 40000 },
      features: ['Basic loan access', 'Up to $25 USD loans', 'Standard support', 'First loan interest-free']
    },
    {
      tier: 'standard', 
      price: 10,
      limits: { usd: 100, ngn: 160000 },
      features: ['Enhanced loan access', 'Up to $100 USD loans', 'Priority support', 'Lower interest rates', 'First loan interest-free']
    },
    {
      tier: 'premium',
      price: 30,
      limits: { usd: 500, ngn: 800000 },
      features: ['Premium loan access', 'Up to $500 USD loans', 'VIP support', 'Lowest interest rates', 'Exclusive features', 'First loan interest-free']
    }
  ];

  const purchaseMembership = async (tier: string) => {
    try {
      const response = await fetch(`${API_URL}/api/memberships/purchase?user_id=123`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier })
      });
      const result = await response.json();
      if (response.ok) {
        setMessage(`Successfully purchased ${tier} membership!`);
        checkMembershipStatus();
      } else {
        setMessage(result.detail || 'Purchase failed');
      }
    } catch {
      setMessage('Purchase failed');
    }
  };

  const upgradeMembership = async (tier: string) => {
    try {
      const response = await fetch(`${API_URL}/api/memberships/upgrade?user_id=123`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier })
      });
      const result = await response.json();
      if (response.ok) {
        setMessage(`Successfully upgraded to ${tier} membership! Cost: $${result.upgrade_cost}`);
        checkMembershipStatus();
      } else {
        setMessage(result.detail || 'Upgrade failed');
      }
    } catch {
      setMessage('Upgrade failed');
    }
  };

  const checkMembershipStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/memberships/123`);
      const result = await response.json();
      setMembershipStatus(result);
    } catch {
      console.error('Failed to check membership status');
    }
  };

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-xl font-semibold mb-4">💎 Membership Plans</h2>
      {message && <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">{message}</div>}
      
      {membershipStatus?.has_membership && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          Current Membership: <strong className="capitalize">{membershipStatus.tier}</strong> (Paid: ${membershipStatus.price_paid})
        </div>
      )}
      
      <button 
        onClick={checkMembershipStatus} 
        className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded mb-4"
      >
        Check Membership Status
      </button>
      
      <div className="grid gap-6 md:grid-cols-3">
        {membershipTiers.map((membership) => (
          <div key={membership.tier} className="bg-white rounded-xl p-6 shadow-md border hover:shadow-lg transition-shadow">
            <h3 className="text-xl font-bold mb-2 capitalize">{membership.tier}</h3>
            <div className="text-3xl font-bold text-blue-600 mb-4">${membership.price}</div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Loan Limits:</p>
              <p className="font-semibold">USD: ${membership.limits.usd.toLocaleString()}</p>
              <p className="font-semibold">NGN: ₦{membership.limits.ngn.toLocaleString()}</p>
            </div>
            
            <ul className="mb-6 space-y-2">
              {membership.features.map((feature, index) => (
                <li key={index} className="flex items-center text-sm">
                  <span className="text-green-500 mr-2">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
            
            <div className="space-y-2">
              <button
                onClick={() => purchaseMembership(membership.tier)}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded transition-colors"
              >
                Purchase {membership.tier}
              </button>
              {membershipStatus?.has_membership && (
                <button
                  onClick={() => upgradeMembership(membership.tier)}
                  className="w-full bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded transition-colors"
                >
                  Upgrade to {membership.tier}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RepaymentProgress({ current, target, nextCap }: { current: number; target: number; nextCap: number }) {
  const percent = Math.min((current / target) * 100, 100);
  return (
    <div className="p-4 bg-white rounded-2xl shadow-md">
      <h2 className="text-lg font-bold mb-2">Repayment Progress</h2>
      <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
        <div className="bg-green-500 h-3 rounded-full" style={{ width: `${percent}%` }}></div>
      </div>
      <p className="text-sm">{current}/{target} repayments complete. Unlock +${nextCap} borrow cap at next milestone.</p>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow text-center hover:shadow-md transition-shadow">
      <span className="text-3xl mb-2 block">{icon}</span>
      <span className="text-lg font-bold block">{value}</span>
      <span className="text-sm text-gray-500">{label}</span>
    </div>
  );
}

function GameCard({ title, description, actionLabel, onAction, buttons, inputPlaceholder }: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction: (param?: string | number) => void;
  buttons?: string[];
  inputPlaceholder?: string;
}) {
  return (
    <div className="border rounded-xl p-4 flex flex-col justify-between hover:shadow-md transition-shadow">
      <h3 className="text-lg font-bold mb-2">{title}</h3>
      <p className="text-sm text-gray-600 mb-3">{description}</p>
      {buttons ? (
        <div className="space-x-2">
          {buttons.map((b) => (
            <button 
              key={b} 
              onClick={() => onAction(b)} 
              className="bg-gray-100 hover:bg-gray-200 text-sm px-3 py-2 rounded transition-colors"
            >
              {b}
            </button>
          ))}
        </div>
      ) : (
        <>
          {inputPlaceholder && (
            <input 
              className="border p-2 rounded w-full mb-2 focus:outline-none focus:ring-2 focus:ring-blue-400" 
              placeholder={inputPlaceholder} 
            />
          )}
          {actionLabel && (
            <button 
              onClick={() => onAction()} 
              className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded w-full transition-colors"
            >
              {actionLabel}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function WalletButton({ label }: { label: string }) {
  return (
    <button className="border px-4 py-3 rounded w-full mb-2 hover:bg-gray-100 flex items-center justify-center transition-colors">
      <span className="mr-2">💼</span>{label}
    </button>
  );
}
