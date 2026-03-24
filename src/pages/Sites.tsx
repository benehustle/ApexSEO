import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SitesGrid } from '../components/site/SitesGrid';
import { Plus } from 'lucide-react';

export const Sites: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Mission Control</h1>
          <p className="text-slate-400 mt-1 text-lg">
            Manage all your client sites and monitor their content performance.
          </p>
        </div>
        <button
          onClick={() => navigate('/onboarding')}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
        >
          <Plus className="w-5 h-5" />
          <span>Add New Site</span>
        </button>
      </div>

      {/* Sites Grid */}
      <SitesGrid />
    </div>
  );
};
