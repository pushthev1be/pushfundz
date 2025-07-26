import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Users, DollarSign } from 'lucide-react';

interface UserWithNegativeBalance {
  id: string;
  name: string;
  email: string;
  fiat_balance: number;
  credit_score: number;
  active_loans: number;
}

export function AdminDashboard() {
  const [negativeBalanceUsers, setNegativeBalanceUsers] = useState<UserWithNegativeBalance[]>([]);
  const [stats, setStats] = useState({
    totalNegativeUsers: 0,
    totalOutstandingAmount: 0,
    averageNegativeBalance: 0
  });

  useEffect(() => {
    fetchNegativeBalanceUsers();
  }, []);

  const fetchNegativeBalanceUsers = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/negative-balances`);
      if (response.ok) {
        const data = await response.json();
        setNegativeBalanceUsers(data.users);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch negative balance users:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="flex items-center p-6">
            <Users className="h-8 w-8 text-red-600 mr-3" />
            <div>
              <p className="text-2xl font-bold">{stats.totalNegativeUsers}</p>
              <p className="text-sm text-gray-600">Users with Negative Balance</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center p-6">
            <DollarSign className="h-8 w-8 text-red-600 mr-3" />
            <div>
              <p className="text-2xl font-bold">${stats.totalOutstandingAmount.toFixed(2)}</p>
              <p className="text-sm text-gray-600">Total Outstanding</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center p-6">
            <AlertTriangle className="h-8 w-8 text-yellow-600 mr-3" />
            <div>
              <p className="text-2xl font-bold">${stats.averageNegativeBalance.toFixed(2)}</p>
              <p className="text-sm text-gray-600">Average Negative Balance</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users with Negative Balances</CardTitle>
          <CardDescription>Monitor users with outstanding loan amounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {negativeBalanceUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-gray-600">{user.email}</p>
                  <p className="text-sm">Credit Score: {user.credit_score} | Active Loans: {user.active_loans}</p>
                </div>
                <Badge variant="destructive">
                  ${user.fiat_balance.toFixed(2)}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
