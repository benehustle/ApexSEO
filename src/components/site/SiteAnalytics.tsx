import React, { useState, useEffect } from 'react';
import { analyticsService, SiteMetrics } from '../../services/analytics.service';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Eye, Clock, Activity, ExternalLink, Loader2 } from 'lucide-react';

interface SiteAnalyticsProps {
  siteId: string;
}

export const SiteAnalytics: React.FC<SiteAnalyticsProps> = ({ siteId }) => {
  const [metrics, setMetrics] = useState<SiteMetrics | null>(null);
  const [realtimeViews, setRealtimeViews] = useState<any[]>([]);
  const [viewsByDate, setViewsByDate] = useState<Array<{ date: string; views: number }>>([]);
  const [referrers, setReferrers] = useState<Array<{ source: string; count: number }>>([]);
  const [topHours, setTopHours] = useState<Array<{ hour: number; views: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (siteId) {
      loadMetrics();
      loadRealtimeViews();
      
      // Refresh realtime views every 30 seconds
      const interval = setInterval(loadRealtimeViews, 30000);
      return () => clearInterval(interval);
    }
  }, [siteId]);

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const metricsData = await analyticsService.getSiteMetrics(siteId);
      setMetrics(metricsData);
      
      // Load aggregated data for charts
      if (metricsData.topBlogs.length > 0) {
        // Get metrics for top blogs and aggregate
        const blogMetricsPromises = metricsData.topBlogs.slice(0, 5).map(blog => 
          analyticsService.getBlogMetrics(blog.blogId)
        );
        const blogMetrics = await Promise.all(blogMetricsPromises);
        
        // Aggregate views by date
        const dateMap = new Map<string, number>();
        blogMetrics.forEach(bm => {
          bm.viewsByDate.forEach(v => {
            dateMap.set(v.date, (dateMap.get(v.date) || 0) + v.views);
          });
        });
        setViewsByDate(Array.from(dateMap.entries()).map(([date, views]) => ({ date, views })).sort((a, b) => a.date.localeCompare(b.date)));
        
        // Aggregate referrers
        const refMap = new Map<string, number>();
        blogMetrics.forEach(bm => {
          bm.referrers.forEach(r => {
            refMap.set(r.source, (refMap.get(r.source) || 0) + r.count);
          });
        });
        setReferrers(Array.from(refMap.entries()).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 6));
        
        // Aggregate top hours
        const hourMap = new Map<number, number>();
        blogMetrics.forEach(bm => {
          bm.topHours.forEach(h => {
            hourMap.set(h.hour, (hourMap.get(h.hour) || 0) + h.views);
          });
        });
        setTopHours(Array.from(hourMap.entries()).map(([hour, views]) => ({ hour, views })).sort((a, b) => a.hour - b.hour));
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRealtimeViews = async () => {
    try {
      const views = await analyticsService.getRealtimeViews(siteId, 30);
      setRealtimeViews(views);
    } catch (error) {
      console.error('Failed to load realtime views:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  if (!metrics) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
        <Activity className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">No Analytics Data</h3>
        <p className="text-slate-400">Analytics will appear here once your blogs start receiving views</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Views</p>
              <p className="text-3xl font-bold text-white mt-1">
                {metrics.totalViews.toLocaleString()}
              </p>
            </div>
            <div className="bg-blue-500/20 p-3 rounded-lg">
              <Eye className="w-8 h-8 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Avg Time on Page</p>
              <p className="text-3xl font-bold text-white mt-1">
                {formatTime(metrics.avgTimeOnPage)}
              </p>
            </div>
            <div className="bg-green-500/20 p-3 rounded-lg">
              <Clock className="w-8 h-8 text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Avg Scroll Depth</p>
              <p className="text-3xl font-bold text-white mt-1">
                {metrics.avgScrollDepth}%
              </p>
            </div>
            <div className="bg-purple-500/20 p-3 rounded-lg">
              <Activity className="w-8 h-8 text-purple-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Blogs</p>
              <p className="text-3xl font-bold text-white mt-1">
                {metrics.totalBlogs}
              </p>
            </div>
            <div className="bg-yellow-500/20 p-3 rounded-lg">
              <TrendingUp className="w-8 h-8 text-yellow-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Views Over Time */}
        {viewsByDate.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Views Over Time</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={viewsByDate}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }}
                />
                <Legend wrapperStyle={{ color: '#94a3b8' }} />
                <Line 
                  type="monotone" 
                  dataKey="views" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  name="Views"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Traffic Sources */}
        {referrers.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Traffic Sources</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={referrers}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                  nameKey="source"
                >
                  {referrers.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Peak Hours Chart */}
      {topHours.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Peak Viewing Hours</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topHours}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis 
                dataKey="hour" 
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                label={{ value: 'Hour of Day', position: 'insideBottom', offset: -5, fill: '#94a3b8' }}
              />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }}
              />
              <Legend wrapperStyle={{ color: '#94a3b8' }} />
              <Bar dataKey="views" fill="#3b82f6" name="Views" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Real-time Activity */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Real-Time Activity (Last 30 Minutes)</h2>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-slate-400">Live</span>
          </div>
        </div>
        {realtimeViews.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {realtimeViews.map((view, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-700/50 rounded border border-slate-600">
                <div className="flex items-center space-x-3">
                  <Eye className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-200 truncate max-w-md">{view.url}</span>
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(view.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-400 text-center py-8">No recent activity</p>
        )}
      </div>

      {/* Top Performing Blogs */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">Top Performing Blogs</h2>
        <div className="space-y-3">
          {metrics.topBlogs.length > 0 ? (
            metrics.topBlogs.map((blog, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600 hover:bg-slate-700 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="bg-blue-500/20 text-blue-400 w-8 h-8 rounded-full flex items-center justify-center font-bold border border-blue-500/30">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="font-medium text-white">{blog.title}</p>
                    <p className="text-sm text-slate-400">{blog.views.toLocaleString()} views</p>
                  </div>
                </div>
                <button
                  onClick={() => window.location.href = `/blogs/${blog.blogId}`}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <ExternalLink className="w-5 h-5" />
                </button>
              </div>
            ))
          ) : (
            <p className="text-slate-400 text-center py-8">No published blogs yet</p>
          )}
        </div>
      </div>

      {/* Engagement Quality Indicator */}
      <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-lg p-6 border border-green-500/20">
        <h3 className="text-lg font-semibold text-white mb-3">📊 Engagement Quality</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-slate-400 mb-1">Time on Page</p>
            <div className="flex items-center space-x-2">
              {metrics.avgTimeOnPage > 120 ? (
                <>
                  <span className="text-green-400">✓ Excellent</span>
                  <span className="text-xs text-slate-500">(2+ minutes)</span>
                </>
              ) : metrics.avgTimeOnPage > 60 ? (
                <>
                  <span className="text-yellow-400">⚠ Good</span>
                  <span className="text-xs text-slate-500">(1+ minute)</span>
                </>
              ) : (
                <>
                  <span className="text-red-400">✗ Needs Work</span>
                  <span className="text-xs text-slate-500">(&lt;1 minute)</span>
                </>
              )}
            </div>
          </div>
          <div>
            <p className="text-sm text-slate-400 mb-1">Scroll Depth</p>
            <div className="flex items-center space-x-2">
              {metrics.avgScrollDepth > 70 ? (
                <>
                  <span className="text-green-400">✓ Excellent</span>
                  <span className="text-xs text-slate-500">(70%+ scroll)</span>
                </>
              ) : metrics.avgScrollDepth > 50 ? (
                <>
                  <span className="text-yellow-400">⚠ Good</span>
                  <span className="text-xs text-slate-500">(50%+ scroll)</span>
                </>
              ) : (
                <>
                  <span className="text-red-400">✗ Needs Work</span>
                  <span className="text-xs text-slate-500">(&lt;50% scroll)</span>
                </>
              )}
            </div>
          </div>
          <div>
            <p className="text-sm text-slate-400 mb-1">Content Performance</p>
            <div className="flex items-center space-x-2">
              {metrics.totalBlogs > 0 && metrics.totalViews / metrics.totalBlogs > 100 ? (
                <>
                  <span className="text-green-400">✓ Strong</span>
                  <span className="text-xs text-slate-500">(100+ avg views)</span>
                </>
              ) : metrics.totalBlogs > 0 && metrics.totalViews / metrics.totalBlogs > 50 ? (
                <>
                  <span className="text-yellow-400">⚠ Growing</span>
                  <span className="text-xs text-slate-500">(50+ avg views)</span>
                </>
              ) : (
                <>
                  <span className="text-blue-400">📈 Building</span>
                  <span className="text-xs text-slate-500">(&lt;50 avg views)</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
