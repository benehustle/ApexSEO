import React, { useState } from 'react';
import { publishingService } from '../../services/publishing.service';
import { PlayCircle, X } from 'lucide-react';

interface PublishNowModalProps {
  blogId: string;
  blogTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const PublishNowModal: React.FC<PublishNowModalProps> = ({
  blogId,
  blogTitle,
  onClose,
  onSuccess
}) => {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  const handlePublish = async () => {
    setPublishing(true);
    setError('');
    
    try {
      await publishingService.publishNow(blogId);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to publish blog');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">Publish Now</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-slate-300 mb-4">
          Are you sure you want to publish this blog immediately?
        </p>
        <p className="font-medium text-white mb-6">"{blogTitle}"</p>

        {error && (
          <div className="bg-red-500/20 text-red-400 border border-red-500/50 p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            disabled={publishing}
            className="flex-1 btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="flex-1 btn-primary flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlayCircle className="w-5 h-5" />
            <span>{publishing ? 'Publishing...' : 'Publish Now'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
