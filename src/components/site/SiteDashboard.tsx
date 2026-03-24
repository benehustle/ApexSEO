import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { siteService } from '../../services/site.service';
import { Site } from '../../types/site';
import { Settings, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface ContentCalendarEntry {
  id: string;
  blogTopic: string;
  keyword: string;
  status: string;
  scheduledDate: Date | null;
  wordpressPostUrl?: string;
  errorMessage?: string;
}

interface SiteDashboardProps {
  siteId: string;
}

export const SiteDashboard: React.FC<SiteDashboardProps> = ({ siteId }) => {
  const [site, setSite] = useState<Site | null>(null);
  const [calendarEntries, setCalendarEntries] = useState<ContentCalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Load site data
  useEffect(() => {
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
        setLoading(false);
      }
    };

    loadSite();
  }, [siteId]);

  // Subscribe to contentCalendar collection
  useEffect(() => {
    if (!siteId) return;

    const calendarRef = collection(db, 'sites', siteId, 'contentCalendar');
    const q = query(calendarRef, orderBy('scheduledDate', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const entries: ContentCalendarEntry[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            blogTopic: data.blogTopic || '',
            keyword: data.keyword || '',
            status: data.status || 'draft',
            scheduledDate: data.scheduledDate
              ? (data.scheduledDate as Timestamp).toDate()
              : null,
            wordpressPostUrl: data.wordpressPostUrl,
            errorMessage: data.errorMessage,
          };
        });

        setCalendarEntries(entries);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching calendar entries:', err);
        setError('Failed to load calendar entries');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [siteId]);

  // Calculate stats
  const stats = {
    totalPublished: calendarEntries.filter((e) => e.status === 'published').length,
    pending: calendarEntries.filter((e) =>
      ['scheduled', 'approved', 'pending', 'processing'].includes(e.status)
    ).length,
    errors: calendarEntries.filter((e) => e.status === 'error').length,
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = 'px-2.5 py-1 rounded-full text-xs font-medium';
    
    switch (status) {
      case 'published':
        return (
          <span className={`${baseClasses} bg-green-500/20 text-green-400 border border-green-500/30`}>
            Published
          </span>
        );
      case 'processing':
        return (
          <span className={`${baseClasses} bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 animate-pulse`}>
            Processing
          </span>
        );
      case 'scheduled':
        return (
          <span className={`${baseClasses} bg-blue-500/20 text-blue-400 border border-blue-500/30`}>
            Scheduled
          </span>
        );
      case 'error':
        return (
          <span className={`${baseClasses} bg-red-500/20 text-red-400 border border-red-500/30`}>
            Error
          </span>
        );
      case 'draft':
      default:
        return (
          <span className={`${baseClasses} bg-slate-500/20 text-slate-400 border border-slate-500/30`}>
            Draft
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-lg mb-4">{error || 'Site not found'}</p>
        <button
          onClick={() => navigate('/sites')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Back to Sites
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{site.name}</h1>
          <p className="text-slate-400 mt-1">{site.url}</p>
        </div>
        <button
          onClick={() => navigate(`/sites/${siteId}/settings`)}
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 border border-slate-700"
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <p className="text-sm text-slate-400 mb-2">Total Published</p>
          <p className="text-4xl font-bold text-white">{stats.totalPublished}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <p className="text-sm text-slate-400 mb-2">Pending</p>
          <p className="text-4xl font-bold text-white">{stats.pending}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <p className="text-sm text-slate-400 mb-2">Errors</p>
          <p className="text-4xl font-bold text-white">{stats.errors}</p>
        </div>
      </div>

      {/* Content Calendar Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Content Calendar</h2>
        </div>

        {calendarEntries.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-400">No calendar entries found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/50 border-b border-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Topic
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Keyword
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {calendarEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-slate-900/50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-semibold text-white">
                        {entry.blogTopic || 'Untitled'}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium bg-slate-700 text-slate-300 rounded">
                        {entry.keyword || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-slate-300">
                        {entry.scheduledDate
                          ? format(entry.scheduledDate, 'MMM d, yyyy')
                          : '—'}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(entry.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        {entry.status === 'published' && entry.wordpressPostUrl && (
                          <a
                            href={entry.wordpressPostUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-blue-400 hover:text-blue-300 hover:bg-slate-700 rounded-lg transition-colors"
                            title="View Post"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        {entry.status === 'error' && entry.errorMessage && (
                          <div className="group relative">
                            <button
                              className="p-2 text-red-400 hover:text-red-300 hover:bg-slate-700 rounded-lg transition-colors"
                              title={entry.errorMessage}
                            >
                              <AlertCircle className="w-4 h-4" />
                            </button>
                            {/* Tooltip */}
                            <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-slate-900 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                              <p className="text-xs text-red-400 font-medium mb-1">Error Message:</p>
                              <p className="text-xs text-slate-300">{entry.errorMessage}</p>
                            </div>
                          </div>
                        )}
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
