import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { siteService } from '../services/site.service';
import { Site } from '../types/site';
import { ArrowLeft, ExternalLink, Sparkles, Loader2 } from 'lucide-react';
import { SiteCalendarList } from '../components/site/SiteCalendarList';
import { SiteSettingsForm } from '../components/site/SiteSettingsForm';
import { ContentWizard } from '../components/site/ContentWizard';
import { TargetedKeywordsList } from '../components/site/TargetedKeywordsList';
import { SitemapManager } from '../components/site/SitemapManager';
import { SiteAnalytics } from '../components/site/SiteAnalytics';

export const SiteDetailsPage: React.FC = () => {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'calendar' | 'keywords' | 'analytics' | 'sitemap' | 'settings'>('calendar');
  const [showContentWizard, setShowContentWizard] = useState(false);

  const tabs = [
    { id: 'calendar', label: 'Content Calendar' },
    { id: 'keywords', label: 'Targeted Keywords' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'sitemap', label: 'Sitemap' },
    { id: 'settings', label: 'Settings' },
  ];

  useEffect(() => {
    if (!siteId) {
      setError('Site ID is required');
      setLoading(false);
      return;
    }

    const loadSite = async () => {
      try {
        const siteData = await siteService.getSite(siteId);
        if (!siteData) {
          setError('Site not found');
          setLoading(false);
          return;
        }
        setSite(siteData);
      } catch (err) {
        console.error('Error loading site:', err);
        setError('Failed to load site');
      } finally {
        setLoading(false);
      }
    };

    loadSite();
  }, [siteId]);

  const handleGenerateNewContent = () => {
    if (!siteId || !site) return;
    setShowContentWizard(true);
  };

  const handleContentWizardComplete = () => {
    setShowContentWizard(false);
    // Optionally refresh calendar list or show success message
  };

  const handleSiteUpdate = async () => {
    if (!siteId) return;
    try {
      const siteData = await siteService.getSite(siteId);
      setSite(siteData);
    } catch (err) {
      console.error('Error reloading site:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">{error || 'Site not found'}</p>
          <button
            onClick={() => navigate('/sites')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Back to Sites
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header Section */}
      <div className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate('/sites')}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Back to Sites"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white">{site.name}</h1>
              <a
                href={site.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 mt-1"
              >
                <span>{site.url}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <button
              onClick={handleGenerateNewContent}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Generate New Content</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`py-4 border-b-2 transition-colors font-medium ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'calendar' && (
          <div data-tour="calendar-view">
            <SiteCalendarList siteId={siteId!} />
          </div>
        )}
        {activeTab === 'keywords' && <TargetedKeywordsList siteId={siteId!} />}
        {activeTab === 'analytics' && <SiteAnalytics siteId={siteId!} />}
        {activeTab === 'sitemap' && <SitemapManager siteId={siteId!} />}
        {activeTab === 'settings' && (
          <SiteSettingsForm 
            siteId={siteId!} 
            site={site}
            onUpdate={handleSiteUpdate}
          />
        )}
      </div>

      {/* Content Generation Wizard */}
      {site && (
        <ContentWizard
          siteId={siteId!}
          site={site}
          isOpen={showContentWizard}
          onClose={() => setShowContentWizard(false)}
          onComplete={handleContentWizardComplete}
        />
      )}
    </div>
  );
};
