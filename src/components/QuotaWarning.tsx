import React, { useEffect, useState } from 'react';
import { rateLimiterService, RATE_LIMITS } from '../services/rateLimiter.service';
import { useAuth } from '../hooks/useAuth';
import { AlertTriangle } from 'lucide-react';

interface QuotaWarningProps {
  action: string;
  estimatedCost?: number;
}

export const QuotaWarning: React.FC<QuotaWarningProps> = ({ action, estimatedCost }) => {
  const [remaining, setRemaining] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    loadQuota();
  }, [user, action]);

  const loadQuota = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const quota = await rateLimiterService.getRemainingQuota(user.uid, action);
    setRemaining(quota);
    setLoading(false);
  };

  if (loading) return null;

  const rateLimit = RATE_LIMITS[action];
  if (!rateLimit) return null;

  const percentage = (remaining / rateLimit.limit) * 100;

  if (percentage > 20) return null; // Only show warning when below 20%

  const actionName = action.toLowerCase().replace(/_/g, ' ');

  return (
    <div className={`p-4 rounded-lg border mb-4 ${
      percentage < 10 ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
    }`}>
      <div className="flex items-start space-x-3">
        <AlertTriangle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
          percentage < 10 ? 'text-red-600' : 'text-yellow-600'
        }`} />
        <div className="flex-1">
          <h4 className={`font-medium ${
            percentage < 10 ? 'text-red-900' : 'text-yellow-900'
          }`}>
            {percentage < 10 ? 'Quota Almost Exhausted' : 'Low Quota Warning'}
          </h4>
          <p className={`text-sm mt-1 ${
            percentage < 10 ? 'text-red-700' : 'text-yellow-700'
          }`}>
            You have {remaining} {actionName} operation{remaining !== 1 ? 's' : ''} remaining in this period.
          </p>
          {estimatedCost !== undefined && (
            <p className={`text-sm mt-1 ${
              percentage < 10 ? 'text-red-700' : 'text-yellow-700'
            }`}>
              Estimated cost: ${estimatedCost.toFixed(2)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
