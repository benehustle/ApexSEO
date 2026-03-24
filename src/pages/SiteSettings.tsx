import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { siteService } from '../services/site.service';
import { wordpressService } from '../services/wordpress.service';
import { Site } from '../types/site';
import { Save, TestTube, Trash2, RefreshCw, CheckCircle, XCircle, Mail } from 'lucide-react';

export const SiteSettings: React.FC = () => {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [activeTab, setActiveTab] = useState('general');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean; message: string} | null>(null);
  const [saving, setSaving] = useState(false);
  const [sitemapUrls, setSitemapUrls] = useState<string[]>([]);
  const [sitemapMetadata, setSitemapMetadata] = useState<Array<{url: string; title: string; metaDescription: string}>>([]);
  const [loadingSitemap, setLoadingSitemap] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSite();
  }, [siteId]);

  const loadSite = async () => {
    if (!siteId) return;
    
    setLoading(true);
    try {
      const siteData = await siteService.getSite(siteId);
      if (siteData) {
        setSite(siteData);
        
        // Load sitemap metadata if available
        if (siteData.sitemapMetadata) {
          setSitemapMetadata(siteData.sitemapMetadata);
          setSitemapUrls(siteData.sitemapMetadata.map(item => item.url));
        }
      }
    } catch (error) {
      console.error('Failed to load site:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!site) return;
    
    setTesting(true);
    setTestResult(null);
    
    try {
      const isConnected = await wordpressService.testConnection(
        site.wordpressApiUrl,
        site.wordpressUsername,
        site.wordpressAppPassword
      );

      if (isConnected) {
        setTestResult({ success: true, message: 'Connection successful!' });
        await siteService.updateSite(site.id, { status: 'connected' });
        
        // Fetch sitemap
        try {
          const urls = await wordpressService.fetchSitemap(site.url, site.sitemapUrl);
          setSitemapUrls(urls);
        } catch (error) {
          console.error('Failed to fetch sitemap:', error);
        }
      } else {
        setTestResult({ success: false, message: 'Connection failed. Please check your credentials.' });
        await siteService.updateSite(site.id, { status: 'error' });
      }
      
      loadSite();
    } catch (error: any) {
      setTestResult({ success: false, message: `Error: ${error.message || 'Connection failed'}` });
      await siteService.updateSite(site.id, { status: 'error' });
    } finally {
      setTesting(false);
    }
  };

  const handleRefreshSitemap = async () => {
    if (!site) return;
    
    try {
      const urls = await wordpressService.fetchSitemap(site.url, site.sitemapUrl);
      setSitemapUrls(urls);
      alert(`Found ${urls.length} URLs in sitemap`);
    } catch (error: any) {
      alert('Failed to fetch sitemap: ' + (error.message || error));
    }
  };

  const handleFetchSitemapWithMetadata = async () => {
    if (!site || !siteId) return;

    setLoadingSitemap(true);
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../config/firebase');
      const fetchSitemapWithMetadataFn = httpsCallable(functions, 'fetchSitemapWithMetadata');

      const result = await fetchSitemapWithMetadataFn({
        siteUrl: site.url,
        customSitemapUrl: site.sitemapUrl,
      });

      const data = result.data as {
        urls: string[];
        metadata: Array<{url: string; title: string; metaDescription: string}>;
        totalUrls?: number;
        processedUrls?: number;
      };

      setSitemapMetadata(data.metadata);
      setSitemapUrls(data.urls);

      // Save to site document
      await siteService.updateSite(siteId, {
        sitemapMetadata: data.metadata,
      });

      const totalCount = data.totalUrls ?? data.urls?.length ?? data.metadata.length;
      const processedCount = data.processedUrls ?? data.metadata.length;
      const message = totalCount > processedCount
        ? `✅ Successfully fetched ${processedCount} pages with metadata (out of ${totalCount} total URLs found).`
        : `✅ Successfully fetched ${data.metadata.length} pages with metadata!`;
      alert(message);
    } catch (error: any) {
      console.error('Failed to fetch sitemap with metadata:', error);
      const errorMessage = error.message || error.code || error || 'Unknown error';
      const errorDetails = error.details || '';
      alert(`Failed to fetch sitemap with metadata: ${errorMessage}${errorDetails ? `\n\nDetails: ${errorDetails}` : ''}\n\nPlease check:\n1. Your WordPress site is accessible\n2. The sitemap URL is correct\n3. Your site allows external requests`);
    } finally {
      setLoadingSitemap(false);
    }
  };

  const handleSave = async () => {
    if (!site) return;

    if (site.receiveMonthlyReport) {
      const email = (site.clientReportEmail || '').trim();
      if (!email) {
        alert('Please enter a client report email when "Receive monthly report" is enabled.');
        return;
      }
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(email)) {
        alert('Please enter a valid email address for the client report.');
        return;
      }
    }

    setSaving(true);
    try {
      await siteService.updateSite(site.id, site);
      alert('✅ Settings saved successfully!');
      loadSite();
    } catch (error: any) {
      alert('❌ Failed to save settings: ' + (error.message || error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!site) return;
    
    if (confirm('⚠️ Are you sure you want to delete this site? This will also delete all associated blogs. This action cannot be undone.')) {
      try {
        await siteService.deleteSite(site.id);
        navigate('/dashboard');
      } catch (error: any) {
        alert('Failed to delete site: ' + (error.message || error));
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-center">
          <p className="text-slate-400 mb-4">Site not found</p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">{site.name}</h1>
          <a 
            href={site.url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-blue-400 hover:text-blue-300 hover:underline"
          >
            {site.url}
          </a>
        </div>

        {/* Tabs */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 shadow">
          <div className="border-b border-slate-700">
            <div className="flex space-x-8 px-6 overflow-x-auto">
              {['general', 'wordpress', 'sitemap', 'brand', 'publishing', 'reports', 'danger'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-4 border-b-2 transition-colors capitalize whitespace-nowrap ${
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

          {/* Tab Content */}
          <div className="p-6">
            {/* General Tab */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Site Name</label>
                  <input
                    type="text"
                    value={site.name}
                    onChange={(e) => setSite({ ...site, name: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Site URL</label>
                  <input
                    type="url"
                    value={site.url}
                    onChange={(e) => setSite({ ...site, url: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Industry</label>
                  <input
                    type="text"
                    value={site.industry}
                    onChange={(e) => setSite({ ...site, industry: e.target.value })}
                    className="input-field"
                    placeholder="Technology, Health, Finance, etc."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Country</label>
                    <select
                      value={site.country || ''}
                      onChange={(e) => setSite({ ...site, country: e.target.value })}
                      className="input-field"
                    >
                      <option value="">Select Country</option>
                      <option value="US">United States</option>
                      <option value="AU">Australia</option>
                      <option value="GB">United Kingdom</option>
                      <option value="CA">Canada</option>
                      <option value="NZ">New Zealand</option>
                      <option value="IE">Ireland</option>
                      <option value="ZA">South Africa</option>
                      <option value="IN">India</option>
                      <option value="SG">Singapore</option>
                      <option value="MY">Malaysia</option>
                    </select>
                    <p className="text-xs text-slate-400 mt-1">Used for location-based keywords and spelling</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Postcode / ZIP</label>
                    <input
                      type="text"
                      value={site.postcode || ''}
                      onChange={(e) => setSite({ ...site, postcode: e.target.value.toUpperCase() })}
                      className="input-field"
                      placeholder="e.g., 90210, SW1A 1AA, 2000"
                    />
                    <p className="text-xs text-slate-400 mt-1">Used for local SEO keyword targeting</p>
                  </div>
                </div>
              </div>
            )}

            {/* Sitemap Tab */}
            {activeTab === 'sitemap' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Sitemap Pages</h3>
                    <p className="text-sm text-slate-300 mt-1">
                      Full sitemap with meta titles and descriptions. This data is used by the blog generator for internal linking.
                    </p>
                  </div>
                  <button
                    onClick={handleFetchSitemapWithMetadata}
                    disabled={loadingSitemap || !site || site.status !== 'connected'}
                    className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingSitemap ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Fetching...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        <span>Fetch Sitemap & Metadata</span>
                      </>
                    )}
                  </button>
                </div>

                {site.status !== 'connected' && (
                  <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4">
                    <p className="text-sm text-yellow-400">
                      ⚠️ Please connect your WordPress site first in the WordPress tab before fetching the sitemap.
                    </p>
                  </div>
                )}

                {sitemapMetadata.length > 0 ? (
                  <div className="border border-slate-700 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                      <table className="min-w-full divide-y divide-slate-700">
                        <thead className="bg-slate-900/50 sticky top-0">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                              URL
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                              Title
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                              Meta Description
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-slate-800 divide-y divide-slate-700">
                          {sitemapMetadata.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/50">
                              <td className="px-4 py-3 text-sm">
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300 hover:underline truncate block max-w-xs"
                                  title={item.url}
                                >
                                  {item.url}
                                </a>
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-white max-w-md">
                                {item.title}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-300 max-w-md">
                                {item.metaDescription}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="bg-slate-900/50 px-4 py-2 border-t border-slate-700">
                      <p className="text-sm text-slate-300">
                        Total: {sitemapMetadata.length} pages
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-8 text-center">
                    <p className="text-slate-300 mb-2">No sitemap data loaded</p>
                    <p className="text-sm text-slate-400">
                      Click "Fetch Sitemap & Metadata" to load all pages with their titles and descriptions.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* WordPress Tab */}
            {activeTab === 'wordpress' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">WordPress API URL</label>
                  <input
                    type="url"
                    value={site.wordpressApiUrl}
                    onChange={(e) => setSite({ ...site, wordpressApiUrl: e.target.value })}
                    className="input-field"
                    placeholder="https://yourdomain.com/wp-json"
                  />
                  <p className="text-xs text-slate-400 mt-1">Usually your domain + /wp-json</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Username</label>
                  <input
                    type="text"
                    value={site.wordpressUsername}
                    onChange={(e) => setSite({ ...site, wordpressUsername: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Application Password</label>
                  <input
                    type="password"
                    value={site.wordpressAppPassword}
                    onChange={(e) => setSite({ ...site, wordpressAppPassword: e.target.value })}
                    className="input-field"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Generate in WordPress: Users → Profile → Application Passwords
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">XML Sitemap URL (Optional)</label>
                  <input
                    type="url"
                    value={site.sitemapUrl || ''}
                    onChange={(e) => setSite({ ...site, sitemapUrl: e.target.value || undefined })}
                    className="input-field"
                    placeholder={`${site.url}/wp-sitemap.xml`}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Leave empty to use default WordPress sitemap ({site.url}/wp-sitemap.xml). 
                    Enter custom URL if your sitemap is in a different location.
                  </p>
                </div>
                
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="btn-secondary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <TestTube className="w-4 h-4" />
                  <span>{testing ? 'Testing...' : 'Test Connection'}</span>
                </button>

                {testResult && (
                  <div className={`p-4 rounded-lg flex items-center space-x-2 border ${
                    testResult.success ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-red-500/20 text-red-400 border-red-500/50'
                  }`}>
                    {testResult.success ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <XCircle className="w-5 h-5" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}

                <div className="mt-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-white">Connection Status</p>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      site.status === 'connected' 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      {site.status === 'connected' ? '✅ Connected' : '❌ Not Connected'}
                    </span>
                  </div>
                  
                  {site.status === 'connected' && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-white">Sitemap URLs</p>
                        <button
                          onClick={handleRefreshSitemap}
                          className="text-sm text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                        >
                          <RefreshCw className="w-4 h-4" />
                          <span>Refresh</span>
                        </button>
                      </div>
                      <p className="text-sm text-slate-300 mb-2">
                        {sitemapUrls.length > 0 ? `Found ${sitemapUrls.length} URLs` : 'Click refresh to fetch sitemap'}
                      </p>
                      {sitemapUrls.length > 0 && (
                        <div className="mt-3 max-h-60 overflow-y-auto border border-slate-700 rounded-lg p-3 bg-slate-800">
                          <p className="text-xs font-medium text-slate-300 mb-2">Sitemap URLs ({sitemapUrls.length}):</p>
                          <ul className="space-y-1">
                            {sitemapUrls.slice(0, 50).map((url, idx) => (
                              <li key={idx} className="text-xs text-slate-400 truncate" title={url}>
                                {idx + 1}. {url}
                              </li>
                            ))}
                            {sitemapUrls.length > 50 && (
                              <li className="text-xs text-slate-500 italic">
                                ... and {sitemapUrls.length - 50} more URLs
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Brand Tab */}
            {activeTab === 'brand' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Target Audience</label>
                  <textarea
                    value={site.targetAudience}
                    onChange={(e) => setSite({ ...site, targetAudience: e.target.value })}
                    className="input-field"
                    rows={3}
                    placeholder="Small business owners, tech enthusiasts, etc."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Brand Voice</label>
                  <textarea
                    value={site.brandVoice}
                    onChange={(e) => setSite({ ...site, brandVoice: e.target.value })}
                    className="input-field"
                    rows={3}
                    placeholder="Professional yet approachable, data-driven, etc."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Content Goals</label>
                  <textarea
                    value={site.contentGoals}
                    onChange={(e) => setSite({ ...site, contentGoals: e.target.value })}
                    className="input-field"
                    rows={3}
                    placeholder="Drive traffic, generate leads, establish thought leadership"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Primary Keywords (comma-separated)</label>
                  <input
                    type="text"
                    value={site.primaryKeywords.join(', ')}
                    onChange={(e) => setSite({ 
                      ...site, 
                      primaryKeywords: e.target.value.split(',').map(k => k.trim()).filter(k => k)
                    })}
                    className="input-field"
                    placeholder="SEO, content marketing, digital strategy"
                  />
                </div>
              </div>
            )}

            {/* Publishing Tab */}
            {activeTab === 'publishing' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Blogs Per Week</label>
                  <select
                    value={site.blogsPerWeek}
                    onChange={(e) => setSite({ ...site, blogsPerWeek: Number(e.target.value) })}
                    className="input-field"
                  >
                    <option value={1}>1 post per week</option>
                    <option value={2}>2 posts per week</option>
                    <option value={3}>3 posts per week</option>
                    <option value={5}>5 posts per week</option>
                    <option value={7}>Daily</option>
                  </select>
                </div>
                <div className="flex items-center space-x-3 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                  <input
                    type="checkbox"
                    id="autoApprove"
                    checked={site.autoApproveBlogs || false}
                    onChange={(e) => setSite({ ...site, autoApproveBlogs: e.target.checked })}
                    className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <label htmlFor="autoApprove" className="block text-sm font-medium text-white cursor-pointer">
                      Auto-approve blog posts
                    </label>
                    <p className="text-xs text-slate-400 mt-1">
                      When enabled, generated blog posts will be automatically approved and published on their scheduled date without manual review.
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Content Restrictions</label>
                  <textarea
                    value={site.contentRestrictions}
                    onChange={(e) => setSite({ ...site, contentRestrictions: e.target.value })}
                    className="input-field"
                    rows={4}
                    placeholder="Topics to avoid, style guidelines, required elements, etc."
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    AI will follow these guidelines when generating content
                  </p>
                </div>
              </div>
            )}

            {/* Client report / Monthly report Tab */}
            {activeTab === 'reports' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Mail className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-semibold text-white">Monthly client report</h3>
                </div>
                <p className="text-sm text-slate-300">
                  Send a monthly summary of this site’s stats to your client. The report day is set in Agency settings (Reports & branding).
                </p>
                <div>
                  <label className="block text-sm font-medium mb-2">Client report email</label>
                  <input
                    type="email"
                    value={site.clientReportEmail ?? ''}
                    onChange={(e) => setSite({ ...site, clientReportEmail: e.target.value.trim() || undefined })}
                    className="input-field"
                    placeholder="client@example.com"
                  />
                  <p className="text-xs text-slate-400 mt-1">Email address that will receive the monthly report.</p>
                </div>
                <div className="flex items-center space-x-3 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                  <input
                    type="checkbox"
                    id="receiveMonthlyReport"
                    checked={site.receiveMonthlyReport ?? false}
                    onChange={(e) => setSite({ ...site, receiveMonthlyReport: e.target.checked })}
                    className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <label htmlFor="receiveMonthlyReport" className="block text-sm font-medium text-white cursor-pointer">
                      Receive monthly report
                    </label>
                    <p className="text-xs text-slate-400 mt-1">
                      When enabled, a monthly summary is sent to the client report email on your agency’s chosen day.
                    </p>
                  </div>
                </div>
                {site.receiveMonthlyReport && !(site.clientReportEmail ?? '').trim() && (
                  <p className="text-sm text-amber-400">Please enter a client report email above to receive the report.</p>
                )}
              </div>
            )}

            {/* Danger Zone Tab */}
            {activeTab === 'danger' && (
              <div className="space-y-4">
                <div className="border border-red-500/50 rounded-lg p-6 bg-red-500/20">
                  <h3 className="text-lg font-semibold text-red-400 mb-2">Delete Site</h3>
                  <p className="text-sm text-red-300 mb-4">
                    Deleting this site will permanently remove all associated blogs, settings, and analytics data. 
                    This action cannot be undone.
                  </p>
                  <button
                    onClick={handleDelete}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex items-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Site Permanently</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer with Save Button */}
          {activeTab !== 'danger' && (
            <div className="px-6 py-4 bg-slate-900/50 border-t border-slate-700 flex justify-end space-x-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default SiteSettings;
