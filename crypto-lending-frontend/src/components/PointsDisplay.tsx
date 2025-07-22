import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Star, Trophy, Gift, TrendingUp } from 'lucide-react';

interface PointsData {
  totalPoints: number;
  tier: string;
  tierThresholds: {
    BRONZE: number;
    SILVER: number;
    GOLD: number;
    PLATINUM: number;
  };
  recentHistory: Array<{
    id: number;
    event_type: string;
    points_delta: number;
    description: string;
    event_timestamp: string;
  }>;
}

interface PointsDisplayProps {
  userId: string;
}

export function PointsDisplay({ userId }: PointsDisplayProps) {
  const [pointsData, setPointsData] = useState<PointsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPointsData();
  }, [userId]);

  const fetchPointsData = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/points/user/${userId}/points`);
      if (response.ok) {
        const data = await response.json();
        setPointsData(data);
      }
    } catch (error) {
      console.error('Failed to fetch points data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'PLATINUM': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'GOLD': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'SILVER': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-orange-100 text-orange-800 border-orange-200';
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'PLATINUM': return <Trophy className="h-4 w-4" />;
      case 'GOLD': return <Star className="h-4 w-4" />;
      case 'SILVER': return <TrendingUp className="h-4 w-4" />;
      default: return <Gift className="h-4 w-4" />;
    }
  };

  const getNextTierProgress = () => {
    if (!pointsData) return { progress: 0, nextTier: '', pointsNeeded: 0 };
    
    const { totalPoints, tier, tierThresholds } = pointsData;
    const tiers = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
    const currentTierIndex = tiers.indexOf(tier);
    
    if (currentTierIndex === tiers.length - 1) {
      return { progress: 100, nextTier: 'MAX', pointsNeeded: 0 };
    }
    
    const nextTier = tiers[currentTierIndex + 1];
    const currentThreshold = tierThresholds[tier as keyof typeof tierThresholds];
    const nextThreshold = tierThresholds[nextTier as keyof typeof tierThresholds];
    const progress = ((totalPoints - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
    const pointsNeeded = nextThreshold - totalPoints;
    
    return { progress: Math.min(progress, 100), nextTier, pointsNeeded };
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trust Points</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!pointsData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trust Points</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Unable to load points data</p>
        </CardContent>
      </Card>
    );
  }

  const { progress, nextTier, pointsNeeded } = getNextTierProgress();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Trust Points
            </span>
            <Badge className={getTierColor(pointsData.tier)}>
              {getTierIcon(pointsData.tier)}
              <span className="ml-1">{pointsData.tier}</span>
            </Badge>
          </CardTitle>
          <CardDescription>
            Earn points for positive behaviors and unlock better loan terms
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">
              {pointsData.totalPoints.toLocaleString()}
            </div>
            <p className="text-sm text-muted-foreground">Total Points</p>
          </div>

          {nextTier !== 'MAX' && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress to {nextTier}</span>
                <span>{pointsNeeded} points needed</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-lg font-semibold">
                {pointsData.tier === 'PLATINUM' ? '∞' : `${pointsData.tierThresholds[pointsData.tier as keyof typeof pointsData.tierThresholds]}+`}
              </div>
              <p className="text-xs text-muted-foreground">Tier Minimum</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-lg font-semibold">
                {pointsData.recentHistory.filter(h => h.points_delta > 0).length}
              </div>
              <p className="text-xs text-muted-foreground">Recent Rewards</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest point transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {pointsData.recentHistory.slice(0, 5).map((activity) => (
              <div key={activity.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium">{activity.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(activity.event_timestamp).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant={activity.points_delta > 0 ? 'default' : 'secondary'}>
                  {activity.points_delta > 0 ? '+' : ''}{activity.points_delta}
                </Badge>
              </div>
            ))}
            {pointsData.recentHistory.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                No recent activity
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
