import React, { useEffect, useState } from 'react';
import { rateLimiterService } from '../services/rateLimiter.service';
import { useAuth } from '../hooks/useAuth';
import { DollarSign, Zap } from 'lucide-react';

export const UsageDashboard: React.FC = () => {
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const currentMonth = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    loadUsage();
  }, [user]);

  const loadUsage = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const stats = await rateLimiterService.getApiUsageStats(user.uid, currentMonth);
      setUsage(stats);
    } catch (error) {
      console.error('Failed to load usage stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="h-20 bg-slate-700 rounded mb-4"></div>
        </div>
      </div>
    );
  }

  if (!usage) return null;

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 shadow p-6">
      <h3 className="text-lg font-semibold mb-4 text-white">API Usage This Month</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-500/20 border border-blue-500/30 p-4 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-400">Total Cost</p>
              <p className="text-2xl font-bold text-blue-300">
                ${(usage.totalCost || 0).toFixed(2)}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-blue-400" />
          </div>
        </div>

        <div className="bg-purple-500/20 border border-purple-500/30 p-4 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-400">Total Tokens</p>
              <p className="text-2xl font-bold text-purple-300">
                {(usage.totalTokens || 0).toLocaleString()}
              </p>
            </div>
            <Zap className="w-8 h-8 text-purple-400" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between py-2 border-b border-slate-700">
          <span className="text-sm text-slate-300">Claude API (Content)</span>
          <span className="font-medium text-white">${(usage.anthropicCost || 0).toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-slate-700">
          <span className="text-sm text-slate-300">DALL-E (Images)</span>
          <span className="font-medium text-white">${(usage.openaiCost || 0).toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-slate-700">
          <span className="text-sm text-slate-300">DataForSEO (Keywords)</span>
          <span className="font-medium text-white">${(usage.dataforseoCost || 0).toFixed(2)}</span>
        </div>
      </div>

      <div className="mt-4 p-3 bg-slate-900/50 rounded border border-slate-700">
        <p className="text-xs text-slate-400">
          Costs are approximate and based on current API pricing. 
          Actual charges may vary.
        </p>
      </div>
    </div>
  );
};
