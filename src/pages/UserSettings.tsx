import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePreferences } from '../hooks/usePreferences';
import { useAgencyContext } from '../contexts/AgencyContext';
import { RefreshCw, Loader2, Building2, CreditCard, AlertCircle } from 'lucide-react';
import { useToast } from '../components/Toast';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { format } from 'date-fns';

export const UserSettings: React.FC = () => {
  const { preferences, updatePreferences, resetPreferences } = usePreferences();
  const { showToast } = useToast();
  const { agencyId, agency, loading: agencyLoading } = useAgencyContext();
  const [initializingAgency, setInitializingAgency] = useState(false);
  const [repairingAgency, setRepairingAgency] = useState(false);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('general');
  const [loadingPortal, setLoadingPortal] = useState(false);

  // Check URL parameter for tab
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['general', 'billing', 'notifications', 'content', 'advanced'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleInitializeAgency = async () => {
    if (!window.confirm('Initialize your agency? This will create an agency for your account if one doesn\'t exist.')) {
      return;
    }

    setInitializingAgency(true);
    try {
      const ensureAgency = httpsCallable(functions, 'ensureAgencyExistsCallable');
      const result = await ensureAgency({});
      const data = result.data as { success: boolean; agencyId: string; action: string };
      
      if (data.success) {
        showToast('success', `Agency ${data.action === 'created' ? 'created' : 'verified'} successfully!`);
        // The useAgency hook will automatically update via the real-time listener
      } else {
        showToast('error', 'Failed to initialize agency');
      }
    } catch (error: any) {
      console.error('Error initializing agency:', error);
      showToast('error', error.message || 'Failed to initialize agency');
    } finally {
      setInitializingAgency(false);
    }
  };

  const handleRepairAgencyData = async () => {
    if (!window.confirm('Repair Agency Data? This will link all your sites to your current agency. This action cannot be undone.')) {
      return;
    }

    setRepairingAgency(true);
    try {
      const repairAgency = httpsCallable(functions, 'repairAgencyDataCallable');
      const result = await repairAgency({});
      const data = result.data as { success: boolean; updatedCount: number; agencyId: string; totalSites: number };
      
      if (data.success) {
        showToast('success', `Repair complete! Updated ${data.updatedCount} of ${data.totalSites} sites.`);
        // The useAgency hook will automatically update via the real-time listener
      } else {
        showToast('error', 'Failed to repair agency data');
      }
    } catch (error: any) {
      console.error('Error repairing agency data:', error);
      showToast('error', error.message || 'Failed to repair agency data');
    } finally {
      setRepairingAgency(false);
    }
  };

  if (!preferences) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const handleSave = async (updates: any) => {
    try {
      await updatePreferences(updates);
      showToast('success', 'Preferences saved successfully');
    } catch (error) {
      showToast('error', 'Failed to save preferences');
    }
  };

  const handleReset = async () => {
    if (confirm('Reset all preferences to default values?')) {
      try {
        await resetPreferences();
        showToast('success', 'Preferences reset to defaults');
      } catch (error) {
        showToast('error', 'Failed to reset preferences');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="text-slate-400">Customize your experience</p>
        </div>

        <div className="bg-slate-800 rounded-lg border border-slate-700 shadow">
          <div className="border-b border-slate-700">
            <div className="flex space-x-8 px-6">
              {['general', 'billing', 'notifications', 'content', 'advanced'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-4 border-b-2 transition-colors capitalize ${
                    activeTab === tab
                      ? 'border-blue-600 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {activeTab === 'billing' && (
              <div className="space-y-6">
                {agencyLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                  </div>
                ) : agencyId && agency ? (
                  <>
                    {/* Subscription Status */}
                    <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-6">
                      <h3 className="text-lg font-semibold text-white mb-4">Subscription Status</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Status:</span>
                          <span className={`font-medium ${
                            agency.subscriptionStatus === 'active' 
                              ? 'text-green-400' 
                              : agency.subscriptionStatus === 'trial'
                              ? 'text-blue-400'
                              : agency.subscriptionStatus === 'canceled'
                              ? 'text-red-400'
                              : 'text-amber-400'
                          }`}>
                            {agency.subscriptionStatus === 'active' && '✓ Active'}
                            {agency.subscriptionStatus === 'trial' && '⏱ Trial'}
                            {agency.subscriptionStatus === 'canceled' && '✗ Canceled'}
                            {agency.subscriptionStatus === 'past_due' && '⚠ Past Due'}
                            {!agency.subscriptionStatus && 'Unknown'}
                          </span>
                        </div>
                        {agency.subscriptionStatus === 'trial' && agency.trialEndsAt && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Trial Ends:</span>
                            <span className="text-white">
                              {format(agency.trialEndsAt, 'MMM d, yyyy')}
                            </span>
                          </div>
                        )}
                        {agency.subscriptionStatus === 'canceled' && agency.trialEndsAt && (
                          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                            <div className="flex items-start gap-3">
                              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-red-400 font-medium mb-1">
                                  Your plan expires on {format(agency.trialEndsAt, 'MMM d, yyyy')}
                                </p>
                                <p className="text-sm text-slate-400">
                                  Reactivate to keep your SEO rankings and continue growing your traffic.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Billing Type:</span>
                          <span className="text-white capitalize">{agency.billingType}</span>
                        </div>
                      </div>
                    </div>

                    {/* Manage Subscription Button */}
                    {agency.billingType === 'stripe' && (
                      <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Manage Subscription</h3>
                        <p className="text-slate-400 text-sm mb-4">
                          Update your payment method, view invoices, or cancel your subscription.
                        </p>
                        <button
                          onClick={async () => {
                            if (!agencyId) {
                              showToast('error', 'Agency not found');
                              return;
                            }

                            if (agency.billingType !== 'stripe') {
                              showToast('info', 'Billing management is only available for Stripe subscriptions');
                              return;
                            }

                            setLoadingPortal(true);
                            try {
                              const createPortalSession = httpsCallable(functions, 'createPortalSessionCallable');
                              const result = await createPortalSession({
                                returnUrl: `${window.location.origin}/settings?tab=billing`,
                              });
                              const data = result.data as { url: string };
                              window.location.href = data.url;
                            } catch (error: any) {
                              console.error('Error creating portal session:', error);
                              showToast('error', error.message || 'Failed to open billing portal');
                              setLoadingPortal(false);
                            }
                          }}
                          disabled={loadingPortal}
                          className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loadingPortal ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Opening...</span>
                            </>
                          ) : (
                            <>
                              <CreditCard className="w-4 h-4" />
                              <span>Manage Subscription & Billing</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {agency.billingType !== 'stripe' && (
                      <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-6">
                        <p className="text-slate-400">
                          Billing management is only available for Stripe subscriptions.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-slate-400 mb-4">No agency found. Please initialize your agency first.</p>
                    <button
                      onClick={handleInitializeAgency}
                      disabled={initializingAgency}
                      className="btn-primary"
                    >
                      {initializingAgency ? 'Initializing...' : 'Initialize Agency'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Theme</label>
                  <select
                    value={preferences.theme}
                    onChange={(e) => handleSave({ theme: e.target.value })}
                    className="input-field"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="auto">Auto (System)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Date Format</label>
                  <select
                    value={preferences.dateFormat}
                    onChange={(e) => handleSave({ dateFormat: e.target.value as any })}
                    className="input-field"
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Time Format</label>
                  <select
                    value={preferences.timeFormat}
                    onChange={(e) => handleSave({ timeFormat: e.target.value as any })}
                    className="input-field"
                  >
                    <option value="12h">12 Hour</option>
                    <option value="24h">24 Hour</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Default View</label>
                  <select
                    value={preferences.defaultView}
                    onChange={(e) => handleSave({ defaultView: e.target.value as any })}
                    className="input-field"
                  >
                    <option value="calendar">Calendar</option>
                    <option value="list">List</option>
                    <option value="grid">Grid</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Blogs Per Page</label>
                  <select
                    value={preferences.blogsPerPage}
                    onChange={(e) => handleSave({ blogsPerPage: Number(e.target.value) as any })}
                    className="input-field"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-slate-700">
                  <div>
                    <p className="font-medium text-white">Blog Published</p>
                    <p className="text-sm text-slate-400">Get notified when a blog is published</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.emailNotifications.blogPublished}
                    onChange={(e) => handleSave({
                      emailNotifications: {
                        ...preferences.emailNotifications,
                        blogPublished: e.target.checked
                      }
                    })}
                    className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-700">
                  <div>
                    <p className="font-medium text-white">Approval Needed</p>
                    <p className="text-sm text-slate-400">When blogs need your approval</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.emailNotifications.blogApprovalNeeded}
                    onChange={(e) => handleSave({
                      emailNotifications: {
                        ...preferences.emailNotifications,
                        blogApprovalNeeded: e.target.checked
                      }
                    })}
                    className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-700">
                  <div>
                    <p className="font-medium text-white">Daily Digest</p>
                    <p className="text-sm text-slate-400">Daily summary of activity</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.emailNotifications.dailyDigest}
                    onChange={(e) => handleSave({
                      emailNotifications: {
                        ...preferences.emailNotifications,
                        dailyDigest: e.target.checked
                      }
                    })}
                    className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-700">
                  <div>
                    <p className="font-medium text-white">Weekly Report</p>
                    <p className="text-sm text-slate-400">Weekly performance summary</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.emailNotifications.weeklyReport}
                    onChange={(e) => handleSave({
                      emailNotifications: {
                        ...preferences.emailNotifications,
                        weeklyReport: e.target.checked
                      }
                    })}
                    className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-white">Error Alerts</p>
                    <p className="text-sm text-slate-400">Critical system errors</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.emailNotifications.errorAlerts}
                    onChange={(e) => handleSave({
                      emailNotifications: {
                        ...preferences.emailNotifications,
                        errorAlerts: e.target.checked
                      }
                    })}
                    className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {activeTab === 'content' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Default Word Count</label>
                  <input
                    type="number"
                    value={preferences.defaultWordCount}
                    onChange={(e) => handleSave({ defaultWordCount: Number(e.target.value) })}
                    min={500}
                    max={5000}
                    step={100}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Default Blogs Per Week</label>
                  <select
                    value={preferences.defaultBlogsPerWeek}
                    onChange={(e) => handleSave({ defaultBlogsPerWeek: Number(e.target.value) })}
                    className="input-field"
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={5}>5</option>
                    <option value={7}>7 (Daily)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Content Temperature</label>
                  <div className="space-y-2">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={preferences.contentTemperature}
                      onChange={(e) => handleSave({ contentTemperature: Number(e.target.value) })}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Conservative (0.0)</span>
                      <span>Creative (1.0)</span>
                    </div>
                    <p className="text-sm text-slate-300">
                      Current: {preferences.contentTemperature}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Image Style Preference</label>
                  <select
                    value={preferences.imageStyle}
                    onChange={(e) => handleSave({ imageStyle: e.target.value as any })}
                    className="input-field"
                  >
                    <option value="photorealistic">Photorealistic</option>
                    <option value="illustration">Illustration</option>
                    <option value="abstract">Abstract</option>
                    <option value="minimal">Minimal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Tone Preference</label>
                  <select
                    value={preferences.tonePreference}
                    onChange={(e) => handleSave({ tonePreference: e.target.value as any })}
                    className="input-field"
                  >
                    <option value="professional">Professional</option>
                    <option value="casual">Casual</option>
                    <option value="friendly">Friendly</option>
                    <option value="authoritative">Authoritative</option>
                  </select>
                </div>

                <div className="flex items-center justify-between py-3 border-t border-slate-700">
                  <div>
                    <p className="font-medium text-white">Auto-Approve Blogs</p>
                    <p className="text-sm text-slate-400">Skip manual approval step</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.autoApprove}
                    onChange={(e) => handleSave({ autoApprove: e.target.checked })}
                    className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-white">Require Image Review</p>
                    <p className="text-sm text-slate-400">Review images before publishing</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.requireImageReview}
                    onChange={(e) => handleSave({ requireImageReview: e.target.checked })}
                    className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="space-y-6">
                {/* Agency Management Section */}
                <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="w-5 h-5 text-blue-400" />
                    <h3 className="font-semibold text-white">Agency Management</h3>
                  </div>
                  
                  {agencyLoading ? (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Loading agency information...</span>
                    </div>
                  ) : agencyId && agency ? (
                    <div className="space-y-2">
                      <div className="text-sm">
                        <span className="text-slate-400">Agency:</span>
                        <span className="text-white ml-2 font-medium">{agency.name}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-slate-400">Agency ID:</span>
                        <span className="text-white ml-2 font-mono text-xs">{agencyId}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-slate-400">Billing Type:</span>
                        <span className="text-white ml-2 capitalize">{agency.billingType}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-slate-400">Members:</span>
                        <span className="text-white ml-2">{agency.members.length}</span>
                      </div>
                      <div className="mt-4 pt-4 border-t border-slate-600">
                        <button
                          onClick={handleRepairAgencyData}
                          disabled={repairingAgency}
                          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
                        >
                          {repairingAgency ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Repairing...</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              <span>Repair Agency Data</span>
                            </>
                          )}
                        </button>
                        <p className="text-xs text-slate-500 mt-2">
                          Links all your sites to your current agency. Use this if sites are missing after migration.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-400">
                        Your account doesn't have an agency yet. Initialize your agency to start using the platform.
                      </p>
                      <button
                        onClick={handleInitializeAgency}
                        disabled={initializingAgency}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                      >
                        {initializingAgency ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Initializing...</span>
                          </>
                        ) : (
                          <>
                            <Building2 className="w-4 h-4" />
                            <span>Initialize Agency</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-700">
                  <div>
                    <p className="font-medium text-white">Enable Beta Features</p>
                    <p className="text-sm text-slate-400">Try experimental features early</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.enableBetaFeatures}
                    onChange={(e) => handleSave({ enableBetaFeatures: e.target.checked })}
                    className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-700">
                  <div>
                    <p className="font-medium text-white">Show Analytics Tips</p>
                    <p className="text-sm text-slate-400">Helpful hints in analytics</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.showAnalyticsTips}
                    onChange={(e) => handleSave({ showAnalyticsTips: e.target.checked })}
                    className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-white">Compact Mode</p>
                    <p className="text-sm text-slate-400">Denser UI layout</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.compactMode}
                    onChange={(e) => handleSave({ compactMode: e.target.checked })}
                    className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                </div>

                <div className="pt-6 border-t border-slate-700">
                  <button
                    onClick={handleReset}
                    className="flex items-center space-x-2 text-red-400 hover:text-red-300"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Reset All Preferences</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserSettings;
