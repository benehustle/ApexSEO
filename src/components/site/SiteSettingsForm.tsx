import React, { useState, useEffect } from 'react';
import { siteService } from '../../services/site.service';
import { wordpressService } from '../../services/wordpress.service';
import { useToast } from '../Toast';
import { Site } from '../../types/site';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { 
  ChevronDown, 
  ChevronUp, 
  TestTube, 
  CheckCircle, 
  XCircle, 
  Save,
  Globe,
  Link as LinkIcon,
  Youtube,
  MapPin,
  Zap,
  Plus,
  X,
  Tag
} from 'lucide-react';

interface SiteSettingsFormProps {
  siteId: string;
  site: Site | null;
  onUpdate?: () => void;
}

export const SiteSettingsForm: React.FC<SiteSettingsFormProps> = ({ 
  siteId, 
  site,
  onUpdate 
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['wordpress', 'seo', 'integrations', 'location', 'automation', 'keywords']));
  const [keywordInput, setKeywordInput] = useState('');
  const [targetedKeywords, setTargetedKeywords] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    // WordPress Connection
    wordpressApiUrl: '',
    wordpressUsername: '',
    wordpressAppPassword: '',
    
    // SEO & Content Config
    targetAudience: '',
    sitemapUrl: '',
    offerUrl: '',
    offerDetails: '',
    
    // External Integrations
    youtubeApiKey: '',
    youtubeChannelId: '',
    
    // Location & Localization
    targetCountry: '',
    targetCity: '',
    targetPostalCode: '',
    
    // Automation Controls
    postingFrequency: 3,
    autoApprove: false,
  });

  // Load site data into form
  useEffect(() => {
    if (site) {
      setFormData({
        wordpressApiUrl: site.wordpressApiUrl || '',
        wordpressUsername: site.wordpressUsername || '',
        wordpressAppPassword: site.wordpressAppPassword || '',
        targetAudience: site.targetAudience || '',
        sitemapUrl: site.sitemapUrl || '',
        offerUrl: (site as any).offerUrl || '',
        offerDetails: (site as any).offerDetails || '',
        youtubeApiKey: (site as any).youtubeApiKey || '',
        youtubeChannelId: (site as any).youtubeChannelId || '',
        targetCountry: (site as any).targetCountry || '',
        targetCity: (site as any).targetCity || '',
        targetPostalCode: (site as any).targetPostalCode || '',
        postingFrequency: (site as any).postingFrequency ?? 3,
        autoApprove: (site as any).autoApprove ?? false,
      });
      // Load targeted keywords
      const keywords = (site as any).targetedKeywords || [];
      setTargetedKeywords(Array.isArray(keywords) ? keywords : []);
    }
  }, [site]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const handleTestConnection = async () => {
    if (!formData.wordpressApiUrl || !formData.wordpressUsername || !formData.wordpressAppPassword) {
      setTestResult({ 
        success: false, 
        message: 'Please fill in all WordPress connection fields' 
      });
      return;
    }

    setTestingConnection(true);
    setTestResult(null);

    try {
      const isConnected = await wordpressService.testConnection(
        formData.wordpressApiUrl,
        formData.wordpressUsername,
        formData.wordpressAppPassword
      );

      if (isConnected) {
        setTestResult({ 
          success: true, 
          message: '✅ Connection successful! Your WordPress credentials are valid.' 
        });
      } else {
        setTestResult({ 
          success: false, 
          message: '❌ Connection failed. Please check your credentials and try again.' 
        });
      }
    } catch (error: any) {
      setTestResult({ 
        success: false, 
        message: `❌ Error: ${error.message || 'Connection failed'}` 
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleAddKeyword = async () => {
    if (!keywordInput.trim()) {
      showToast('error', 'Please enter a keyword');
      return;
    }

    const keyword = keywordInput.trim();
    
    // Check if keyword already exists (case-insensitive)
    if (targetedKeywords.some(k => k.toLowerCase() === keyword.toLowerCase())) {
      showToast('error', 'This keyword already exists');
      setKeywordInput('');
      return;
    }

    try {
      const siteRef = doc(db, 'sites', siteId);
      await updateDoc(siteRef, {
        targetedKeywords: arrayUnion(keyword),
      });
      
      setTargetedKeywords([...targetedKeywords, keyword]);
      setKeywordInput('');
      showToast('success', 'Keyword added successfully');
    } catch (error: any) {
      console.error('Error adding keyword:', error);
      showToast('error', `Failed to add keyword: ${error.message || 'Unknown error'}`);
    }
  };

  const handleRemoveKeyword = async (keywordToRemove: string) => {
    try {
      const siteRef = doc(db, 'sites', siteId);
      await updateDoc(siteRef, {
        targetedKeywords: arrayRemove(keywordToRemove),
      });
      
      setTargetedKeywords(targetedKeywords.filter(k => k !== keywordToRemove));
      showToast('success', 'Keyword removed successfully');
    } catch (error: any) {
      console.error('Error removing keyword:', error);
      showToast('error', `Failed to remove keyword: ${error.message || 'Unknown error'}`);
    }
  };

  const handleSave = async () => {
    if (!site) return;

    setLoading(true);
    try {
      const updates: any = {
        wordpressApiUrl: formData.wordpressApiUrl,
        wordpressUsername: formData.wordpressUsername,
        wordpressAppPassword: formData.wordpressAppPassword,
        targetAudience: formData.targetAudience,
        sitemapUrl: formData.sitemapUrl || null,
        offerUrl: formData.offerUrl || null,
        offerDetails: formData.offerDetails || null,
        youtubeApiKey: formData.youtubeApiKey || null,
        youtubeChannelId: formData.youtubeChannelId || null,
        targetCountry: formData.targetCountry || null,
        targetCity: formData.targetCity || null,
        targetPostalCode: formData.targetPostalCode || null,
        postingFrequency: formData.postingFrequency,
        autoApprove: formData.autoApprove,
      };

      // Remove empty strings and undefined values - Firestore doesn't allow undefined
      Object.keys(updates).forEach(key => {
        if (updates[key] === '' || updates[key] === undefined) {
          delete updates[key];
        }
      });

      await siteService.updateSite(siteId, updates);
      showToast('success', 'Settings saved successfully!');
      
      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      showToast('error', `Failed to save settings: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!site) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Loading site settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* WordPress Connection Section */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('wordpress')}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-900/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">WordPress Connection</h3>
          </div>
          {expandedSections.has('wordpress') ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {expandedSections.has('wordpress') && (
          <div className="px-6 pb-6 space-y-4 border-t border-slate-700 pt-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                WordPress API URL
              </label>
              <input
                type="url"
                value={formData.wordpressApiUrl}
                onChange={(e) => setFormData({ ...formData, wordpressApiUrl: e.target.value })}
                className="input-field"
                placeholder="https://yourdomain.com/wp-json"
              />
              <p className="text-xs text-slate-400 mt-1">
                Usually your domain + /wp-json
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                WordPress Username
              </label>
              <input
                type="text"
                value={formData.wordpressUsername}
                onChange={(e) => setFormData({ ...formData, wordpressUsername: e.target.value })}
                className="input-field"
                placeholder="your-username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Application Password
              </label>
              <input
                type="password"
                value={formData.wordpressAppPassword}
                onChange={(e) => setFormData({ ...formData, wordpressAppPassword: e.target.value })}
                className="input-field"
                placeholder="xxxx xxxx xxxx xxxx"
              />
              <p className="text-xs text-slate-400 mt-1">
                Generate in WordPress: Users → Profile → Application Passwords
              </p>
            </div>

            <button
              onClick={handleTestConnection}
              disabled={testingConnection || !formData.wordpressApiUrl || !formData.wordpressUsername || !formData.wordpressAppPassword}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <TestTube className="w-4 h-4" />
              <span>{testingConnection ? 'Testing...' : 'Test Connection'}</span>
            </button>

            {testResult && (
              <div className={`p-4 rounded-lg border flex items-center gap-3 ${
                testResult.success
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                  : 'bg-red-500/20 border-red-500/50 text-red-400'
              }`}>
                {testResult.success ? (
                  <CheckCircle className="w-5 h-5 flex-shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 flex-shrink-0" />
                )}
                <p className="text-sm">{testResult.message}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SEO & Content Config Section */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('seo')}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-900/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <LinkIcon className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">SEO & Content Config</h3>
          </div>
          {expandedSections.has('seo') ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {expandedSections.has('seo') && (
          <div className="px-6 pb-6 space-y-4 border-t border-slate-700 pt-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Target Audience
              </label>
              <textarea
                value={formData.targetAudience}
                onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                className="input-field"
                rows={3}
                placeholder="e.g., Small business owners, tech enthusiasts, marketing professionals"
              />
              <p className="text-xs text-slate-400 mt-1">
                Describe your target audience for content personalization
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Sitemap URL (for Internal Linking)
              </label>
              <input
                type="url"
                value={formData.sitemapUrl}
                onChange={(e) => setFormData({ ...formData, sitemapUrl: e.target.value })}
                className="input-field"
                placeholder={`${site.url}/wp-sitemap.xml`}
              />
              <p className="text-xs text-slate-400 mt-1">
                Leave empty to use default WordPress sitemap. Used for internal linking in blog posts.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Primary CTA Link (Offer URL)
              </label>
              <input
                type="url"
                value={formData.offerUrl}
                onChange={(e) => setFormData({ ...formData, offerUrl: e.target.value })}
                className="input-field"
                placeholder="https://yourdomain.com/offer"
              />
              <p className="text-xs text-slate-400 mt-1">
                This URL will be included as a call-to-action link at the end of generated blog posts
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Unique Offer / Hook (Optional)
              </label>
              <textarea
                value={formData.offerDetails}
                onChange={(e) => setFormData({ ...formData, offerDetails: e.target.value })}
                className="input-field"
                rows={3}
                placeholder="e.g., $100 deposit to start, 100% money back guarantee..."
              />
              <p className="text-xs text-slate-400 mt-1">
                The AI will reference this specific deal in the call-to-action.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* External Integrations Section */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('integrations')}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-900/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Youtube className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">External Integrations</h3>
          </div>
          {expandedSections.has('integrations') ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {expandedSections.has('integrations') && (
          <div className="px-6 pb-6 space-y-4 border-t border-slate-700 pt-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                YouTube API Key (Optional)
              </label>
              <input
                type="password"
                value={formData.youtubeApiKey}
                onChange={(e) => setFormData({ ...formData, youtubeApiKey: e.target.value })}
                className="input-field"
                placeholder="AIzaSy..."
              />
              <p className="text-xs text-slate-400 mt-1">
                Used for embedding relevant YouTube videos in blog posts
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                YouTube Channel ID (Optional)
              </label>
              <input
                type="text"
                value={formData.youtubeChannelId}
                onChange={(e) => setFormData({ ...formData, youtubeChannelId: e.target.value })}
                className="input-field"
                placeholder="UCxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <p className="text-xs text-slate-400 mt-1">
                For specific channel search. Leave empty to search all of YouTube
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Location & Localization Section */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('location')}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-900/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Location & Localization</h3>
          </div>
          {expandedSections.has('location') ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {expandedSections.has('location') && (
          <div className="px-6 pb-6 space-y-4 border-t border-slate-700 pt-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Target Country
              </label>
              <select
                value={formData.targetCountry}
                onChange={(e) => setFormData({ ...formData, targetCountry: e.target.value })}
                className="input-field"
              >
                <option value="">Select a country</option>
                <option value="United States">United States</option>
                <option value="Australia">Australia</option>
                <option value="United Kingdom">United Kingdom</option>
                <option value="Canada">Canada</option>
              </select>
              <p className="text-xs text-slate-400 mt-1">
                Used for local SEO targeting and content localization
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Target City
              </label>
              <input
                type="text"
                value={formData.targetCity}
                onChange={(e) => setFormData({ ...formData, targetCity: e.target.value })}
                className="input-field"
                placeholder="e.g., Gold Coast"
              />
              <p className="text-xs text-slate-400 mt-1">
                Primary city for local SEO targeting
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Postal Code
              </label>
              <input
                type="text"
                value={formData.targetPostalCode}
                onChange={(e) => setFormData({ ...formData, targetPostalCode: e.target.value })}
                className="input-field"
                placeholder="e.g., 4217"
              />
              <p className="text-xs text-slate-400 mt-1">
                Used for precise local SEO targeting
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Targeted Keywords Section */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('keywords')}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-900/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Tag className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Targeted Keywords</h3>
          </div>
          {expandedSections.has('keywords') ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {expandedSections.has('keywords') && (
          <div className="px-6 pb-6 space-y-4 border-t border-slate-700 pt-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Manual Keywords
              </label>
              <p className="text-xs text-slate-400 mb-3">
                These keywords take priority over AI-generated topics. The system will use these first when generating content.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddKeyword();
                    }
                  }}
                  className="flex-1 input-field"
                  placeholder="Enter a keyword (e.g., 'web design', 'SEO tips')"
                />
                <button
                  onClick={handleAddKeyword}
                  disabled={!keywordInput.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {/* Keywords List */}
            {targetedKeywords.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {targetedKeywords.map((keyword, index) => (
                  <div
                    key={index}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 border border-blue-500/50 rounded-lg text-sm text-blue-300"
                  >
                    <span>{keyword}</span>
                    <button
                      onClick={() => handleRemoveKeyword(keyword)}
                      className="hover:bg-blue-500/30 rounded p-0.5 transition-colors"
                      aria-label={`Remove ${keyword}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-400 text-sm">
                <Tag className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No keywords added yet. Add keywords to prioritize them in content generation.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Automation Controls Section */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('automation')}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-900/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Automation Controls</h3>
          </div>
          {expandedSections.has('automation') ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {expandedSections.has('automation') && (
          <div className="px-6 pb-6 space-y-4 border-t border-slate-700 pt-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Posting Frequency (Days)
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={formData.postingFrequency}
                onChange={(e) => setFormData({ ...formData, postingFrequency: parseInt(e.target.value) || 3 })}
                className="input-field"
                placeholder="3"
              />
              <p className="text-xs text-slate-400 mt-1">
                Number of days between scheduled posts. Default: 3 days.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="autoApprove"
                checked={formData.autoApprove}
                onChange={(e) => setFormData({ ...formData, autoApprove: e.target.checked })}
                className="mt-1 w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
              />
              <div className="flex-1">
                <label htmlFor="autoApprove" className="block text-sm font-medium text-white mb-1">
                  Auto-Approve Generated Content
                </label>
                <p className="text-xs text-slate-400">
                  If enabled, content skips the 'Pending Approval' stage and goes straight to 'Approved' status, ready for automatic publishing.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>{loading ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>
    </div>
  );
};
