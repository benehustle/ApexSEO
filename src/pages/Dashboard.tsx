import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAgencyContext } from '../contexts/AgencyContext';
import { AutoFillGapFiller } from '../components/site/AutoFillGapFiller';
import { siteService } from '../services/site.service';
import { Site } from '../types/site';
import { Plus, Settings, Calendar, TrendingUp, FileText, Archive, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { seedUser } from '../utils/seedUser';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db, functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { useToast } from '../components/Toast';

interface DashboardProps {
  overrideAgencyId?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ overrideAgencyId }) => {
  const [sites, setSites] = useState<Site[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [stats, setStats] = useState({
    totalSites: 0,
    totalBlogs: 0,
    pendingApprovals: 0,
    publishedThisMonth: 0,
    totalViews: 0
  });
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { agencyId: userAgencyId, loading: agencyLoading } = useAgencyContext();
  const navigate = useNavigate();
  const [impersonatedAgency, setImpersonatedAgency] = useState<{ id: string; name: string } | null>(null);
  const [generatingCampaign, setGeneratingCampaign] = useState(false);
  const { showToast } = useToast();

  // Determine target agency ID (override takes precedence)
  const targetAgencyId = overrideAgencyId || userAgencyId;

  // Fetch agency name if in impersonation mode
  useEffect(() => {
    const fetchAgencyName = async () => {
      if (overrideAgencyId) {
        try {
          const agencyRef = doc(db, 'agencies', overrideAgencyId);
          const agencyDoc = await getDoc(agencyRef);
          if (agencyDoc.exists()) {
            const agencyData = agencyDoc.data();
            setImpersonatedAgency({
              id: overrideAgencyId,
              name: agencyData.name || 'Unknown Agency',
            });
          }
        } catch (error) {
          console.error('[Dashboard] Error fetching agency name:', error);
          setImpersonatedAgency({
            id: overrideAgencyId,
            name: 'Unknown Agency',
          });
        }
      } else {
        setImpersonatedAgency(null);
      }
    };

    fetchAgencyName();
  }, [overrideAgencyId]);

  useEffect(() => {
    // Auto-seed user if needed (for development)
    if (user && user.uid === 'XkMHFUavXVgGV6YfapK9wBYPrbK2') {
      seedUser(user.uid, user.email || 'ben@spotonwebsites.com.au').catch(console.error);
    }
    if (!agencyLoading || overrideAgencyId) {
      loadData();
    }
  }, [user, targetAgencyId, agencyLoading, overrideAgencyId]);

  // Check for sites without campaigns and auto-generate
  useEffect(() => {
    if (!sites.length || loading || generatingCampaign) return;

    const checkAndGenerateCampaign = async () => {
      // Find first site without campaign
      const siteWithoutCampaign = sites.find((site) => !(site as any).hasCampaign);

      if (siteWithoutCampaign) {
        // Check if site has existing content calendar entries
        try {
          const { collection, query, limit, getDocs } = await import('firebase/firestore');
          const calendarRef = collection(db, 'sites', siteWithoutCampaign.id, 'contentCalendar');
          const calendarQuery = query(calendarRef, limit(1));
          const calendarSnapshot = await getDocs(calendarQuery);

          if (!calendarSnapshot.empty) {
            console.log(`[Dashboard] Site ${siteWithoutCampaign.id} already has content calendar entries, skipping campaign generation`);
            return; // Site already has posts, don't generate campaign
          }
        } catch (checkError) {
          console.error('[Dashboard] Error checking calendar entries:', checkError);
          // Continue with generation if check fails
        }

        console.log(`[Dashboard] Found site without campaign: ${siteWithoutCampaign.id}`);
        setGeneratingCampaign(true);
        showToast('info', 'Building your SEO strategy...');

        try {
          const generateCampaign = httpsCallable(functions, 'generateInitialCampaignCallable');
          const result = await generateCampaign({ siteId: siteWithoutCampaign.id });

          const data = result.data as { success: boolean; keywordsCount?: number; pillarsCount?: number; skipped?: boolean };
          if (data.success) {
            if (data.skipped) {
              // Campaign was skipped (site already has entries)
              console.log('[Dashboard] Campaign generation skipped');
              return;
            }
            showToast('success', `Strategy created! Generated ${data.keywordsCount} keywords and ${data.pillarsCount} pillar topics.`);
            // Reload data to show the new campaign
            loadData();
            // Redirect to site details to show the plan
            navigate(`/sites/${siteWithoutCampaign.id}`);
          }
        } catch (error: any) {
          console.error('[Dashboard] Error generating campaign:', error);
          showToast('error', error.message || 'Failed to generate campaign');
        } finally {
          setGeneratingCampaign(false);
        }
      }
    };

    checkAndGenerateCampaign();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, loading, generatingCampaign, navigate, showToast]);

  const loadData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const sitesData = await siteService.getUserSites(user.uid, targetAgencyId);
      setSites(sitesData);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Per-site stats then aggregate (avoid race from concurrent updates)
      const perSiteStats = await Promise.all(
        sitesData.map(async (site) => {
          const calendarRef = collection(db, 'sites', site.id, 'contentCalendar');
          const calendarSnap = await getDocs(calendarRef);
          const blogsRef = collection(db, 'blogs');
          const blogsQuery = query(blogsRef, where('siteId', '==', site.id));
          const blogsSnap = await getDocs(blogsQuery);

          let siteBlogs = 0;
          let sitePending = 0;
          let sitePublishedThisMonth = 0;
          let siteViews = 0;

          calendarSnap.docs.forEach((d) => {
            const data = d.data();
            const status = data.status || '';
            siteBlogs += 1;
            if (status === 'pending' || status === 'approved') sitePending += 1;
            if (status === 'published' && data.publishedAt) {
              const publishedAt = data.publishedAt.toDate ? data.publishedAt.toDate() : new Date(data.publishedAt);
              if (publishedAt >= startOfMonth && publishedAt <= now) sitePublishedThisMonth += 1;
            }
          });

          blogsSnap.docs.forEach((d) => {
            siteViews += d.data().totalViews || 0;
          });

          return {
            totalBlogs: siteBlogs,
            pendingApprovals: sitePending,
            publishedThisMonth: sitePublishedThisMonth,
            totalViews: siteViews,
          };
        })
      );

      const totalBlogs = perSiteStats.reduce((s, p) => s + p.totalBlogs, 0);
      const pendingApprovals = perSiteStats.reduce((s, p) => s + p.pendingApprovals, 0);
      const publishedThisMonth = perSiteStats.reduce((s, p) => s + p.publishedThisMonth, 0);
      const totalViews = perSiteStats.reduce((s, p) => s + p.totalViews, 0);

      setStats({
        totalSites: sitesData.length,
        totalBlogs,
        pendingApprovals,
        publishedThisMonth,
        totalViews,
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSiteStatus = async (site: Site) => {
    const newStatus = !site.isActive;
    try {
      await siteService.updateSite(site.id, { isActive: newStatus });
      // Optimistic update
      setSites(sites.map(s => s.id === site.id ? { ...s, isActive: newStatus } : s));
    } catch (error) {
      console.error('Failed to update site status:', error);
      alert('Failed to update site status');
    }
  };

  // Filter sites based on active status
  // If showInactive is false, show only active sites (isActive !== false)
  // If showInactive is true, show all sites
  const filteredSites = sites.filter(site => showInactive || site.isActive !== false);

  if (loading || generatingCampaign) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">
            {generatingCampaign ? 'Building your SEO strategy...' : 'Loading...'}
          </p>
          {generatingCampaign && (
            <p className="text-slate-500 text-sm mt-2">
              This may take a minute while we generate your keywords and content plan
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-slide-in">
      {/* Auto-Fill Gap Fillers - Background process for each active site */}
      {filteredSites.map((site) => (
        <AutoFillGapFiller
          key={site.id}
          site={site}
          enabled={!loading}
        />
      ))}

      {/* Impersonation Banner */}
      {overrideAgencyId && impersonatedAgency && (
        <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-300">
              Viewing as Super Admin: <span className="font-bold">{impersonatedAgency.name}</span>
            </p>
            <p className="text-xs text-amber-400/80 mt-1">
              You are viewing this agency's dashboard. All actions will affect this agency's data.
            </p>
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-slate-400 mt-1 text-lg">Overview of your automated content empire.</p>
        </div>
        <button
          data-tour="add-site"
          onClick={() => navigate('/onboarding')}
          className="btn-primary shadow-lg shadow-primary-500/30"
        >
          <Plus className="w-5 h-5 mr-2" />
          <span>Add New Site</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div data-tour="dashboard-stats" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6 border-l-4 border-l-blue-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Total Sites</p>
              <h3 className="text-3xl font-bold text-white mt-2">{stats.totalSites}</h3>
            </div>
            <div className="p-3 bg-blue-500/20 rounded-xl">
              <FileText className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="card p-6 border-l-4 border-l-purple-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Total Blogs</p>
              <h3 className="text-3xl font-bold text-white mt-2">{stats.totalBlogs}</h3>
            </div>
            <div className="p-3 bg-purple-500/20 rounded-xl">
              <Calendar className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </div>

        <div className="card p-6 border-l-4 border-l-amber-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Pending</p>
              <h3 className="text-3xl font-bold text-white mt-2">{stats.pendingApprovals}</h3>
            </div>
            <div className="p-3 bg-amber-500/20 rounded-xl">
              <TrendingUp className="w-6 h-6 text-amber-400" />
            </div>
          </div>
        </div>

        <div className="card p-6 border-l-4 border-l-emerald-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Published (Mo)</p>
              <h3 className="text-3xl font-bold text-white mt-2">{stats.publishedThisMonth}</h3>
            </div>
            <div className="p-3 bg-emerald-500/20 rounded-xl">
              <FileText className="w-6 h-6 text-emerald-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Additional Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6 border-l-4 border-l-cyan-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Total Views</p>
              <h3 className="text-3xl font-bold text-white mt-2">{stats.totalViews.toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-cyan-500/20 rounded-xl">
              <TrendingUp className="w-6 h-6 text-cyan-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area - Site List */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Your Sites</h2>
          
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 text-sm text-slate-300 cursor-pointer">
              <input 
                type="checkbox" 
                checked={showInactive} 
                onChange={() => setShowInactive(!showInactive)}
                className="rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500" 
              />
              <span>Show Inactive Sites</span>
            </label>
          </div>
        </div>

        {filteredSites.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Archive className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-white mb-1">No sites found</h3>
            <p className="text-slate-400 mb-6">{showInactive ? "You haven't added any sites yet." : "No active sites found."}</p>
            <button
              onClick={() => navigate('/onboarding')}
              className="btn-primary"
            >
              Add Your First Site
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-900/50 border-b border-slate-700">
                  <th className="px-6 py-4 font-semibold text-slate-300 text-sm">Site Name</th>
                  <th className="px-6 py-4 font-semibold text-slate-300 text-sm">Status</th>
                  <th className="px-6 py-4 font-semibold text-slate-300 text-sm">Generated</th>
                  <th className="px-6 py-4 font-semibold text-slate-300 text-sm">Frequency</th>
                  <th className="px-6 py-4 font-semibold text-slate-300 text-sm text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredSites.map(site => (
                  <tr 
                    key={site.id} 
                    className={`hover:bg-slate-900/50 transition-colors ${site.isActive === false ? 'opacity-60 bg-slate-900/30' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="cursor-pointer" onClick={() => navigate(`/sites/${site.id}`)}>
                        <h3 className="font-bold text-white hover:text-blue-400">{site.name}</h3>
                        <a 
                          href={site.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-slate-400 hover:text-blue-400 truncate max-w-[200px] block"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {site.url}
                        </a>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
                        site.status === 'connected' 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        {site.status}
                      </span>
                      {site.isActive === false && (
                        <span className="ml-2 text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">Archived</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white font-medium">{site.blogsGenerated}</span>
                      <span className="text-slate-400 text-sm"> blogs</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white font-medium">{site.blogsPerWeek}</span>
                      <span className="text-slate-400 text-sm"> / week</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => navigate(`/sites/${site.id}`)}
                          className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <ArrowRight className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => navigate(`/sites/${site.id}/settings`)}
                          className="p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
                          title="Settings"
                        >
                          <Settings className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => toggleSiteStatus(site)}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                          title={site.isActive === false ? "Restore Site" : "Archive Site"}
                        >
                          <Archive className="w-5 h-5" />
                        </button>
                      </div>
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

export default Dashboard;
