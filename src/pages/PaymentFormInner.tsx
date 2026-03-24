import React, { useEffect, useState } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { Loader2, ArrowRight } from 'lucide-react';

interface PaymentFormInnerProps {
  userId: string | null;
  agencyId: string | null;
  email: string;
  country?: string | null;
  onSuccess: () => void;
  onError: (error: string) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

export const PaymentFormInner: React.FC<PaymentFormInnerProps> = ({
  userId,
  agencyId,
  email,
  country,
  onSuccess,
  onError,
  loading,
  setLoading,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isStripeReady, setIsStripeReady] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);

  // Wait for Stripe to be ready
  useEffect(() => {
    if (stripe && elements) {
      console.log('[PaymentFormInner] ✅ Stripe and Elements are ready');
      setIsStripeReady(true);
      setStripeError(null);
    } else {
      console.log('[PaymentFormInner] ⏳ Waiting for Stripe...', { stripe: !!stripe, elements: !!elements });
      setIsStripeReady(false);
    }
  }, [stripe, elements]);

  // Check for Stripe configuration issues
  useEffect(() => {
    const checkStripeConfig = () => {
      const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
      if (!publishableKey) {
        setStripeError('Stripe publishable key is not configured. Please contact support.');
        return;
      }
      
      // Give Stripe some time to load (max 10 seconds)
      const timeout = setTimeout(() => {
        if (!stripe || !elements) {
          setStripeError('Stripe is taking longer than expected to load. Please refresh the page.');
        }
      }, 10000);

      return () => clearTimeout(timeout);
    };

    checkStripeConfig();
  }, [stripe, elements]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements || !userId || !agencyId) {
      onError('Payment form not ready. Please wait a moment and try again.');
      return;
    }

    setLoading(true);
    onError('');

    try {
      // Submit payment element to get payment method
      const { error: submitError } = await elements.submit();
      if (submitError) {
        onError(submitError.message || 'Failed to submit payment form');
        setLoading(false);
        return;
      }

      // Create payment method
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        elements,
      });

      if (pmError) {
        onError(pmError.message || 'Failed to create payment method');
        setLoading(false);
        return;
      }

      if (!paymentMethod) {
        onError('Payment method creation failed');
        setLoading(false);
        return;
      }

      // Call backend to create trial subscription
      // Backend will determine price ID from country if not provided
      const createTrialSubscription = httpsCallable(functions, 'createTrialSubscriptionCallable');
      const result = await createTrialSubscription({
        email: email,
        paymentMethodId: paymentMethod.id,
        country: country || null,
        // priceId is optional - backend will determine from country
      });

      const data = result.data as { success: boolean; subscriptionId?: string };

      if (data.success) {
        onSuccess();
        
        // Wait a moment for user to see success message, then redirect
        setTimeout(() => {
          // Break out of iframe and redirect to dashboard
          try {
            if (window.top && window.top !== window.self) {
              // We're in an iframe - break out
              const appUrl = import.meta.env.VITE_APP_URL || window.location.origin.replace('/embed', '');
              window.top.location.href = `${appUrl}/dashboard`;
            } else {
              // Not in iframe, just redirect normally
              window.location.href = '/dashboard';
            }
          } catch (e) {
            // If we can't access window.top (cross-origin), try parent
            try {
              if (window.parent && window.parent !== window.self) {
                const appUrl = import.meta.env.VITE_APP_URL || window.location.origin.replace('/embed', '');
                window.parent.location.href = `${appUrl}/dashboard`;
              } else {
                window.location.href = '/dashboard';
              }
            } catch (e2) {
              // Last resort: same window redirect
              window.location.href = '/dashboard';
            }
          }
        }, 2000);
      } else {
        onError('Failed to create subscription. Please try again.');
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      let errorMessage = 'Failed to process payment';
      
      if (err.message) {
        errorMessage = err.message;
      } else if (err.code) {
        errorMessage = `Payment error: ${err.code}`;
      }
      
      onError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (stripeError) {
    return (
      <div className="space-y-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800 text-sm">{stripeError}</p>
        </div>
      </div>
    );
  }

  if (!stripe || !elements) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 min-h-[200px] flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
            <div className="text-gray-500 text-sm">
              Loading payment form...
            </div>
            <div className="text-gray-400 text-xs mt-2">
              This may take a few seconds
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled
          className="w-full bg-gray-400 cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2"
        >
          <span>Start Free Trial</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <PaymentElement 
          options={{
            layout: 'tabs',
          }}
        />
      </div>

      <button
        type="submit"
        disabled={loading || !stripe || !elements || !isStripeReady}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Processing...</span>
          </>
        ) : (
          <>
            <span>Start Free Trial</span>
            <ArrowRight className="w-5 h-5" />
          </>
        )}
      </button>
    </form>
  );
};
