import React, { useState, useEffect, createContext, useContext } from 'react';
import { DollarSign, TrendingUp, Shield, Menu, X, ChevronRight, AlertCircle, CheckCircle, CreditCard } from 'lucide-react';

const API_BASE_URL = 'https://app-pnjedvrd.fly.dev';

interface User {
  id: string;
  name: string;
  email: string;
  wallet_address?: string;
  credit_score: number;
  fiat_balance: number;
  tier: number;
  created_at: string;
}

interface AuthUser {
  access_token: string;
  token_type: string;
  user: User;
  loans: Loan[];
}

interface Loan {
  id: string;
  amount_usd: number;
  status: string;
  created_at: string;
  due_date: string;
  interest_rate: number;
  duration_days: number;
  collateral_crypto: string;
  collateral_amount: number;
  purpose?: string;
}

interface Membership {
  has_membership: boolean;
  tier: string;
  tier_name?: string;
  max_loan_usd?: number;
  max_loan_ngn?: number;
  payment_date?: string;
  first_loan_used?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (userData: AuthUser) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('pushfundz_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = (userData: AuthUser) => {
    setUser(userData);
    localStorage.setItem('pushfundz_user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('pushfundz_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const formatCurrency = (amount: number, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const api = {
  async register(data: { name: string; email: string; wallet_address?: string }) {
    const response = await fetch(`${API_BASE_URL}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Registration failed');
    return response.json();
  },

  async login(data: { email?: string; wallet_address?: string }) {
    const response = await fetch(`${API_BASE_URL}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Login failed');
    return response.json();
  },

  async getUser(userId: string) {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}`);
    if (!response.ok) throw new Error('Failed to fetch user');
    return response.json();
  },

  async getMembership(userId: string): Promise<Membership> {
    const response = await fetch(`${API_BASE_URL}/api/memberships/${userId}`);
    if (!response.ok) throw new Error('Failed to fetch membership');
    return response.json();
  },

  async purchaseMembership(userId: string, data: { tier: string; payment_method: string; payment_currency: string; payment_amount: number }) {
    const response = await fetch(`${API_BASE_URL}/api/memberships/purchase?user_id=${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Membership purchase failed');
    return response.json();
  },

  async requestLoan(userId: string, data: { amount_usd: number; duration_days: number; collateral_crypto: string; collateral_amount: string; purpose: string }) {
    const response = await fetch(`${API_BASE_URL}/api/loans/request?user_id=${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Loan request failed');
    return response.json();
  },

  async getUserLoans(userId: string) {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}/loans`);
    if (!response.ok) throw new Error('Failed to fetch loans');
    return response.json();
  },

  async getStats() {
    const response = await fetch(`${API_BASE_URL}/api/stats`);
    if (!response.ok) throw new Error('Failed to fetch stats');
    return response.json();
  }
};

const Navbar = () => {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="bg-gray-900 text-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
                PushFundz
              </h1>
            </div>
            <div className="hidden md:block ml-10">
              <div className="flex items-baseline space-x-4">
                <a href="#dashboard" className="hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium">
                  Dashboard
                </a>
                <a href="#loans" className="hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium">
                  Loans
                </a>
                <a href="#membership" className="hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium">
                  Membership
                </a>
              </div>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="flex items-center space-x-4">
              {user ? (
                <>
                  <span className="text-sm">Credit Score: {user.user.credit_score}</span>
                  <button
                    onClick={logout}
                    className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-md text-sm font-medium"
                  >
                    Logout
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <div className="md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md hover:bg-gray-700"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>
      {mobileMenuOpen && (
        <div className="md:hidden bg-gray-800">
          <div className="px-2 pt-2 pb-3 space-y-1">
            <a href="#dashboard" className="block hover:bg-gray-700 px-3 py-2 rounded-md text-base font-medium">
              Dashboard
            </a>
            <a href="#loans" className="block hover:bg-gray-700 px-3 py-2 rounded-md text-base font-medium">
              Loans
            </a>
            <a href="#membership" className="block hover:bg-gray-700 px-3 py-2 rounded-md text-base font-medium">
              Membership
            </a>
            {user && (
              <button
                onClick={logout}
                className="w-full text-left bg-red-600 hover:bg-red-700 px-3 py-2 rounded-md text-base font-medium"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [membershipData, loansData] = await Promise.all([
          api.getMembership(user!.user.id),
          api.getUserLoans(user!.user.id)
        ]);
        setMembership(membershipData);
        setLoans(loansData.loans || loansData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user) fetchData();
  }, [user]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const activeLoans = loans.filter(loan => loan.status === 'active' || loan.status === 'approved');
  const totalBorrowed = loans.reduce((sum, loan) => sum + loan.amount_usd, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Credit Score</p>
              <p className="text-2xl font-bold">{user!.user.credit_score}</p>
            </div>
            <Shield className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Membership</p>
              <p className="text-2xl font-bold capitalize">
                {membership?.tier || 'None'}
              </p>
            </div>
            <CreditCard className="h-8 w-8 text-purple-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Loans</p>
              <p className="text-2xl font-bold">{activeLoans.length}</p>
            </div>
            <DollarSign className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Borrowed</p>
              <p className="text-2xl font-bold">{formatCurrency(totalBorrowed)}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-red-600" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">Recent Loans</h2>
        {loans.length > 0 ? (
          <div className="space-y-4">
            {loans.slice(0, 5).map((loan) => (
              <div key={loan.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{formatCurrency(loan.amount_usd)}</p>
                  <p className="text-sm text-gray-600">Due: {formatDate(loan.due_date)}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    loan.status === 'active' ? 'bg-green-100 text-green-800' :
                    loan.status === 'repaid' ? 'bg-blue-100 text-blue-800' :
                    loan.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {loan.status}
                  </span>
                  {loan.interest_rate === 0 && (
                    <span className="text-green-600 text-sm font-medium">Interest-Free!</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600">No loans yet. Start by purchasing a membership!</p>
        )}
      </div>
    </div>
  );
};

const MembershipSection = () => {
  const { user } = useAuth();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);

  useEffect(() => {
    const fetchMembership = async () => {
      try {
        const data = await api.getMembership(user!.user.id);
        setMembership(data);
      } catch (error) {
        console.error('Error fetching membership:', error);
      }
    };

    if (user) fetchMembership();
  }, [user]);

  const tiers = [
    {
      name: 'Starter',
      price_usd: 5,
      price_ngn: 7500,
      max_loan_usd: 5,
      max_loan_ngn: 7500,
      color: 'blue',
      features: [
        'Max loan: $5 / ₦7,500',
        'First loan interest-free',
        'Basic support',
        'Referral bonuses'
      ]
    },
    {
      name: 'Standard',
      price_usd: 10,
      price_ngn: 15000,
      max_loan_usd: 15,
      max_loan_ngn: 22500,
      color: 'purple',
      popular: true,
      features: [
        'Max loan: $15 / ₦22,500',
        'First loan interest-free',
        'Priority support',
        'Higher referral bonuses'
      ]
    },
    {
      name: 'Premium',
      price_usd: 30,
      price_ngn: 45000,
      max_loan_usd: 40,
      max_loan_ngn: 60000,
      color: 'green',
      features: [
        'Max loan: $40 / ₦60,000',
        'First loan interest-free',
        'VIP support',
        'Maximum referral bonuses'
      ]
    }
  ];

  const handlePurchase = async (tierName: string) => {
    setPurchaseLoading(true);
    try {
      const tier = tiers.find(t => t.name === tierName);
      if (!tier) return;
      
      await api.purchaseMembership(user!.user.id, {
        tier: tierName.toLowerCase(),
        payment_method: 'crypto',
        payment_currency: 'USD',
        payment_amount: tier.price_usd
      });
      
      const updatedMembership = await api.getMembership(user!.user.id);
      setMembership(updatedMembership);
      alert('Membership purchased successfully!');
    } catch {
      alert('Failed to purchase membership. Please try again.');
    }finally {
      setPurchaseLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900">Choose Your Membership</h2>
        <p className="mt-2 text-lg text-gray-600">
          Unlock instant access to microloans with a one-time membership fee
        </p>
      </div>

      {membership?.has_membership && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-2" />
          <p className="text-green-800">
            You have an active <strong>{membership.tier_name}</strong> membership
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`relative bg-white rounded-lg shadow-lg overflow-hidden ${
              tier.popular ? 'ring-2 ring-purple-600' : ''
            }`}
          >
            {tier.popular && (
              <div className="absolute top-0 right-0 bg-purple-600 text-white px-3 py-1 text-sm font-medium">
                Most Popular
              </div>
            )}
            
            <div className="p-6">
              <h3 className="text-2xl font-bold text-gray-900">{tier.name}</h3>
              <div className="mt-4">
                <span className="text-4xl font-bold">${tier.price_usd}</span>
                <span className="text-gray-600"> / ₦{tier.price_ngn.toLocaleString()}</span>
              </div>
              
              <ul className="mt-6 space-y-3">
                {tier.features.map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>
              
              <button
                onClick={() => handlePurchase(tier.name)}
                disabled={purchaseLoading || (membership?.has_membership && membership.tier === tier.name.toLowerCase())}
                className={`mt-8 w-full py-3 px-4 rounded-md font-medium transition-colors ${
                  membership?.has_membership && membership.tier === tier.name.toLowerCase()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : `bg-${tier.color}-600 text-white hover:bg-${tier.color}-700`
                }`}
              >
                {membership?.has_membership && membership.tier === tier.name.toLowerCase()
                  ? 'Current Plan'
                  : purchaseLoading
                  ? 'Processing...'
                  : 'Get Started'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const LoanSection = () => {
  const { user } = useAuth();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [loanData, setLoanData] = useState({
    amount_usd: '',
    duration_days: 7,
    collateral_crypto: 'ETH',
    collateral_amount: '',
    purpose: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchMembership = async () => {
      try {
        const data = await api.getMembership(user!.user.id);
        setMembership(data);
      } catch (error) {
        console.error('Error fetching membership:', error);
      }
    };

    if (user) fetchMembership();
  }, [user]);

  const handleLoanRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const data = await api.requestLoan(user!.user.id, {
        ...loanData,
        amount_usd: parseFloat(loanData.amount_usd)
      });
      alert(`Loan requested successfully! Loan ID: ${data.loan_id}`);
      setShowLoanForm(false);
      setLoanData({
        amount_usd: '',
        duration_days: 7,
        collateral_crypto: 'ETH',
        collateral_amount: '',
        purpose: ''
      });
    } catch {
      alert('Failed to request loan. Please check your membership status.');
    }finally {
      setLoading(false);
    }
  };

  if (!membership?.has_membership) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
        <AlertCircle className="h-12 w-12 text-yellow-600 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-gray-900 mb-2">Membership Required</h3>
        <p className="text-gray-700 mb-4">
          You need an active membership to request loans. 
        </p>
        <a
          href="#membership"
          className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
        >
          Get Membership <ChevronRight className="ml-2 h-4 w-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Request a Loan</h2>
          <button
            onClick={() => setShowLoanForm(!showLoanForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {showLoanForm ? 'Cancel' : 'New Loan Request'}
          </button>
        </div>

        {showLoanForm && (
          <form onSubmit={handleLoanRequest} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Loan Amount (USD)
              </label>
              <input
                type="number"
                value={loanData.amount_usd}
                onChange={(e) => setLoanData({...loanData, amount_usd: e.target.value})}
                max={membership?.max_loan_usd}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={`Max: $${membership?.max_loan_usd}`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (Days)
              </label>
              <select
                value={loanData.duration_days}
                onChange={(e) => setLoanData({...loanData, duration_days: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={7}>7 Days</option>
                <option value={14}>14 Days</option>
                <option value={30}>30 Days</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Collateral Crypto
              </label>
              <select
                value={loanData.collateral_crypto}
                onChange={(e) => setLoanData({...loanData, collateral_crypto: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ETH">ETH</option>
                <option value="BTC">BTC</option>
                <option value="USDT">USDT</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Collateral Amount
              </label>
              <input
                type="number"
                step="0.0001"
                value={loanData.collateral_amount}
                onChange={(e) => setLoanData({...loanData, collateral_amount: e.target.value})}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Purpose
              </label>
              <textarea
                value={loanData.purpose}
                onChange={(e) => setLoanData({...loanData, purpose: e.target.value})}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Describe the purpose of this loan..."
              />
            </div>

            {!membership?.first_loan_used && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 text-sm">
                  <CheckCircle className="inline h-4 w-4 mr-1" />
                  This is your first loan - it will be <strong>interest-free!</strong>
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Processing...' : 'Submit Loan Request'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

const LoginPage = () => {
  const { login } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    wallet_address: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const data = await api.login({ email: formData.email });
        login(data);
      } else {
        await api.register({
          name: formData.name,
          email: formData.email,
          wallet_address: formData.wallet_address || undefined
        });
        const loginData = await api.login({ email: formData.email });
        login(loginData);
      }
    } catch {
      alert(isLogin ? 'Login failed. Please try again.' : 'Registration failed. Please try again.');
    }finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            PushFundz
          </h1>
          <p className="mt-2 text-gray-600">
            Instant crypto microloans for everyone
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required={!isLogin}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Wallet Address (Optional)
              </label>
              <input
                type="text"
                value={formData.wallet_address}
                onChange={(e) => setFormData({...formData, wallet_address: e.target.value})}
                placeholder="0x..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-md hover:from-blue-700 hover:to-purple-700 disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isLogin ? 'Login' : 'Create Account')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              {isLogin ? 'Sign up' : 'Login'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const { user, loading } = useAuth();
  const [activeSection, setActiveSection] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeSection === 'dashboard' && <Dashboard />}
        {activeSection === 'membership' && <MembershipSection />}
        {activeSection === 'loans' && <LoanSection />}
      </main>

      <div className="fixed bottom-4 right-4 space-y-2">
        <button
          onClick={() => setActiveSection('dashboard')}
          className={`p-3 rounded-full shadow-lg ${
            activeSection === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'
          }`}
        >
          <TrendingUp size={20} />
        </button>
        <button
          onClick={() => setActiveSection('membership')}
          className={`p-3 rounded-full shadow-lg ${
            activeSection === 'membership' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'
          }`}
        >
          <CreditCard size={20} />
        </button>
        <button
          onClick={() => setActiveSection('loans')}
          className={`p-3 rounded-full shadow-lg ${
            activeSection === 'loans' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'
          }`}
        >
          <DollarSign size={20} />
        </button>
      </div>
    </div>
  );
};

export default function PushFundzApp() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
