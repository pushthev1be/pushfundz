import { useState, useEffect } from 'react'
import { WagmiProvider, useAccount, useConnect } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from './config/web3'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Wallet } from 'lucide-react'
import { WalletConnect } from './components/WalletConnect'
import { PointsDisplay } from './components/PointsDisplay'
import { AdminDashboard } from './components/AdminDashboard'
import { useIsMobile } from './hooks/use-mobile'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const queryClient = new QueryClient()

interface User {
  id: string
  name: string
  email: string
  wallet_address: string
  credit_score: number
  total_loans: number
  successful_repayments: number
  fiat_balance: number
}

interface Loan {
  id: string
  user_id: string
  amount_usd: number
  duration_days: number
  interest_rate: number
  collateral_requirement_percent: number
  collateral_crypto: string
  collateral_amount: number
  purpose: string
  status: string
  created_at: string
  due_date: string
  repaid_at?: string
}

interface PlatformStats {
  total_users: number
  total_loans: number
  active_loans: number
  total_volume_usd: number
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow flex flex-col items-center">
      <span className="text-3xl mb-2">{icon}</span>
      <span className="text-lg font-bold">{value}</span>
      <span className="text-sm text-gray-500">{label}</span>
    </div>
  );
}

function GameCard({ title, description, icon, actionLabel, onAction, buttons, inputPlaceholder, inputValue, onInputChange, inputProps }: {
  title: string;
  description: string;
  icon: string;
  actionLabel?: string;
  onAction: (choice?: string) => void;
  buttons?: string[];
  inputPlaceholder?: string;
  inputValue?: number;
  onInputChange?: (value: string) => void;
  inputProps?: any;
}) {
  const isMobile = useIsMobile();
  
  return (
    <div className="border rounded-xl p-4 flex flex-col justify-between">
      <div className="text-2xl mb-2">{icon}</div>
      <h3 className="text-lg font-bold mb-2">{title}</h3>
      <p className="text-sm text-gray-600 mb-3">{description}</p>
      {buttons ? (
        <div className={`${isMobile ? 'flex flex-col space-y-2' : 'space-x-2'}`}>
          {buttons.map((b) => (
            <button key={b} onClick={() => onAction(b)} className="bg-gray-100 hover:bg-gray-200 text-sm px-3 py-2 rounded w-full">
              {b}
            </button>
          ))}
        </div>
      ) : (
        <>
          {inputPlaceholder && (
            <Input 
              className={`border p-2 rounded w-full mb-2 ${isMobile ? 'py-3 text-lg' : ''}`} 
              placeholder={inputPlaceholder}
              value={inputValue}
              onChange={(e) => onInputChange?.(e.target.value)}
              {...inputProps}
            />
          )}
          {actionLabel && (
            <Button onClick={() => onAction()} className={`bg-blue-500 text-white px-3 py-2 rounded w-full ${isMobile ? 'py-3 text-lg' : ''}`}>
              {actionLabel}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function WalletButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="border px-4 py-2 rounded w-full mb-2 hover:bg-gray-100 flex items-center justify-center">
      <span className="mr-2">💼</span> {label}
    </button>
  );
}

function AppContent() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const isMobile = useIsMobile()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null)
  const [userLoans, setUserLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [regForm, setRegForm] = useState({
    name: '',
    email: '',
    wallet_address: ''
  })

  const [loanForm, setLoanForm] = useState({
    amount_usd: '',
    duration_days: '30',
    collateral_crypto: 'BTC',
    collateral_amount: '',
    purpose: ''
  })
  const [fundAmount, setFundAmount] = useState('')
  const [gameResult, setGameResult] = useState<string | null>(null)

  const [paymentForm, setPaymentForm] = useState({
    loan_id: '',
    payment_method: 'bank_transfer',
    local_currency: 'USD',
    amount_local: ''
  })

  useEffect(() => {
    fetchPlatformStats()
  }, [])

  const fetchPlatformStats = async () => {
    try {
      const response = await fetch(`${API_URL}/api/stats`)
      const data = await response.json()
      setPlatformStats(data)
    } catch (err) {
      console.error('Failed to fetch platform stats:', err)
    }
  }

  const registerUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`${API_URL}/api/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regForm)
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.detail || 'Registration failed')
      }

      setSuccess('Registration successful! Your starting credit score is 600.')
      
      const userResponse = await fetch(`${API_URL}/api/users/${data.user_id}`)
      const userData = await userResponse.json()
      setCurrentUser(userData.user)
      setUserLoans(userData.loans)
      
      setRegForm({ name: '', email: '', wallet_address: '' })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const requestLoan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser) return

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`${API_URL}/api/loans/request?user_id=${currentUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...loanForm,
          amount_usd: parseFloat(loanForm.amount_usd),
          duration_days: parseInt(loanForm.duration_days),
          collateral_amount: parseFloat(loanForm.collateral_amount)
        })
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.detail || 'Loan request failed')
      }

      setSuccess(`Loan request submitted! Interest rate: ${data.interest_rate}%, Collateral: ${data.collateral_requirement}`)
      
      const userResponse = await fetch(`${API_URL}/api/users/${currentUser.id}`)
      const userData = await userResponse.json()
      setUserLoans(userData.loans)
      
      setLoanForm({
        amount_usd: '',
        duration_days: '30',
        collateral_crypto: 'BTC',
        collateral_amount: '',
        purpose: ''
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const processPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`${API_URL}/api/payments/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...paymentForm,
          amount_local: parseFloat(paymentForm.amount_local)
        })
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.detail || 'Payment processing failed')
      }

      setSuccess('Payment processed successfully! Your loan is now active.')
      
      if (currentUser) {
        const userResponse = await fetch(`${API_URL}/api/users/${currentUser.id}`)
        const userData = await userResponse.json()
        setUserLoans(userData.loans)
      }
      
      setPaymentForm({
        loan_id: '',
        payment_method: 'bank_transfer',
        local_currency: 'USD',
        amount_local: ''
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const repayLoan = async (loanId: string) => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`${API_URL}/api/loans/${loanId}/repay`, {
        method: 'POST'
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.detail || 'Loan repayment failed')
      }

      setSuccess(`Loan repaid successfully! New credit score: ${data.new_credit_score}`)
      
      if (currentUser) {
        const userResponse = await fetch(`${API_URL}/api/users/${currentUser.id}`)
        const userData = await userResponse.json()
        setCurrentUser(userData.user)
        setUserLoans(userData.loans)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'approved': return 'bg-blue-100 text-blue-800'
      case 'active': return 'bg-green-100 text-green-800'
      case 'repaid': return 'bg-gray-100 text-gray-800'
      case 'defaulted': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getCreditScoreColor = (score: number) => {
    if (score >= 800) return 'text-green-600'
    if (score >= 600) return 'text-yellow-600'
    return 'text-red-600'
  }

  const fundWallet = async () => {
    if (!currentUser || !fundAmount) return
    
    try {
      const response = await fetch(`${API_URL}/api/users/${currentUser.id}/fund-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(fundAmount),
          currency: 'USD'
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        setSuccess(`Wallet funded! ${result.auto_deducted > 0 ? `$${result.auto_deducted} auto-deducted for loans. ` : ''}New balance: $${result.new_balance}`)
        setFundAmount('')
        const userResponse = await fetch(`${API_URL}/api/users/${currentUser.id}`)
        if (userResponse.ok) {
          const userData = await userResponse.json()
          setCurrentUser(userData.user)
        }
      }
    } catch (error) {
      setError('Failed to fund wallet')
    }
  }

  const claimDailyRP = async () => {
    if (!currentUser) return
    
    try {
      const response = await fetch(`${API_URL}/api/games/daily-drip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      })
      
      if (response.ok) {
        const result = await response.json()
        setSuccess(`${result.message} +${result.rpAwarded} RP`)
      } else {
        const error = await response.json()
        setError(error.error)
      }
    } catch (error) {
      setError('Failed to claim daily RP')
    }
  }

  const [spinStake, setSpinStake] = useState(50)

  const playRPS = async (choice: string) => {
    if (!currentUser) return
    
    try {
      const response = await fetch(`${API_URL}/api/games/rps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, choice })
      })
      
      if (response.ok) {
        const result = await response.json()
        setGameResult(`You: ${result.player_choice}, CPU: ${result.computer_choice}. ${result.result}! ${result.rp_won > 0 ? `+${result.rp_won}` : '0'} RP. Balance: ${result.new_rp_balance}`)
      } else {
        const error = await response.json()
        setError(error.error)
      }
    } catch (error) {
      setError('Failed to play RPS')
    }
  }

  const playSpin = async (stake = 50) => {
    if (!currentUser) return
    
    try {
      const response = await fetch(`${API_URL}/api/games/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, rp_stake: stake })
      })
      
      if (response.ok) {
        const result = await response.json()
        setGameResult(`Spin (${stake} RP): ${result.result}! ${result.rp_won > 0 ? `+${result.rp_won}` : '0'} RP. Balance: ${result.new_rp_balance}`)
      } else {
        const error = await response.json()
        setError(error.error)
      }
    } catch (error) {
      setError('Failed to play spin')
    }
  }

  const playWhot = async () => {
    if (!currentUser) return
    
    try {
      const response = await fetch(`${API_URL}/api/games/whot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id })
      })
      
      if (response.ok) {
        const result = await response.json()
        setGameResult(`Whot vs CPU: ${result.result}! ${result.rp_won > 0 ? `+${result.rp_won}` : '0'} RP. Balance: ${result.new_rp_balance}. ${result.message}`)
      } else {
        const error = await response.json()
        setError(error.error)
      }
    } catch (error) {
      setError('Failed to play Whot')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-2">
              <Wallet className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">PushFundz</h1>
              <span className="text-sm text-gray-500">Crypto Lending Platform</span>
            </div>
            {currentUser && (
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{currentUser.name}</p>
                  <p className={`text-sm font-semibold ${getCreditScoreColor(currentUser.credit_score)}`}>
                    Credit Score: {currentUser.credit_score}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto py-8 ${isMobile ? 'px-4' : 'px-4 sm:px-6 lg:px-8'}`}>
        {/* Stats Overview */}
        {platformStats && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-8">
            <StatCard label="Total Users" value={platformStats.total_users.toString()} icon="👤" />
            <StatCard label="Total Loans" value={platformStats.total_loans.toString()} icon="💳" />
            <StatCard label="Active Loans" value={platformStats.active_loans.toString()} icon="⏳" />
            <StatCard label="Total Volume" value={`$${platformStats.total_volume_usd.toLocaleString()}`} icon="💰" />
          </div>
        )}

        {/* Alerts */}
        {error && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {gameResult && (
          <Alert className="mb-6 border-blue-200 bg-blue-50">
            <AlertDescription className="text-blue-800">{gameResult}</AlertDescription>
          </Alert>
        )}

        {/* Wallet Balance Display */}
        {currentUser && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Wallet Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className={`text-3xl font-bold ${currentUser.fiat_balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ${currentUser.fiat_balance.toFixed(2)}
                </div>
                {currentUser.fiat_balance < 0 && (
                  <p className="text-sm text-red-600 mt-2">
                    Outstanding loan amount. Fund your wallet to clear this balance.
                  </p>
                )}
              </div>
              
              <div className="mt-4 space-y-2">
                <Input
                  type="number"
                  placeholder="Amount to fund"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  className={isMobile ? 'py-3 text-lg' : ''}
                />
                <Button onClick={fundWallet} className={`w-full ${isMobile ? 'py-4 text-lg' : ''}`}>
                  Fund Wallet
                </Button>
              </div>
            </CardContent>
          </Card>
        )}


        {!currentUser ? (
          /* Registration Form */
          <div className="grid md:grid-cols-2 gap-4">
            <section className="bg-white rounded-2xl p-4 shadow-md">
              <h2 className="text-lg font-semibold mb-4">🔗 Connect Wallet</h2>
              {!isConnected ? (
                <div className="space-y-2">
                  <WalletButton label="Injected" onClick={() => {
                    const connector = connectors.find(c => c.name === 'Injected');
                    if (connector) connect({ connector });
                  }} />
                  <WalletButton label="MetaMask" onClick={() => {
                    const connector = connectors.find(c => c.name === 'MetaMask');
                    if (connector) connect({ connector });
                  }} />
                  <WalletButton label="Coinbase Wallet" onClick={() => {
                    const connector = connectors.find(c => c.name === 'Coinbase Wallet');
                    if (connector) connect({ connector });
                  }} />
                  <WalletButton label="WalletConnect" onClick={() => {
                    const connector = connectors.find(c => c.name === 'WalletConnect');
                    if (connector) connect({ connector });
                  }} />
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-green-600 mb-2">✓ Wallet Connected</p>
                  <p className="text-xs text-gray-600">{address}</p>
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl p-4 shadow-md">
              <h2 className="text-lg font-semibold mb-4">📝 Register for PushFundz</h2>
              <p className="text-sm mb-4">Create your account to start accessing crypto loans with competitive rates based on your credit score.</p>
              <form onSubmit={registerUser} className="space-y-3">
                <Input className={`border p-2 rounded w-full ${isMobile ? 'py-3 text-lg' : ''}`} placeholder="Full Name" 
                  value={regForm.name} onChange={(e) => setRegForm({...regForm, name: e.target.value})} required />
                <Input className={`border p-2 rounded w-full ${isMobile ? 'py-3 text-lg' : ''}`} placeholder="Email Address" type="email"
                  value={regForm.email} onChange={(e) => setRegForm({...regForm, email: e.target.value})} required />
                <Input className={`border p-2 rounded w-full ${isMobile ? 'py-3 text-lg' : ''}`} placeholder="Wallet Address"
                  value={address || regForm.wallet_address} onChange={(e) => setRegForm({...regForm, wallet_address: e.target.value})} 
                  disabled={isConnected} required />
                <Button type="submit" className={`bg-blue-500 text-white px-4 py-2 rounded w-full ${isMobile ? 'py-3 text-lg' : ''}`} disabled={loading}>
                  {loading ? 'Registering...' : 'Register'}
                </Button>
              </form>
            </section>
          </div>
        ) : (
          /* Main Dashboard */
          <div className="space-y-6">
            {isConnected && (
              <div className="flex justify-center">
                <WalletConnect />
              </div>
            )}
            <Tabs defaultValue="dashboard" className="space-y-6">
              <TabsList className={`${isMobile ? 'grid w-full grid-cols-3 gap-1 h-auto' : 'grid w-full grid-cols-7'}`}>
                <TabsTrigger value="dashboard" className={isMobile ? 'text-xs py-2' : ''}>
                  {isMobile ? 'Home' : 'Dashboard'}
                </TabsTrigger>
                <TabsTrigger value="request" className={isMobile ? 'text-xs py-2' : ''}>
                  {isMobile ? 'Loan' : 'Request Loan'}
                </TabsTrigger>
                {!isMobile && <TabsTrigger value="payment">Make Payment</TabsTrigger>}
                <TabsTrigger value="loans" className={isMobile ? 'text-xs py-2' : ''}>
                  {isMobile ? 'My Loans' : 'My Loans'}
                </TabsTrigger>
                <TabsTrigger value="earn" className={isMobile ? 'text-xs py-2' : ''}>
                  {isMobile ? 'Earn' : 'Earn RP'}
                </TabsTrigger>
                <TabsTrigger value="points" className={isMobile ? 'text-xs py-2' : ''}>
                  {isMobile ? 'Points' : 'Points & Rewards'}
                </TabsTrigger>
                {!isMobile && <TabsTrigger value="admin">Admin Dashboard</TabsTrigger>}
              </TabsList>

            <TabsContent value="dashboard">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Your Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p><strong>Name:</strong> {currentUser.name}</p>
                    <p><strong>Email:</strong> {currentUser.email}</p>
                    <p><strong>Wallet:</strong> {currentUser.wallet_address}</p>
                    <p><strong>Total Loans:</strong> {currentUser.total_loans}</p>
                    <p><strong>Successful Repayments:</strong> {currentUser.successful_repayments}</p>
                    <div className="flex items-center space-x-2">
                      <strong>Credit Score:</strong>
                      <Badge className={getCreditScoreColor(currentUser.credit_score)}>
                        {currentUser.credit_score}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Credit Score Benefits</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="p-3 bg-green-50 rounded-lg">
                        <p className="font-semibold text-green-800">800+ Score</p>
                        <p className="text-sm text-green-600">150% collateral, 10% interest rate</p>
                      </div>
                      <div className="p-3 bg-yellow-50 rounded-lg">
                        <p className="font-semibold text-yellow-800">600-799 Score</p>
                        <p className="text-sm text-yellow-600">200% collateral, 12% interest rate</p>
                      </div>
                      <div className="p-3 bg-red-50 rounded-lg">
                        <p className="font-semibold text-red-800">Below 600 Score</p>
                        <p className="text-sm text-red-600">250% collateral, 14% interest rate</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="request">
              <Card className="max-w-2xl mx-auto">
                <CardHeader>
                  <CardTitle>Request a Loan</CardTitle>
                  <CardDescription>
                    Apply for a crypto-backed loan with terms based on your credit score.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={requestLoan} className="space-y-4">
                    <div className={`${isMobile ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}`}>
                      <div>
                        <Label htmlFor="amount">Loan Amount (USD)</Label>
                        <Input
                          id="amount"
                          type="number"
                          value={loanForm.amount_usd}
                          onChange={(e) => setLoanForm({...loanForm, amount_usd: e.target.value})}
                          placeholder="500"
                          className={isMobile ? 'py-3 text-lg' : ''}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="duration">Duration (Days)</Label>
                        <Input
                          id="duration"
                          type="number"
                          value={loanForm.duration_days}
                          onChange={(e) => setLoanForm({...loanForm, duration_days: e.target.value})}
                          className={isMobile ? 'py-3 text-lg' : ''}
                          required
                        />
                      </div>
                    </div>
                    <div className={`${isMobile ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}`}>
                      <div>
                        <Label htmlFor="crypto">Collateral Crypto</Label>
                        <select
                          id="crypto"
                          value={loanForm.collateral_crypto}
                          onChange={(e) => setLoanForm({...loanForm, collateral_crypto: e.target.value})}
                          className={`w-full p-2 border border-gray-300 rounded-md ${isMobile ? 'py-3 text-lg' : ''}`}
                        >
                          <option value="BTC">Bitcoin (BTC)</option>
                          <option value="ETH">Ethereum (ETH)</option>
                          <option value="USDC">USD Coin (USDC)</option>
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="collateral_amount">Collateral Amount</Label>
                        <Input
                          id="collateral_amount"
                          type="number"
                          step="0.00001"
                          value={loanForm.collateral_amount}
                          onChange={(e) => setLoanForm({...loanForm, collateral_amount: e.target.value})}
                          placeholder="0.02"
                          className={isMobile ? 'py-3 text-lg' : ''}
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="purpose">Loan Purpose</Label>
                      <Input
                        id="purpose"
                        value={loanForm.purpose}
                        onChange={(e) => setLoanForm({...loanForm, purpose: e.target.value})}
                        placeholder="Business expansion, personal use, etc."
                        className={isMobile ? 'py-3 text-lg' : ''}
                        required
                      />
                    </div>
                    <Button type="submit" className={`w-full ${isMobile ? 'py-4 text-lg' : ''}`} disabled={loading}>
                      {loading ? 'Submitting...' : 'Submit Loan Request'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payment">
              <Card className="max-w-2xl mx-auto">
                <CardHeader>
                  <CardTitle>Make Payment</CardTitle>
                  <CardDescription>
                    Pay for your approved loan using local currency.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={processPayment} className="space-y-4">
                    <div>
                      <Label htmlFor="loan_select">Select Approved Loan</Label>
                      <select
                        id="loan_select"
                        value={paymentForm.loan_id}
                        onChange={(e) => setPaymentForm({...paymentForm, loan_id: e.target.value})}
                        className="w-full p-2 border border-gray-300 rounded-md"
                        required
                      >
                        <option value="">Select a loan...</option>
                        {userLoans.filter(loan => loan.status === 'approved').map(loan => (
                          <option key={loan.id} value={loan.id}>
                            ${loan.amount_usd} - {loan.purpose}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="payment_method">Payment Method</Label>
                        <select
                          id="payment_method"
                          value={paymentForm.payment_method}
                          onChange={(e) => setPaymentForm({...paymentForm, payment_method: e.target.value})}
                          className="w-full p-2 border border-gray-300 rounded-md"
                        >
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="credit_card">Credit Card</option>
                          <option value="mobile_money">Mobile Money</option>
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="currency">Local Currency</Label>
                        <select
                          id="currency"
                          value={paymentForm.local_currency}
                          onChange={(e) => setPaymentForm({...paymentForm, local_currency: e.target.value})}
                          className="w-full p-2 border border-gray-300 rounded-md"
                        >
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="GBP">GBP</option>
                          <option value="NGN">NGN</option>
                          <option value="KES">KES</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="amount_local">Amount in Local Currency</Label>
                      <Input
                        id="amount_local"
                        type="number"
                        value={paymentForm.amount_local}
                        onChange={(e) => setPaymentForm({...paymentForm, amount_local: e.target.value})}
                        placeholder="500"
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? 'Processing...' : 'Process Payment'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="loans">
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">My Loans</h2>
                {userLoans.length === 0 ? (
                  <Card>
                    <CardContent className="text-center py-8">
                      <p className="text-gray-500">No loans found. Request your first loan to get started!</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {userLoans.map(loan => (
                      <Card key={loan.id}>
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-lg">${loan.amount_usd}</CardTitle>
                              <CardDescription>{loan.purpose}</CardDescription>
                            </div>
                            <Badge className={getStatusColor(loan.status)}>
                              {loan.status}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <p><strong>Interest Rate:</strong> {loan.interest_rate}%</p>
                          <p><strong>Duration:</strong> {loan.duration_days} days</p>
                          <p><strong>Collateral:</strong> {loan.collateral_amount} {loan.collateral_crypto}</p>
                          <p><strong>Due Date:</strong> {new Date(loan.due_date).toLocaleDateString()}</p>
                          {loan.status === 'active' && (
                            <Button 
                              onClick={() => repayLoan(loan.id)}
                              className="w-full mt-4"
                              disabled={loading}
                            >
                              Repay Loan
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="earn">
              <div className="space-y-6">
                {/* RP Economy Info */}
                <div className="p-4 bg-white rounded-2xl shadow-md">
                  <h2 className="text-xl font-bold mb-2">How RP Works</h2>
                  <p className="text-sm mb-1">1 RP unlocks $0.05 of borrowing power (within your tier cap).</p>
                  <p className="text-sm mb-1">Play games or buy RP bundles to grow faster and unlock higher borrowing limits.</p>
                </div>

                {/* Game Cards */}
                <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'md:grid-cols-3'}`}>
                  <GameCard 
                    title="Spin Wheel" 
                    icon="🎰" 
                    description="Stake 20–200 RP. Higher stakes = higher odds and rewards!"
                    inputPlaceholder="Enter RP (20-200)"
                    actionLabel={`Spin (${spinStake} RP)`}
                    onAction={() => playSpin(spinStake)}
                    inputValue={spinStake}
                    onInputChange={(value: string) => setSpinStake(parseInt(value) || 50)}
                    inputProps={{ min: "20", max: "200", type: "number" }}
                  />
                  <GameCard 
                    title="Rock Paper Scissors" 
                    icon="✊✋✌️" 
                    description="Costs 15 RP per play. Win to double your RP!"
                    buttons={["🪨 Rock", "📄 Paper", "✂️ Scissors"]}
                    onAction={(choice?: string) => choice && playRPS(choice.split(' ')[1].toLowerCase())}
                  />
                  <GameCard 
                    title="Whot (Nigerian Card Game)" 
                    icon="🃏" 
                    description="Costs 100 RP per match. Win 300 RP! Very hard CPU (12% win rate)."
                    actionLabel="Play Whot"
                    onAction={playWhot}
                  />
                </div>

                {/* Daily RP Claim */}
                <Card>
                  <CardHeader>
                    <CardTitle>Daily RP Claim</CardTitle>
                    <CardDescription>Claim your daily reputation points</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center">
                      <p className="text-sm text-gray-600 mb-4">Claim 20 RP daily to fuel your games</p>
                      <Button onClick={claimDailyRP} className={`${isMobile ? 'w-full py-4 text-lg' : ''}`}>
                        Claim Daily RP
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="points">
              {currentUser ? (
                <PointsDisplay userId={currentUser.id} />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Points & Rewards</CardTitle>
                    <CardDescription>Register and connect your wallet to view your trust points</CardDescription>
                  </CardHeader>
                  <CardContent className="text-center py-8">
                    <p className="text-muted-foreground">Please register and connect your wallet to access the points system</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="admin">
              <AdminDashboard />
            </TabsContent>
          </Tabs>
          </div>
        )}
      </main>
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <AppContent />
      </WagmiProvider>
    </QueryClientProvider>
  )
}

export default App
