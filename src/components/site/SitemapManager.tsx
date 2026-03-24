import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { useToast } from '../Toast';
import { RefreshCw, Loader2, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

interface SitemapManagerProps {
  siteId: string;
}

interface SiteData {
  sitemapUrl?: string;
  availableLinks?: string[];
  sitemapLastSyncedAt?: Timestamp;
}

export const SitemapManager: React.FC<SitemapManagerProps> = ({ siteId }) => {
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sitemapUrlInput, setSitemapUrlInput] = useState('');
  const { showToast } = useToast();

  // Real-time subscription to site document
  useEffect(() => {
    if (!siteId) return;

    const siteRef = doc(db, 'sites', siteId);

    const unsubscribe = onSnapshot(
      siteRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setSiteData({
            sitemapUrl: data.sitemapUrl || '',
            availableLinks: data.availableLinks || [],
            sitemapLastSyncedAt: data.sitemapLastSyncedAt,
          });
          // Set input field if sitemapUrl exists
          if (data.sitemapUrl && !sitemapUrlInput) {
            setSitemapUrlInput(data.sitemapUrl);
          }
        } else {
          setSiteData(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching site data:', error);
        showToast('error', 'Failed to load sitemap data');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [siteId, showToast]);

  const handleSync = async () => {
    if (!sitemapUrlInput.trim()) {
      showToast('error', 'Please enter a sitemap URL');
      return;
    }

    setSyncing(true);
    try {
      const fetchSitemap = httpsCallable(functions, 'fetchSitemapCallable');
      const result = await fetchSitemap({
        siteId,
        sitemapUrl: sitemapUrlInput.trim(),
      });

      const data = result.data as { success: boolean; count: number };
      if (data.success) {
        showToast('success', `Successfully synced ${data.count} URLs from sitemap`);
      } else {
        showToast('error', 'Failed to sync sitemap');
      }
    } catch (error: any) {
      console.error('Error syncing sitemap:', error);
      showToast(
        'error',
        error.message || 'Failed to sync sitemap. Please check the URL and try again.'
      );
    } finally {
      setSyncing(false);
    }
  };

  const formatLastSynced = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'Never';
    try {
      return format(timestamp.toDate(), 'PPp');
    } catch (error) {
      return 'Invalid date';
    }
  };

  const handleUrlClick = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 bg-slate-900">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  const availableLinks = siteData?.availableLinks || [];
  const linkCount = availableLinks.length;

  return (
    <div className="space-y-6 bg-slate-900 text-white">
      {/* Header Section */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h2 className="text-xl font-semibold mb-4">Sitemap Configuration</h2>
        
        <div className="space-y-4">
          {/* Sitemap URL Input */}
          <div>
            <label htmlFor="sitemapUrl" className="block text-sm font-medium text-slate-300 mb-2">
              Sitemap URL
            </label>
            <div className="flex gap-3">
              <input
                id="sitemapUrl"
                type="url"
                value={sitemapUrlInput}
                onChange={(e) => setSitemapUrlInput(e.target.value)}
                placeholder="https://example.com/sitemap.xml"
                className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleSync}
                disabled={syncing || !sitemapUrlInput.trim()}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg flex items-center gap-2 transition-colors"
              >
                {syncing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Syncing...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Sync Now</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Status Text */}
          <div className="text-sm text-slate-400">
            <span>Last synced: {formatLastSynced(siteData?.sitemapLastSyncedAt)}</span>
            {linkCount > 0 && (
              <>
                <span className="mx-2">•</span>
                <span>Found {linkCount} URL{linkCount !== 1 ? 's' : ''}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Links List */}
      <div className="bg-slate-800 rounded-lg border border-slate-700">
        <div className="p-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold">Available Links</h3>
        </div>

        {linkCount === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <p>No links found. Please sync your sitemap.</p>
          </div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-slate-800 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300 border-b border-slate-700">
                    URL
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-300 border-b border-slate-700 w-12">
                    {/* Actions column */}
                  </th>
                </tr>
              </thead>
              <tbody>
                {availableLinks.map((url, index) => (
                  <tr
                    key={index}
                    className="border-b border-slate-700 hover:bg-slate-700 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleUrlClick(url)}
                        className="text-blue-400 hover:text-blue-300 font-mono text-sm text-left break-all"
                      >
                        {url}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleUrlClick(url)}
                        className="text-slate-400 hover:text-blue-400 transition-colors"
                        title="Open in new tab"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
