import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { Loader2, Check, Building2, Mail, Lock, ArrowRight, Globe, MapPin, Clock, FileText } from 'lucide-react';
import { formatPrice } from '../utils/currency';

// Stripe imports - install with: npm install @stripe/stripe-js @stripe/react-stripe-js
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { PaymentFormInner } from './PaymentFormInner';

// Initialize Stripe
const getStripePromise = (): Promise<Stripe | null> => {
  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    console.error('[EmbeddedSignup] ❌ VITE_STRIPE_PUBLISHABLE_KEY not found in environment variables');
    console.error('[EmbeddedSignup] Available env vars:', Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')));
    return Promise.resolve(null);
  }
  console.log('[EmbeddedSignup] ✅ Loading Stripe with publishable key:', publishableKey.substring(0, 20) + '...');
  return loadStripe(publishableKey);
};

interface Step1Data {
  email: string;
  password: string;
  agencyName: string;
}

interface Step2Data {
  niche: string;
  country: string;
  timezone: string;
  zipCode: string;
  businessDescription: string;
}

export const EmbeddedSignup: React.FC = () => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [userType, setUserType] = useState<'agency' | 'solo'>('solo');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
  // Step 1 state
  const [step1Data, setStep1Data] = useState<Step1Data>({
    email: '',
    password: '',
    agencyName: '',
  });

  // Step 2 state (Business Details)
  const [step2Data, setStep2Data] = useState<Step2Data>({
    niche: '',
    country: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    zipCode: '',
    businessDescription: '',
  });

  // Step 3 state (Payment)
  const [userId, setUserId] = useState<string | null>(null);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  // Initialize Stripe
  useEffect(() => {
    const initStripe = async () => {
      try {
        const promise = getStripePromise();
        setStripePromise(promise);
        const stripeInstance = await promise;
        if (stripeInstance) {
          console.log('[EmbeddedSignup] ✅ Stripe loaded successfully');
        } else {
          console.error('[EmbeddedSignup] ❌ Stripe failed to load');
        }
      } catch (error) {
        console.error('[EmbeddedSignup] ❌ Error initializing Stripe:', error);
      }
    };
    initStripe();
  }, []);

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate inputs
      if (!step1Data.email || !step1Data.password || !step1Data.agencyName) {
        throw new Error('Please fill in all fields');
      }

      if (step1Data.password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      if (!acceptedTerms) {
        throw new Error('You must agree to the Terms of Service and Privacy Policy');
      }

      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        step1Data.email,
        step1Data.password
      );

      const user = userCredential.user;
      setUserId(user.uid);

      // Create user document (use merge to avoid overwriting agencyId if trigger already ran)
      await setDoc(doc(db, 'users', user.uid), {
        email: step1Data.email,
        createdAt: new Date(),
      }, { merge: true });

      // Wait for the createAgencyOnSignup trigger to fire and create the agency
      // Retry logic: Check up to 5 times with increasing delays
      let fetchedAgencyId: string | undefined;
      const maxRetries = 5;
      const baseDelay = 1000; // Start with 1 second

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        // Wait with exponential backoff
        await new Promise(resolve => setTimeout(resolve, baseDelay * (attempt + 1)));

        // Fetch user document to get agencyId
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();
        fetchedAgencyId = userData?.agencyId;

        if (fetchedAgencyId) {
          console.log(`[EmbeddedSignup] ✅ Agency found after ${attempt + 1} attempt(s)`);
          break;
        }

        console.log(`[EmbeddedSignup] ⏳ Waiting for agency creation... (attempt ${attempt + 1}/${maxRetries})`);
      }

      if (!fetchedAgencyId) {
        // Last attempt: Check if agency was created but not linked
        console.error('[EmbeddedSignup] ❌ Agency not found after all retries');
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();
        console.error('[EmbeddedSignup] User document data:', userData);
        
        // The ensureAgencyExistsCallable is read-only, so we can't use it to create
        // Instead, wait a bit longer and check one more time
        console.log('[EmbeddedSignup] 🔄 Waiting additional 3 seconds for agency creation...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const finalUserDoc = await getDoc(doc(db, 'users', user.uid));
        const finalUserData = finalUserDoc.data();
        fetchedAgencyId = finalUserData?.agencyId;
        
        if (!fetchedAgencyId) {
          console.error('[EmbeddedSignup] ❌ Agency still not found after extended wait');
          throw new Error('Agency creation is taking longer than expected. The account was created but agency setup failed. Please refresh the page - if the issue persists, contact support.');
        }
      }

      // Set agency ID (this should always be set by now)
      if (fetchedAgencyId) {
        setAgencyId(fetchedAgencyId);
      } else {
        throw new Error('Agency ID is missing. Please try again.');
      }

      // Update agency name if provided
      if (step1Data.agencyName && step1Data.agencyName.trim()) {
        try {
          await setDoc(
            doc(db, 'agencies', fetchedAgencyId),
            { name: step1Data.agencyName.trim() },
            { merge: true }
          );
          console.log(`[EmbeddedSignup] ✅ Updated agency name to: ${step1Data.agencyName.trim()}`);
        } catch (nameError: any) {
          console.warn('[EmbeddedSignup] ⚠️ Failed to update agency name:', nameError);
          // Don't fail the whole signup if name update fails
        }
      }

      // Verify we have both userId and agencyId before advancing
      if (!userId || !fetchedAgencyId) {
        console.error('[EmbeddedSignup] ❌ Missing userId or agencyId:', { userId, agencyId: fetchedAgencyId });
        throw new Error('Account setup incomplete. Please try again.');
      }

      // Move to step 2 (Business Details)
      console.log('[EmbeddedSignup] ✅ All checks passed, advancing to business details step');
      setStep(2);
      setLoading(false);
    } catch (err: any) {
      console.error('Step 1 error:', err);
      let errorMessage = 'Failed to create account';
      
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please sign in instead.';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Password must be at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setLoading(false);
      
      // If user was created but we're stuck, sign them out so they can try again
      if (userId && !agencyId) {
        console.warn('[EmbeddedSignup] ⚠️ User created but agency failed, signing out...');
        try {
          await auth.signOut();
          setUserId(null);
          setAgencyId(null);
        } catch (signOutError) {
          console.error('[EmbeddedSignup] Failed to sign out:', signOutError);
        }
      }
    }
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validation
    if (!step2Data.niche || !step2Data.country || !step2Data.timezone || !step2Data.zipCode || !step2Data.businessDescription.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      if (!agencyId) {
        throw new Error('Agency ID is missing. Please go back and try again.');
      }

      // Save business details to agency document
      await setDoc(
        doc(db, 'agencies', agencyId),
        {
          niche: step2Data.niche,
          country: step2Data.country,
          timezone: step2Data.timezone,
          zipCode: step2Data.zipCode,
          businessDescription: step2Data.businessDescription.trim(),
          location: `${step2Data.country} ${step2Data.zipCode}`, // Combined location for AI
        },
        { merge: true }
      );

      console.log('[EmbeddedSignup] ✅ Saved business details to agency');

      // Move to step 3 (Payment)
      setStep(3);
      setLoading(false);
    } catch (err: any) {
      console.error('Step 2 error:', err);
      setError(err.message || 'Failed to save business details');
      setLoading(false);
    }
  };

  // Payment Element Component
  const PaymentForm = () => {
    if (!stripePromise) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
          <p className="text-sm">
            Stripe is not configured. Please set VITE_STRIPE_PUBLISHABLE_KEY in your environment variables.
          </p>
        </div>
      );
    }

    return (
      <Elements 
        stripe={stripePromise} 
        options={{ 
          appearance: { 
            theme: 'stripe',
            variables: {
              colorPrimary: '#2563eb',
              colorBackground: '#ffffff',
              colorText: '#111827',
              colorDanger: '#ef4444',
              fontFamily: 'system-ui, sans-serif',
              spacingUnit: '4px',
              borderRadius: '8px',
            },
          },
          clientSecret: undefined, // Not needed for PaymentElement
        }}
      >
        <PaymentFormInner 
          userId={userId}
          agencyId={agencyId}
          country={step2Data.country}
          email={step1Data.email}
          onSuccess={() => setSuccess(true)}
          onError={(err: string) => setError(err)}
          loading={loading}
          setLoading={setLoading}
        />
      </Elements>
    );
  };

  if (success) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-8">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Success!</h2>
            <p className="text-gray-600 mb-4">
              Your account has been created and your 7-day free trial has started.
            </p>
            <p className="text-sm text-gray-500">
              Redirecting to your dashboard...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        {/* Badge */}
        <div className="text-center mb-6">
          <span className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium border border-blue-200">
            <Check className="w-4 h-4" />
            7-Day Free Trial • Cancel Anytime
          </span>
        </div>

        {/* Main Card */}
        <div className="bg-white border-2 border-gray-200 rounded-xl shadow-lg p-8">
          {/* Step Indicator */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {step > 1 ? <Check className="w-5 h-5" /> : '1'}
              </div>
              <div className={`w-12 h-1 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`} />
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {step > 2 ? <Check className="w-5 h-5" /> : '2'}
              </div>
              <div className={`w-12 h-1 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`} />
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                3
              </div>
            </div>
          </div>

          {/* Step 1: Create Account */}
          {step === 1 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
                Create Your Account
              </h1>
              <p className="text-gray-600 text-center mb-6 text-sm">
                Get started with your 7-day free trial
              </p>

              <form onSubmit={handleStep1Submit} className="space-y-4">
                {/* User Type Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    I am a:
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setUserType('solo')}
                      className={`px-4 py-3 rounded-lg border-2 transition-all ${
                        userType === 'solo'
                          ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                      disabled={loading}
                    >
                      Solo Business
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserType('agency')}
                      className={`px-4 py-3 rounded-lg border-2 transition-all ${
                        userType === 'agency'
                          ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                      disabled={loading}
                    >
                      Agency
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Mail className="w-4 h-4 inline mr-1" />
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={step1Data.email}
                    onChange={(e) => setStep1Data({ ...step1Data, email: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                    placeholder="you@example.com"
                    required
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Lock className="w-4 h-4 inline mr-1" />
                    Password
                  </label>
                  <input
                    type="password"
                    value={step1Data.password}
                    onChange={(e) => setStep1Data({ ...step1Data, password: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                    placeholder="••••••••"
                    required
                    minLength={6}
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Building2 className="w-4 h-4 inline mr-1" />
                    {userType === 'agency' ? 'Agency Name' : 'Business Name'}
                  </label>
                  <input
                    type="text"
                    value={step1Data.agencyName}
                    onChange={(e) => setStep1Data({ ...step1Data, agencyName: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                    placeholder={userType === 'agency' ? 'My Agency' : 'My Business'}
                    required
                    disabled={loading}
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                {/* Terms and Privacy Checkbox */}
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="acceptTerms"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    required
                  />
                  <label htmlFor="acceptTerms" className="text-sm text-gray-600">
                    By signing up, you agree to our{' '}
                    <Link to="/terms" target="_blank" className="text-blue-600 hover:text-blue-700 underline">
                      Terms of Service
                    </Link>
                    {' '}and{' '}
                    <Link to="/privacy" target="_blank" className="text-blue-600 hover:text-blue-700 underline">
                      Privacy Policy
                    </Link>
                    .
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading || !acceptedTerms}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Step 2: Business Details */}
          {step === 2 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
                Business Details
              </h1>
              <p className="text-gray-600 text-center mb-6 text-sm">
                Help us customize your SEO strategy
              </p>

              <form onSubmit={handleStep2Submit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Building2 className="w-4 h-4 inline mr-1" />
                    Niche / Industry
                  </label>
                  <select
                    value={step2Data.niche}
                    onChange={(e) => setStep2Data({ ...step2Data, niche: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-gray-900 bg-white"
                    required
                    disabled={loading}
                  >
                    <option value="">Select your niche...</option>
                    <option value="Electrician">Electrician</option>
                    <option value="Dentist">Dentist</option>
                    <option value="Real Estate">Real Estate</option>
                    <option value="Plumber">Plumber</option>
                    <option value="Lawyer">Lawyer</option>
                    <option value="Accountant">Accountant</option>
                    <option value="Restaurant">Restaurant</option>
                    <option value="Fitness">Fitness</option>
                    <option value="Beauty">Beauty</option>
                    <option value="Medical">Medical</option>
                    <option value="Home Services">Home Services</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Globe className="w-4 h-4 inline mr-1" />
                    Country
                  </label>
                  <select
                    value={step2Data.country}
                    onChange={(e) => setStep2Data({ ...step2Data, country: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-gray-900 bg-white"
                    required
                    disabled={loading}
                  >
                    <option value="">Select your country...</option>
                    <option value="US">United States</option>
                    <option value="AU">Australia</option>
                    <option value="GB">United Kingdom</option>
                    <option value="CA">Canada</option>
                    <option value="NZ">New Zealand</option>
                    <option value="IE">Ireland</option>
                    <option value="ZA">South Africa</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Timezone
                  </label>
                  <select
                    value={step2Data.timezone}
                    onChange={(e) => setStep2Data({ ...step2Data, timezone: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-gray-900 bg-white"
                    required
                    disabled={loading}
                  >
                    <optgroup label="United States & Canada">
                      <option value="America/New_York">Eastern Time (ET)</option>
                      <option value="America/Chicago">Central Time (CT)</option>
                      <option value="America/Denver">Mountain Time (MT)</option>
                      <option value="America/Los_Angeles">Pacific Time (PT)</option>
                      <option value="America/Toronto">Toronto (ET)</option>
                      <option value="America/Vancouver">Vancouver (PT)</option>
                    </optgroup>
                    <optgroup label="Australia">
                      <option value="Australia/Sydney">Sydney (AEST)</option>
                      <option value="Australia/Melbourne">Melbourne (AEST)</option>
                      <option value="Australia/Brisbane">Brisbane (AEST)</option>
                      <option value="Australia/Perth">Perth (AWST)</option>
                      <option value="Australia/Adelaide">Adelaide (ACST)</option>
                      <option value="Australia/Darwin">Darwin (ACST)</option>
                    </optgroup>
                    <optgroup label="Europe">
                      <option value="Europe/London">London (GMT)</option>
                      <option value="Europe/Dublin">Dublin (GMT)</option>
                      <option value="Europe/Paris">Paris (CET)</option>
                      <option value="Europe/Berlin">Berlin (CET)</option>
                      <option value="Europe/Madrid">Madrid (CET)</option>
                    </optgroup>
                    <optgroup label="Other">
                      <option value="Pacific/Auckland">Auckland (NZST)</option>
                      <option value="Asia/Tokyo">Tokyo (JST)</option>
                      <option value="Asia/Singapore">Singapore (SGT)</option>
                      <option value="Asia/Hong_Kong">Hong Kong (HKT)</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <MapPin className="w-4 h-4 inline mr-1" />
                    Zip / Postal Code
                  </label>
                  <input
                    type="text"
                    value={step2Data.zipCode}
                    onChange={(e) => setStep2Data({ ...step2Data, zipCode: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                    placeholder="12345"
                    required
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <FileText className="w-4 h-4 inline mr-1" />
                    Business Description
                  </label>
                  <textarea
                    value={step2Data.businessDescription}
                    onChange={(e) => setStep2Data({ ...step2Data, businessDescription: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-gray-900 placeholder:text-gray-400 resize-none"
                    placeholder="Briefly describe what you do..."
                    rows={4}
                    required
                    disabled={loading}
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue to Payment</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Step 3: Payment Details */}
          {step === 3 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
                Payment Details
              </h1>
              <p className="text-gray-600 text-center mb-2 text-sm">
                Your card won't be charged until after your 7-day free trial
              </p>
              {step2Data.country && (
                <p className="text-gray-700 text-center mb-6 text-base font-semibold">
                  {formatPrice(99, step2Data.country)}/month after trial
                </p>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}

              {userId && agencyId ? (
                <PaymentForm />
              ) : (
                <div className="text-gray-500 text-sm text-center py-4">
                  Loading payment form...
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
