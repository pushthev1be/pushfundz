import { useState } from 'react';

interface MembershipCardProps {
  tier: string;
  price: number;
  limits: {
    usd: number;
    ngn: number;
  };
  features: string[];
  onPurchase: (tier: string) => void;
}

export function MembershipCard({ tier, price, limits, features, onPurchase }: MembershipCardProps) {
  const [loading, setLoading] = useState(false);

  const handlePurchase = async () => {
    setLoading(true);
    try {
      await onPurchase(tier);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-md border hover:shadow-lg transition-shadow">
      <h3 className="text-xl font-bold mb-2 capitalize">{tier}</h3>
      <div className="text-3xl font-bold text-blue-600 mb-4">${price}</div>
      
      <div className="mb-4">
        <p className="text-sm text-gray-600 mb-2">Loan Limits:</p>
        <p className="font-semibold">USD: ${limits.usd.toLocaleString()}</p>
        <p className="font-semibold">NGN: ₦{limits.ngn.toLocaleString()}</p>
      </div>
      
      <ul className="mb-6 space-y-2">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center text-sm">
            <span className="text-green-500 mr-2">✓</span>
            {feature}
          </li>
        ))}
      </ul>
      
      <button
        onClick={handlePurchase}
        disabled={loading}
        className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white py-2 px-4 rounded transition-colors"
      >
        {loading ? 'Processing...' : `Purchase ${tier}`}
      </button>
    </div>
  );
}
