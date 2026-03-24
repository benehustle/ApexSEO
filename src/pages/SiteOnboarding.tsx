import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { wordpressService } from '../services/wordpress.service';
import { useAuth } from '../hooks/useAuth';
import { useAgencyContext } from '../contexts/AgencyContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';

export const SiteOnboarding: React.FC = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const { user } = useAuth();
  const { agency, loading: agencyLoading } = useAgencyContext();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    url: '',
    wordpressApiUrl: '',
    wordpressUsername: '',
    wordpressAppPassword: '',
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

  const handleTestConnection = async () => {
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
        const result = await createSite({
          name: formData.name,
          url: formData.url,
          wordpressUrl: formData.wordpressApiUrl,
          wordpressUsername: formData.wordpressUsername,
          wordpressAppPassword: formData.wordpressAppPassword,
          industry: formData.industry,
          targetAudience: formData.targetAudience,
          brandVoice: formData.brandVoice,
          tonePreferences: formData.tonePreferences,
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
          const result = await createSite({
            name: formData.name,
            url: formData.url,
            wordpressUrl: formData.wordpressApiUrl,
            wordpressUsername: formData.wordpressUsername,
            wordpressAppPassword: formData.wordpressAppPassword,
            industry: formData.industry,
            targetAudience: formData.targetAudience,
            brandVoice: formData.brandVoice,
            tonePreferences: formData.tonePreferences,
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

  const renderStep = () => {
    switch (step) {
      case 1:
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

      case 2:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">WordPress Connection</h2>
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
          </div>
        );

      case 3:
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

      case 4:
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

      case 5:
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
            <p className="text-sm font-medium text-slate-400">Step {step} of 5</p>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`flex-1 transition-all duration-500 ease-out ${
                  s <= step ? 'bg-primary-600' : 'bg-transparent'
                } ${s !== 5 ? 'border-r border-white/20' : ''}`}
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

          {step < 5 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="btn-primary flex items-center space-x-2"
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
