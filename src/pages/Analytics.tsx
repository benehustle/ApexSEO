import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAgencyContext } from '../contexts/AgencyContext';
import { siteService } from '../services/site.service';
import { analyticsService, SiteMetrics } from '../services/analytics.service';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Eye, Clock, Activity, ExternalLink } from 'lucide-react';

export const Analytics: React.FC = () => {
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSite, setSelectedSite] = useState('');
  const [metrics, setMetrics] = useState<SiteMetrics | null>(null);
  const [realtimeViews, setRealtimeViews] = useState<any[]>([]);
  const [viewsByDate, setViewsByDate] = useState<Array<{ date: string; views: number }>>([]);
  const [referrers, setReferrers] = useState<Array<{ source: string; count: number }>>([]);
  const [topHours, setTopHours] = useState<Array<{ hour: number; views: number }>>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { agencyId, loading: agencyLoading } = useAgencyContext();

  useEffect(() => {
    if (!agencyLoading) {
      loadSites();
    }
  }, [user, agencyId, agencyLoading]);

  useEffect(() => {
    if (selectedSite) {
      loadMetrics();
      loadRealtimeViews();
      
      // Refresh realtime views every 30 seconds
      const interval = setInterval(loadRealtimeViews, 30000);
      return () => clearInterval(interval);
    }
  }, [selectedSite]);

  const loadSites = async () => {
    if (!user || agencyLoading) return;
    try {
      const sitesData = await siteService.getUserSites(user.uid, agencyId);
      setSites(sitesData);
      if (sitesData.length > 0) setSelectedSite(sitesData[0].id);
    } catch (error) {
      console.error('Failed to load sites:', error);
    }
  };

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const metricsData = await analyticsService.getSiteMetrics(selectedSite);
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
      const views = await analyticsService.getRealtimeViews(selectedSite, 30);
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-600">Track your blog performance and engagement</p>
          </div>
          
          {sites.length > 0 && (
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="input-field"
            >
              {sites.map(site => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          )}
        </div>

        {!selectedSite && sites.length === 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Activity className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Sites Available</h3>
            <p className="text-gray-600">Add a site to start tracking analytics</p>
          </div>
        )}

        {metrics && (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Views</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      {metrics.totalViews.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-blue-100 p-3 rounded-lg">
                    <Eye className="w-8 h-8 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Avg Time on Page</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      {formatTime(metrics.avgTimeOnPage)}
                    </p>
                  </div>
                  <div className="bg-green-100 p-3 rounded-lg">
                    <Clock className="w-8 h-8 text-green-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Avg Scroll Depth</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      {metrics.avgScrollDepth}%
                    </p>
                  </div>
                  <div className="bg-purple-100 p-3 rounded-lg">
                    <Activity className="w-8 h-8 text-purple-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Blogs</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      {metrics.totalBlogs}
                    </p>
                  </div>
                  <div className="bg-yellow-100 p-3 rounded-lg">
                    <TrendingUp className="w-8 h-8 text-yellow-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Views Over Time */}
              {viewsByDate.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold mb-4">Views Over Time</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={viewsByDate}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis />
                      <Tooltip />
                      <Legend />
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
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold mb-4">Traffic Sources</h3>
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
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Peak Hours Chart */}
            {topHours.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6 mb-8">
                <h3 className="text-lg font-semibold mb-4">Peak Viewing Hours</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topHours}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="hour" 
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Hour of Day', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="views" fill="#3b82f6" name="Views" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Real-time Activity */}
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Real-Time Activity (Last 30 Minutes)</h2>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-gray-600">Live</span>
                </div>
              </div>
              {realtimeViews.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {realtimeViews.map((view, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div className="flex items-center space-x-3">
                        <Eye className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900 truncate max-w-md">{view.url}</span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(view.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No recent activity</p>
              )}
            </div>

            {/* Top Performing Blogs */}
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-bold mb-4">Top Performing Blogs</h2>
              <div className="space-y-3">
                {metrics.topBlogs.length > 0 ? (
                  metrics.topBlogs.map((blog, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-center space-x-4">
                        <div className="bg-primary-100 text-primary-600 w-8 h-8 rounded-full flex items-center justify-center font-bold">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{blog.title}</p>
                          <p className="text-sm text-gray-600">{blog.views.toLocaleString()} views</p>
                        </div>
                      </div>
                      <button
                        onClick={() => window.location.href = `/blogs/${blog.blogId}`}
                        className="text-primary-600 hover:text-primary-700"
                      >
                        <ExternalLink className="w-5 h-5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-8">No published blogs yet</p>
                )}
              </div>
            </div>

            {/* Engagement Quality Indicator */}
            <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-6 border border-green-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">📊 Engagement Quality</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Time on Page</p>
                  <div className="flex items-center space-x-2">
                    {metrics.avgTimeOnPage > 120 ? (
                      <>
                        <span className="text-green-600">✓ Excellent</span>
                        <span className="text-xs text-gray-500">(2+ minutes)</span>
                      </>
                    ) : metrics.avgTimeOnPage > 60 ? (
                      <>
                        <span className="text-yellow-600">⚠ Good</span>
                        <span className="text-xs text-gray-500">(1+ minute)</span>
                      </>
                    ) : (
                      <>
                        <span className="text-red-600">✗ Needs Work</span>
                        <span className="text-xs text-gray-500">(&lt;1 minute)</span>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Scroll Depth</p>
                  <div className="flex items-center space-x-2">
                    {metrics.avgScrollDepth > 70 ? (
                      <>
                        <span className="text-green-600">✓ Excellent</span>
                        <span className="text-xs text-gray-500">(70%+ scroll)</span>
                      </>
                    ) : metrics.avgScrollDepth > 50 ? (
                      <>
                        <span className="text-yellow-600">⚠ Good</span>
                        <span className="text-xs text-gray-500">(50%+ scroll)</span>
                      </>
                    ) : (
                      <>
                        <span className="text-red-600">✗ Needs Work</span>
                        <span className="text-xs text-gray-500">(&lt;50% scroll)</span>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Content Performance</p>
                  <div className="flex items-center space-x-2">
                    {metrics.totalBlogs > 0 && metrics.totalViews / metrics.totalBlogs > 100 ? (
                      <>
                        <span className="text-green-600">✓ Strong</span>
                        <span className="text-xs text-gray-500">(100+ avg views)</span>
                      </>
                    ) : metrics.totalBlogs > 0 && metrics.totalViews / metrics.totalBlogs > 50 ? (
                      <>
                        <span className="text-yellow-600">⚠ Growing</span>
                        <span className="text-xs text-gray-500">(50+ avg views)</span>
                      </>
                    ) : (
                      <>
                        <span className="text-blue-600">📈 Building</span>
                        <span className="text-xs text-gray-500">(&lt;50 avg views)</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Analytics;
