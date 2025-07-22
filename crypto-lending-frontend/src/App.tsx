import { useState, useEffect } from 'react'
import { WagmiProvider, useAccount } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from './config/web3'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Wallet, DollarSign, Users, CreditCard, Clock } from 'lucide-react'
import { WalletConnect } from './components/WalletConnect'
import { PointsDisplay } from './components/PointsDisplay'
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

function AppContent() {
  const { address, isConnected } = useAccount()
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Platform Stats */}
        {platformStats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="flex items-center p-6">
                <Users className="h-8 w-8 text-blue-600 mr-3" />
                <div>
                  <p className="text-2xl font-bold">{platformStats.total_users}</p>
                  <p className="text-sm text-gray-600">Total Users</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center p-6">
                <CreditCard className="h-8 w-8 text-green-600 mr-3" />
                <div>
                  <p className="text-2xl font-bold">{platformStats.total_loans}</p>
                  <p className="text-sm text-gray-600">Total Loans</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center p-6">
                <Clock className="h-8 w-8 text-yellow-600 mr-3" />
                <div>
                  <p className="text-2xl font-bold">{platformStats.active_loans}</p>
                  <p className="text-sm text-gray-600">Active Loans</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center p-6">
                <DollarSign className="h-8 w-8 text-purple-600 mr-3" />
                <div>
                  <p className="text-2xl font-bold">${platformStats.total_volume_usd.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">Total Volume</p>
                </div>
              </CardContent>
            </Card>
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

        {!currentUser ? (
          /* Registration Form */
          <div className="space-y-6">
            {!isConnected && (
              <div className="flex justify-center">
                <WalletConnect />
              </div>
            )}
            <Card className="max-w-md mx-auto">
              <CardHeader>
                <CardTitle>Register for PushFundz</CardTitle>
                <CardDescription>
                  Create your account to start accessing crypto loans with competitive rates based on your credit score.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={registerUser} className="space-y-4">
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={regForm.name}
                    onChange={(e) => setRegForm({...regForm, name: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={regForm.email}
                    onChange={(e) => setRegForm({...regForm, email: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="wallet">Crypto Wallet Address</Label>
                  <Input
                    id="wallet"
                    value={address || regForm.wallet_address}
                    onChange={(e) => setRegForm({...regForm, wallet_address: e.target.value})}
                    placeholder={address ? address : "0x..."}
                    required
                    disabled={isConnected}
                  />
                  {isConnected && (
                    <p className="text-xs text-green-600 mt-1">
                      ✓ Wallet connected automatically
                    </p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Registering...' : 'Register'}
                </Button>
              </form>
            </CardContent>
          </Card>
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
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                <TabsTrigger value="request">Request Loan</TabsTrigger>
                <TabsTrigger value="payment">Make Payment</TabsTrigger>
                <TabsTrigger value="loans">My Loans</TabsTrigger>
                <TabsTrigger value="points">Points & Rewards</TabsTrigger>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="amount">Loan Amount (USD)</Label>
                        <Input
                          id="amount"
                          type="number"
                          value={loanForm.amount_usd}
                          onChange={(e) => setLoanForm({...loanForm, amount_usd: e.target.value})}
                          placeholder="500"
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
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="crypto">Collateral Crypto</Label>
                        <select
                          id="crypto"
                          value={loanForm.collateral_crypto}
                          onChange={(e) => setLoanForm({...loanForm, collateral_crypto: e.target.value})}
                          className="w-full p-2 border border-gray-300 rounded-md"
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
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
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
