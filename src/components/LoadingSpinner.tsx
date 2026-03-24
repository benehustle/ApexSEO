import React from 'react';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
        <p className="text-slate-400">Loading...</p>
      </div>
    </div>
  );
};
