import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { useToast } from '../Toast';
import { useAgencyContext } from '../../contexts/AgencyContext';
import { CheckCircle2, AlertCircle, Loader2, Sparkles } from 'lucide-react';

interface CampaignBuilderStepProps {
  siteId: string;
  onComplete: () => void;
}

export const CampaignBuilderStep: React.FC<CampaignBuilderStepProps> = ({
  siteId,
  onComplete,
}) => {
  const [statusIndex, setStatusIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { agency } = useAgencyContext();
  const { showToast } = useToast();

  // Get agency data for personalized messages
  // Note: agency context may not have all fields, use type assertion or optional chaining
  const niche = (agency as any)?.niche || 'your business';
  const location = (agency as any)?.location || agency?.country || 'your area';

  // Status messages that cycle every 2 seconds
  const statusMessages = [
    `Analyzing your ${niche} niche...`,
    `Researching high-traffic keywords for ${location}...`,
    'Drafting your first month of content...',
    'Finalizing your strategy...',
  ];

  // Cycle through status messages every 2 seconds
  useEffect(() => {
    if (!isGenerating || isSuccess || error) return;

    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % statusMessages.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [isGenerating, isSuccess, error, statusMessages.length]);

  // Generate campaign on mount
  useEffect(() => {
    const generateCampaign = async () => {
      if (!siteId) {
        setError('Site ID is required');
        setIsGenerating(false);
        return;
      }

      setIsGenerating(true);
      setError(null);

      try {
        const generateInitialCampaign = httpsCallable(functions, 'generateInitialCampaignCallable');
        const result = await generateInitialCampaign({ siteId });

        const data = result.data as {
          success: boolean;
          keywordsCount?: number;
          blogPostsCount?: number;
          skipped?: boolean;
          message?: string;
        };

        if (data.success) {
          if (data.skipped) {
            // Campaign already exists - still show success
            console.log('[CampaignBuilderStep] Campaign already generated');
          } else {
            console.log(
              `[CampaignBuilderStep] ✅ Campaign generated: ${data.keywordsCount} keywords, ${data.blogPostsCount} blog posts`
            );
          }

          // Show success state
          setIsSuccess(true);
          setIsGenerating(false);

          // Wait 1 second, then call onComplete
          setTimeout(() => {
            onComplete();
          }, 1000);
        } else {
          throw new Error(data.message || 'Failed to generate campaign');
        }
      } catch (error: any) {
        console.error('[CampaignBuilderStep] Error generating campaign:', error);
        setIsGenerating(false);
        setError(error.message || 'Failed to generate your campaign. Please try again.');
        showToast('error', error.message || 'Failed to generate campaign');
      }
    };

    generateCampaign();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const handleRetry = () => {
    setError(null);
    setIsGenerating(true);
    setIsSuccess(false);
    setStatusIndex(0);

    // Retry generation
    const generateCampaign = async () => {
      try {
        const generateInitialCampaign = httpsCallable(functions, 'generateInitialCampaignCallable');
        const result = await generateInitialCampaign({ siteId });

        const data = result.data as {
          success: boolean;
          keywordsCount?: number;
          blogPostsCount?: number;
          skipped?: boolean;
          message?: string;
        };

        if (data.success) {
          setIsSuccess(true);
          setIsGenerating(false);

          setTimeout(() => {
            onComplete();
          }, 1000);
        } else {
          throw new Error(data.message || 'Failed to generate campaign');
        }
      } catch (error: any) {
        console.error('[CampaignBuilderStep] Error retrying campaign:', error);
        setIsGenerating(false);
        setError(error.message || 'Failed to generate your campaign. Please try again.');
        showToast('error', error.message || 'Failed to generate campaign');
      }
    };

    generateCampaign();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-8">
      {/* Animated Progress Circle */}
      <div className="relative">
        {isGenerating && !isSuccess && !error && (
          <div className="relative w-32 h-32">
            {/* Outer rotating ring */}
            <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-transparent border-t-primary-500 rounded-full animate-spin"></div>
            
            {/* Inner pulsing circle */}
            <div className="absolute inset-4 bg-primary-500/20 rounded-full animate-pulse"></div>
            
            {/* Center icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="w-12 h-12 text-primary-400 animate-pulse" />
            </div>
          </div>
        )}

        {isSuccess && (
          <div className="w-32 h-32 flex items-center justify-center">
            <div className="relative">
              <CheckCircle2 className="w-32 h-32 text-green-400" style={{ animation: 'scale-in 0.5s ease-out' }} />
              <div className="absolute inset-0 bg-green-400/20 rounded-full animate-ping"></div>
            </div>
          </div>
        )}

        {error && (
          <div className="w-32 h-32 flex items-center justify-center">
            <AlertCircle className="w-32 h-32 text-red-400" />
          </div>
        )}
      </div>

      {/* Dynamic Status Text */}
      <div className="text-center space-y-2 min-h-[80px] flex flex-col justify-center">
        {isGenerating && !isSuccess && !error && (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">
              Building Your SEO Strategy
            </h2>
            <p className="text-lg text-slate-300" style={{ animation: 'fade-in 0.5s ease-in-out' }}>
              {statusMessages[statusIndex]}
            </p>
            <p className="text-sm text-slate-500 mt-2">
              This may take a minute or two...
            </p>
          </>
        )}

        {isSuccess && (
          <>
            <h2 className="text-2xl font-bold text-green-400 mb-2" style={{ animation: 'scale-in 0.5s ease-out' }}>
              Strategy Created!
            </h2>
            <p className="text-lg text-slate-300">
              Your content calendar is ready. Redirecting...
            </p>
          </>
        )}

        {error && (
          <>
            <h2 className="text-2xl font-bold text-red-400 mb-2">
              Something Went Wrong
            </h2>
            <p className="text-lg text-slate-300 mb-4">
              {error}
            </p>
            <button
              onClick={handleRetry}
              className="btn-primary flex items-center space-x-2 mx-auto"
            >
              <Loader2 className="w-5 h-5" />
              <span>Retry</span>
            </button>
          </>
        )}
      </div>

      {/* Progress Steps Indicator (Optional) */}
      {isGenerating && !isSuccess && !error && (
        <div className="flex space-x-2">
          {statusMessages.map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                index === statusIndex
                  ? 'bg-primary-500 w-8'
                  : index < statusIndex
                  ? 'bg-primary-500/50'
                  : 'bg-slate-700'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
