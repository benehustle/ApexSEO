import React, { useState } from 'react';
import { publishingService } from '../../services/publishing.service';
import { Calendar, X } from 'lucide-react';

interface BulkScheduleModalProps {
  blogIds: string[];
  blogsPerWeek: number;
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkScheduleModal: React.FC<BulkScheduleModalProps> = ({
  blogIds,
  blogsPerWeek,
  onClose,
  onSuccess
}) => {
  const [startDate, setStartDate] = useState(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState('');

  const handleSchedule = async () => {
    setScheduling(true);
    setError('');
    
    try {
      await publishingService.bulkSchedule(
        blogIds,
        new Date(startDate),
        blogsPerWeek
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to schedule blogs');
    } finally {
      setScheduling(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">Schedule Blogs</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-slate-300 mb-4">
          Schedule {blogIds.length} blogs at {blogsPerWeek} posts per week
        </p>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="input-field"
          />
        </div>

        {error && (
          <div className="bg-red-500/20 text-red-400 border border-red-500/50 p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            disabled={scheduling}
            className="flex-1 btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSchedule}
            disabled={scheduling}
            className="flex-1 btn-primary flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Calendar className="w-5 h-5" />
            <span>{scheduling ? 'Scheduling...' : 'Schedule'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
