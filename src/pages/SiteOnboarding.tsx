import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { wordpressService } from '../services/wordpress.service';
import { useAuth } from '../hooks/useAuth';
import { useAgencyContext } from '../contexts/AgencyContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';

const WordPressLogo: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <div className={`${className} rounded-full bg-[#21759B] text-white flex items-center justify-center font-bold`}>
    W
  </div>
);

const ShoplineLogo: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <div className={`${className} rounded-lg bg-[#00BF63] text-white flex items-center justify-center font-bold`}>
    S
  </div>
);

export const SiteOnboarding: React.FC = () => {
  const [step, setStep] = useState(1);
  const totalSteps = 6;
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const { user } = useAuth();
  const { agency, loading: agencyLoading } = useAgencyContext();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    platform: 'wordpress' as 'wordpress' | 'shopline',
    name: '',
    url: '',
    wordpressApiUrl: '',
    wordpressUsername: '',
    wordpressAppPassword: '',
    shoplineHandle: '',
    shoplineAccessToken: '',
    industry: '',
    targetAudience: '',
    brandVoice: '',
    tonePreferences: [] as string[],
    contentGoals: '',
    competitors: [] as string[],
    primaryKeywords: [] as string[],
    contentRestrictions: '',
    blogsPerWeek: 3
  });

  useEffect(() => {
    const raw = sessionStorage.getItem('shopline_oauth_result');
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as { handle?: string; accessToken?: string };
      if (parsed?.handle && parsed?.accessToken) {
        setFormData((prev) => ({
          ...prev,
          platform: 'shopline',
          shoplineHandle: parsed.handle!,
          shoplineAccessToken: parsed.accessToken!,
        }));
      }
    } catch (error) {
      console.error('Failed to parse shopline_oauth_result:', error);
    } finally {
      sessionStorage.removeItem('shopline_oauth_result');
    }
  }, []);

  const handleTestConnection = async () => {
    if (formData.platform !== 'wordpress') {
      alert('Connection testing is only available for WordPress right now.');
      return;
    }

    setTestingConnection(true);
    try {
      const isConnected = await wordpressService.testConnection(
        formData.wordpressApiUrl,
        formData.wordpressUsername,
        formData.wordpressAppPassword
      );
      if (isConnected) {
        alert('Connection successful!');
      } else {
        alert('Connection failed. Please check your credentials.');
      }
    } catch (error) {
      alert('Connection failed: ' + error);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (agencyLoading) {
      alert('Please wait while we load your agency information...');
      return;
    }
    if (!agency) {
      alert('Agency not found. Please contact support.');
      return;
    }

    setLoading(true);
    try {
      // Check billing type
      if (agency.billingType === 'internal') {
        // Internal billing: Create site immediately
        const createSite = httpsCallable(functions, 'createSiteCallable');
        const sitePayload: Record<string, any> = {
          name: formData.name,
          url: formData.url,
          platform: formData.platform,
          industry: formData.industry,
          targetAudience: formData.targetAudience,
          brandVoice: formData.brandVoice,
          tonePreferences: formData.tonePreferences,
        };

        if (formData.platform === 'wordpress') {
          sitePayload.wordpressApiUrl = formData.wordpressApiUrl;
          sitePayload.wordpressUsername = formData.wordpressUsername;
          sitePayload.wordpressAppPassword = formData.wordpressAppPassword;
        } else {
          sitePayload.shoplineHandle = formData.shoplineHandle;
          sitePayload.shoplineAccessToken = formData.shoplineAccessToken;
        }

        const result = await createSite({
          ...sitePayload,
        });
        const data = result.data as { siteId: string };
        navigate(`/sites/${data.siteId}`);
      } else if (agency.billingType === 'stripe') {
        // Stripe billing: Check subscription status
        const hasActiveSubscription = agency.subscriptionStatus === 'active';
        
        if (!hasActiveSubscription) {
          // Scenario A: No active subscription - redirect to checkout
          const confirmed = window.confirm(
            'You need an active subscription to add sites. Would you like to subscribe now?'
          );
          if (!confirmed) {
            setLoading(false);
            return;
          }

          const createCheckoutSession = httpsCallable(functions, 'createCheckoutSessionCallable');
          const result = await createCheckoutSession({
            agencyId: agency.id,
            quantity: 1,
            country: agency.country || null, // Pass country for multi-currency pricing
            successUrl: `${window.location.origin}/sites?checkout=success`,
            cancelUrl: `${window.location.origin}/onboarding?checkout=cancelled`,
          });
          const data = result.data as { url: string };
          window.location.href = data.url;
          return;
        } else {
          // Scenario B: Active subscription - increment and create site
          const confirmed = window.confirm(
            'Adding a site will update your subscription and charge you immediately. Proceed?'
          );
          if (!confirmed) {
            setLoading(false);
            return;
          }

          // Increment subscription
          const incrementSubscription = httpsCallable(functions, 'incrementSubscriptionCallable');
          await incrementSubscription({ agencyId: agency.id });

          // Then create the site
          const createSite = httpsCallable(functions, 'createSiteCallable');
          const sitePayload: Record<string, any> = {
            name: formData.name,
            url: formData.url,
            platform: formData.platform,
            industry: formData.industry,
            targetAudience: formData.targetAudience,
            brandVoice: formData.brandVoice,
            tonePreferences: formData.tonePreferences,
          };

          if (formData.platform === 'wordpress') {
            sitePayload.wordpressApiUrl = formData.wordpressApiUrl;
            sitePayload.wordpressUsername = formData.wordpressUsername;
            sitePayload.wordpressAppPassword = formData.wordpressAppPassword;
          } else {
            sitePayload.shoplineHandle = formData.shoplineHandle;
            sitePayload.shoplineAccessToken = formData.shoplineAccessToken;
          }

          const result = await createSite({
            ...sitePayload,
          });
          const data = result.data as { siteId: string };
          navigate(`/sites/${data.siteId}`);
        }
      }
    } catch (error: any) {
      console.error('Error creating site:', error);
      alert('Failed to create site: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  const canProceedToNext = () => {
    if (step === 1) return !!formData.platform;
    if (step === 2) return !!formData.name.trim() && !!formData.url.trim();
    if (step === 3) {
      if (formData.platform === 'wordpress') {
        return (
          !!formData.wordpressApiUrl.trim() &&
          !!formData.wordpressUsername.trim() &&
          !!formData.wordpressAppPassword.trim()
        );
      }
      return !!formData.shoplineHandle.trim() && !!formData.shoplineAccessToken.trim();
    }
    if (step === 4) {
      return (
        !!formData.industry.trim() &&
        !!formData.targetAudience.trim() &&
        !!formData.brandVoice.trim()
      );
    }
    if (step === 5) return !!formData.contentGoals.trim();
    return true;
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Platform</h2>
            <p className="text-sm text-slate-400">
              Select where this site will publish content.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, platform: 'wordpress' })}
                className={`p-4 rounded-lg border text-left transition-colors ${
                  formData.platform === 'wordpress'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-600 bg-slate-800 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  <WordPressLogo />
                  <div className="font-semibold">WordPress</div>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Connect with URL, username and application password
                </div>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, platform: 'shopline' })}
                className={`p-4 rounded-lg border text-left transition-colors ${
                  formData.platform === 'shopline'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-600 bg-slate-800 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  <ShoplineLogo />
                  <div className="font-semibold">Shopline</div>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Connect with your Shopline store handle and access token
                </div>
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Basic Information</h2>
            <div>
              <label className="block text-sm font-medium mb-2">Site Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input-field"
                placeholder="My Awesome Blog"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Site URL</label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                className="input-field"
                placeholder="https://myblog.com"
                required
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {formData.platform === 'wordpress' ? <WordPressLogo /> : <ShoplineLogo />}
              <h2 className="text-2xl font-bold">
                {formData.platform === 'wordpress' ? 'WordPress Connection' : 'Shopline Connection'}
              </h2>
            </div>
            {formData.platform === 'wordpress' ? (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">WordPress API URL</label>
                  <input
                    type="url"
                    value={formData.wordpressApiUrl}
                    onChange={(e) => setFormData({ ...formData, wordpressApiUrl: e.target.value })}
                    className="input-field"
                    placeholder="https://myblog.com/wp-json"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">WordPress Username</label>
                  <input
                    type="text"
                    value={formData.wordpressUsername}
                    onChange={(e) => setFormData({ ...formData, wordpressUsername: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Application Password</label>
                  <input
                    type="password"
                    value={formData.wordpressAppPassword}
                    onChange={(e) => setFormData({ ...formData, wordpressAppPassword: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="btn-secondary"
                >
                  {testingConnection ? 'Testing...' : 'Test Connection'}
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Store Handle</label>
                  <input
                    type="text"
                    value={formData.shoplineHandle}
                    onChange={(e) => setFormData({ ...formData, shoplineHandle: e.target.value })}
                    className="input-field"
                    placeholder="mystore"
                    required
                  />
                  <p className="text-xs text-slate-400 mt-1">From your store URL, e.g. mystore.myshopline.com</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Access Token</label>
                  <input
                    type="password"
                    value={formData.shoplineAccessToken}
                    onChange={(e) => setFormData({ ...formData, shoplineAccessToken: e.target.value })}
                    className="input-field"
                    placeholder="Shopline access token"
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!formData.shoplineHandle.trim()) {
                      alert('Enter your Shopline store handle first.');
                      return;
                    }
                    try {
                      const getAuthUrl = httpsCallable(functions, 'generateShoplineAuthUrlCallable');
                      const result = await getAuthUrl({
                        handle: formData.shoplineHandle.trim(),
                        returnTo: '/onboarding',
                      });
                      const data = result.data as { authUrl: string };
                      if (!data?.authUrl) {
                        throw new Error('Missing Shopline authorization URL.');
                      }
                      window.location.href = data.authUrl;
                    } catch (error: any) {
                      console.error('Failed to start Shopline OAuth:', error);
                      alert(error.message || 'Failed to start Shopline OAuth flow.');
                    }
                  }}
                  className="btn-secondary"
                >
                  Connect with Shopline OAuth
                </button>
                <p className="text-xs text-slate-400">
                  Prefer manual setup? Paste a valid token above instead.
                </p>
              </>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Brand Identity</h2>
            <div>
              <label className="block text-sm font-medium mb-2">Industry</label>
              <input
                type="text"
                value={formData.industry}
                onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                className="input-field"
                placeholder="Technology, Health, Finance, etc."
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Target Audience</label>
              <textarea
                value={formData.targetAudience}
                onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                className="input-field"
                rows={3}
                placeholder="Small business owners, tech enthusiasts, etc."
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Brand Voice</label>
              <textarea
                value={formData.brandVoice}
                onChange={(e) => setFormData({ ...formData, brandVoice: e.target.value })}
                className="input-field"
                rows={3}
                placeholder="Professional yet approachable, data-driven, etc."
                required
              />
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Content Strategy</h2>
            <div>
              <label className="block text-sm font-medium mb-2">Content Goals</label>
              <textarea
                value={formData.contentGoals}
                onChange={(e) => setFormData({ ...formData, contentGoals: e.target.value })}
                className="input-field"
                rows={3}
                placeholder="Drive traffic, generate leads, establish thought leadership, etc."
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Primary Keywords (comma-separated)</label>
              <input
                type="text"
                onChange={(e) => setFormData({ ...formData, primaryKeywords: e.target.value.split(',').map(k => k.trim()) })}
                className="input-field"
                placeholder="SEO, content marketing, digital strategy"
              />
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Publishing Settings</h2>
            <div>
              <label className="block text-sm font-medium mb-2">Blogs Per Week</label>
              <select
                value={formData.blogsPerWeek}
                onChange={(e) => setFormData({ ...formData, blogsPerWeek: Number(e.target.value) })}
                className="input-field"
              >
                <option value={1}>1 post per week</option>
                <option value={2}>2 posts per week</option>
                <option value={3}>3 posts per week</option>
                <option value={5}>5 posts per week</option>
                <option value={7}>Daily</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Content Restrictions</label>
              <textarea
                value={formData.contentRestrictions}
                onChange={(e) => setFormData({ ...formData, contentRestrictions: e.target.value })}
                className="input-field"
                rows={3}
                placeholder="Topics to avoid, style guidelines, etc."
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 animate-slide-in">
      <div className="card p-8">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-xl font-bold text-white">Site Setup</h1>
            <p className="text-sm font-medium text-slate-400">Step {step} of {totalSteps}</p>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
              <div
                key={s}
                className={`flex-1 transition-all duration-500 ease-out ${
                  s <= step ? 'bg-primary-600' : 'bg-transparent'
                } ${s !== totalSteps ? 'border-r border-white/20' : ''}`}
              />
            ))}
          </div>
        </div>

        {renderStep()}

        <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
          <button
            onClick={() => setStep(step - 1)}
            disabled={step === 1}
            className="btn-secondary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          {step < totalSteps ? (
            <button
              onClick={() => setStep(Math.min(totalSteps, step + 1))}
              disabled={!canProceedToNext()}
              className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Next Step</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Creating...' : 'Complete Setup'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
