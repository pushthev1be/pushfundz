import { useState, useEffect } from 'react';
import { TrendingDown, Clock, Zap, Shield, Coins } from 'lucide-react';

const RPLoanBenefits = ({ loanId, userRP, onBenefitApplied }: { loanId: string, userRP: number, onBenefitApplied: (cost: number, message: string) => void }) => {
  const [benefits, setBenefits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const benefitIcons = {
    waive_interest: TrendingDown,
    extend_loan_7days: Clock,
    extend_loan_14days: Clock,
    instant_approval: Zap,
    reduce_collateral: Shield
  };

  const benefitData = [
    {
      id: 'waive_interest',
      name: 'Waive Interest',
      description: 'Remove all interest charges from this loan',
      cost: 500,
      savings: 'Save 10-14% interest'
    },
    {
      id: 'extend_loan_7days',
      name: 'Extend 7 Days',
      description: 'Extend loan duration by 7 days',
      cost: 300,
      savings: 'Avoid late fees'
    },
    {
      id: 'extend_loan_14days',
      name: 'Extend 14 Days',
      description: 'Extend loan duration by 14 days',
      cost: 500,
      savings: 'More flexibility'
    },
    {
      id: 'instant_approval',
      name: 'Instant Approval',
      description: 'Skip waiting period for loan approval',
      cost: 200,
      savings: 'Get funds immediately'
    },
    {
      id: 'reduce_collateral',
      name: 'Reduce Collateral',
      description: 'Lower collateral requirement by 25%',
      cost: 800,
      savings: 'Less crypto locked'
    }
  ];

  useEffect(() => {
    fetchAvailableBenefits();
  }, [loanId]);

  const fetchAvailableBenefits = async () => {
    try {
      setBenefits(benefitData);
    } catch (error) {
      console.error('Failed to fetch benefits:', error);
    }
    setLoading(false);
  };

  const applyBenefit = async (benefit: any) => {
    if (userRP < benefit.cost) {
      alert('Insufficient RP balance!');
      return;
    }

    try {
      const response = await fetch(`http://localhost:8000/api/loans/${loanId}/apply-rp-benefit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          benefit_id: benefit.id,
          cost: benefit.cost
        })
      });
      
      if (response.ok) {
        await response.json();
        onBenefitApplied(benefit.cost, `${benefit.name} applied successfully!`);
        fetchAvailableBenefits();
      }
    } catch (error) {
      console.error('Failed to apply benefit:', error);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-md">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-md">
      <div className="flex items-center gap-3 mb-6">
        <Coins className="h-6 w-6 text-green-600" />
        <h3 className="text-xl font-bold">RP Loan Benefits</h3>
      </div>

      <div className="space-y-4">
        {benefits.map(benefit => {
          const Icon = benefitIcons[benefit.id as keyof typeof benefitIcons] || Coins;
          const canAfford = userRP >= benefit.cost;
          
          return (
            <div key={benefit.id} className={`border-2 rounded-xl p-4 ${canAfford ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 mt-1 ${canAfford ? 'text-green-600' : 'text-gray-400'}`} />
                  <div>
                    <h4 className="font-bold text-lg">{benefit.name}</h4>
                    <p className="text-gray-600 text-sm mb-2">{benefit.description}</p>
                    <div className="text-xs text-green-600 font-medium">{benefit.savings}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-purple-600 mb-2">
                    {benefit.cost} RP
                  </div>
                  <button
                    onClick={() => applyBenefit(benefit)}
                    disabled={!canAfford}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${
                      canAfford 
                        ? 'bg-green-600 text-white hover:bg-green-700' 
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {canAfford ? 'Apply' : 'Need More RP'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {benefits.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Coins className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>No benefits available for this loan</p>
        </div>
      )}
    </div>
  );
};

export default RPLoanBenefits;
