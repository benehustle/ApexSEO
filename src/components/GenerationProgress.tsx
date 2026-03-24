import React from 'react';
import { Loader } from 'lucide-react';

interface GenerationProgressProps {
  total: number;
  completed: number;
  failed: number;
}

export const GenerationProgress: React.FC<GenerationProgressProps> = ({
  total,
  completed,
  failed
}) => {
  const percentage = Math.round((completed / total) * 100);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 max-w-md w-full">
        <div className="flex items-center space-x-3 mb-4">
          <Loader className="w-6 h-6 animate-spin text-blue-600" />
          <h3 className="text-xl font-semibold text-white">Generating Blogs</h3>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-sm text-slate-300 mb-2">
            <span>Progress</span>
            <span>{completed} / {total}</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-3">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-white">{total}</p>
            <p className="text-xs text-slate-400">Total</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-400">{completed}</p>
            <p className="text-xs text-slate-400">Completed</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-400">{failed}</p>
            <p className="text-xs text-slate-400">Failed</p>
          </div>
        </div>

        {failed > 0 && (
          <p className="mt-4 text-sm text-yellow-400">
            Some blogs failed to generate. You can retry them later.
          </p>
        )}
      </div>
    </div>
  );
};
