import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';
import { useAgencyContext } from '../../contexts/AgencyContext';
import { Site } from '../../types/site';
import { AlertCircle, Loader2, Mail } from 'lucide-react';
import { format } from 'date-fns';

interface SiteStats {
  totalPosts: number;
  publishedPosts: number;
  totalViews: number;
  pendingPosts: number;
  nextPostDate: Date | null;
}

/** Calendar entry shape for stats (from contentCalendar) */
interface CalendarEntryForStats {
  id: string;
  status?: string;
  scheduledDate?: Date | null;
}

interface SitesGridProps {
  agencyId?: string; // Optional: for admin impersonation mode
}

export const SitesGrid: React.FC<SitesGridProps> = ({ agencyId: overrideAgencyId }) => {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteStats, setSiteStats] = useState<Record<string, SiteStats>>({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { agencyId: contextAgencyId, loading: agencyLoading } = useAgencyContext();
  const navigate = useNavigate();

  // Use override agencyId if provided (admin mode), otherwise use context
  const effectiveAgencyId = overrideAgencyId || contextAgencyId;

  // Subscribe to sites collection and their stats
  useEffect(() => {
    // Wait for agency to finish loading before proceeding (unless in admin mode)
    if (!user || (!overrideAgencyId && agencyLoading)) {
      if (!overrideAgencyId && agencyLoading) {
        setLoading(true);
      }
      return;
    }
    
    // If no agencyId after loading is complete, don't query
    if (!effectiveAgencyId) {
      setSites([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const sitesRef = collection(db, 'sites');
    // Query by agencyId (primary) with fallback to userId for backward compatibility
    const q = query(sitesRef, where('agencyId', '==', effectiveAgencyId));

    const unsubscribeSites = onSnapshot(
      q,
      (snapshot) => {
        const sitesData: Site[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
          } as Site;
        });

        setSites(sitesData);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching sites:', error);
        setLoading(false);
      }
    );

    return () => unsubscribeSites();
  }, [user, effectiveAgencyId, agencyLoading, overrideAgencyId]);

  // Subscribe to content calendar + blogs (views) per site for stats
  useEffect(() => {
    if (sites.length === 0) return;

    const unsubscribes: Array<() => void> = [];

    sites.forEach((site) => {
      // 1) contentCalendar: post counts and next scheduled date
      const calendarRef = collection(db, 'sites', site.id, 'contentCalendar');
      const calendarQuery = query(calendarRef, orderBy('scheduledDate', 'asc'));

      const unsubscribeCalendar = onSnapshot(calendarQuery, (snapshot) => {
        const entries: CalendarEntryForStats[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            status: data.status,
            scheduledDate: data.scheduledDate?.toDate?.() ?? null,
          };
        });
        const totalPosts = entries.length;
        const publishedPosts = entries.filter((e) => e.status === 'published').length;
        const pendingPosts = entries.filter((e) => e.status === 'pending' || e.status === 'approved').length;
        const upcoming = entries.filter((e) =>
          ['planned', 'scheduled', 'approved', 'pending'].includes(e.status || '')
        );
        const nextPostDate = upcoming.length > 0 && upcoming[0].scheduledDate
          ? upcoming[0].scheduledDate
          : null;

        setSiteStats((prev) => ({
          ...prev,
          [site.id]: {
            ...prev[site.id],
            totalPosts,
            publishedPosts,
            pendingPosts,
            nextPostDate,
          },
        }));
      });

      // 2) blogs collection: totalViews only (analytics docs, one per published post)
      const blogsRef = collection(db, 'blogs');
      const blogsQuery = query(blogsRef, where('siteId', '==', site.id));

      const unsubscribeBlogs = onSnapshot(blogsQuery, (snapshot) => {
        const totalViews = snapshot.docs.reduce(
          (sum, d) => sum + (d.data().totalViews || 0),
          0
        );
        setSiteStats((prev) => ({
          ...prev,
          [site.id]: {
            ...prev[site.id],
            totalViews,
          },
        }));
      });

      unsubscribes.push(unsubscribeCalendar, unsubscribeBlogs);
    });

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [sites]);

  const getSiteStatus = (site: Site): 'active' | 'error' => {
    if (site.status === 'error' || site.errorState) {
      return 'error';
    }
    return 'active';
  };

  const handleCardClick = (siteId: string) => {
    navigate(`/sites/${siteId}`);
  };

  if (loading || (!overrideAgencyId && agencyLoading)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!effectiveAgencyId) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400 text-lg mb-4">Agency not initialized</p>
        <p className="text-slate-500 text-sm mb-6">
          Please initialize your agency in Settings to view sites.
        </p>
        <button
          onClick={() => navigate('/settings')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Go to Settings
        </button>
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400 text-lg mb-4">No sites found</p>
        <button
          onClick={() => navigate('/onboarding')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Add Your First Site
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {sites.map((site) => {
        const stats = siteStats[site.id] || { 
          totalPosts: 0, 
          publishedPosts: 0,
          totalViews: 0,
          pendingPosts: 0,
          nextPostDate: null 
        };
        const status = getSiteStatus(site);
        const hasError = status === 'error';

        return (
          <div
            key={site.id}
            className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden hover:border-slate-600 transition-all cursor-pointer group relative"
            onClick={() => handleCardClick(site.id)}
          >
            {/* Error Badge */}
            {hasError && (
              <div className="absolute top-3 right-3 z-10">
                <div className="bg-red-500/20 border border-red-500/50 rounded-full p-1.5">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                </div>
              </div>
            )}

            {/* Header */}
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">
                    {site.name}
                  </h3>
                  <p className="text-sm text-slate-400 truncate">{site.url}</p>
                </div>
                <span
                  className="flex-shrink-0 flex items-center gap-1 text-xs text-slate-500"
                  title={site.receiveMonthlyReport && site.clientReportEmail ? 'Monthly report on' : 'Monthly report off'}
                >
                  <Mail className="w-3.5 h-3.5" />
                  {site.receiveMonthlyReport && site.clientReportEmail ? (
                    <span className="text-emerald-500/90">Report on</span>
                  ) : (
                    <span>Report off</span>
                  )}
                </span>
              </div>
            </div>

            {/* Body Stats */}
            <div className="p-6 grid grid-cols-2 gap-4">
              {/* Total Posts */}
              <div>
                <p className="text-xs text-slate-500 mb-1">Total Posts</p>
                <p className="text-lg font-semibold text-white">
                  {stats.totalPosts}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {stats.publishedPosts} published
                </p>
              </div>

              {/* Total Views */}
              <div>
                <p className="text-xs text-slate-500 mb-1">Total Views</p>
                <p className="text-lg font-semibold text-white">
                  {stats.totalViews.toLocaleString()}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {stats.pendingPosts} pending
                </p>
              </div>

              {/* Status */}
              <div>
                <p className="text-xs text-slate-500 mb-1">Status</p>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      status === 'active' ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <p className="text-sm font-medium text-white capitalize">
                    {status}
                  </p>
                </div>
              </div>

              {/* Next Post */}
              <div>
                <p className="text-xs text-slate-500 mb-1">Next Post</p>
                <p className="text-sm font-medium text-white">
                  {stats.nextPostDate
                    ? format(stats.nextPostDate, 'MMM d')
                    : '—'}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCardClick(site.id);
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors"
              >
                Manage
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
