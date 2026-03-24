import React, { useState } from 'react';
import { Star, Send, X } from 'lucide-react';
import { feedbackService } from '../../services/feedback.service';
import { useAuth } from '../../hooks/useAuth';

interface FeedbackFormProps {
  blogId?: string;
  keyword?: string;
  siteId: string;
  promptType: 'blog' | 'image' | 'headline' | 'keyword' | 'content-plan';
  onSubmitted?: () => void;
  onCancel?: () => void;
}

export const FeedbackForm: React.FC<FeedbackFormProps> = ({
  blogId,
  keyword,
  siteId,
  promptType,
  onSubmitted,
  onCancel,
}) => {
  const { user } = useAuth();
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating === 0) {
      setError('Please provide a rating');
      return;
    }

    if (!user) {
      setError('You must be logged in to submit feedback');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (promptType === 'keyword' && keyword) {
        await feedbackService.submitKeywordFeedback({
          keyword,
          siteId,
          userId: user.uid,
          rating,
          text: text.trim() || undefined,
        });
      } else {
        await feedbackService.submitFeedback({
          blogId,
          keyword,
          siteId,
          userId: user.uid,
          promptType,
          rating,
          text: text.trim() || undefined,
        });
      }

      setSubmitted(true);
      if (onSubmitted) {
        setTimeout(() => {
          onSubmitted();
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <p className="text-green-800 text-sm font-medium">
          Thank you for your feedback! It helps us improve.
        </p>
      </div>
    );
  }

  const promptTypeLabels = {
    blog: 'Blog Content',
    image: 'Featured Image',
    headline: 'Headline & Title',
    keyword: 'Keyword Research',
    'content-plan': 'Content Plan',
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">
          Rate this {promptTypeLabels[promptType]}
        </h3>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Star Rating */}
        <div>
          <div className="flex items-center space-x-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                className="focus:outline-none transition-transform hover:scale-110"
              >
                <Star
                  className={`w-6 h-6 ${
                    star <= (hoveredRating || rating)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {rating === 5 && 'Excellent!'}
              {rating === 4 && 'Good!'}
              {rating === 3 && 'Okay'}
              {rating === 2 && 'Needs improvement'}
              {rating === 1 && 'Poor'}
            </p>
          )}
        </div>

        {/* Text Feedback */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Additional comments (optional)
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="input-field w-full text-sm"
            rows={3}
            placeholder="What did you like or what could be improved?"
            maxLength={500}
          />
          <p className="text-xs text-gray-500 mt-1">{text.length}/500</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-2">
            <p className="text-red-800 text-xs">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex items-center justify-end space-x-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="btn-secondary text-sm py-1.5 px-3"
              disabled={submitting}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || rating === 0}
            className="btn-primary flex items-center space-x-2 text-sm py-1.5 px-3"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Submit Feedback</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
