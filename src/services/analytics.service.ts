import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface BlogMetrics {
  blogId: string;
  totalViews: number;
  uniqueVisitors: number;
  avgTimeOnPage: number;
  avgScrollDepth: number;
  bounceRate: number;
  viewsByDate: Array<{ date: string; views: number }>;
  referrers: Array<{ source: string; count: number }>;
  topHours: Array<{ hour: number; views: number }>;
}

export interface SiteMetrics {
  totalViews: number;
  totalBlogs: number;
  avgTimeOnPage: number;
  avgScrollDepth: number;
  topBlogs: Array<{ title: string; views: number; blogId: string }>;
}

export const analyticsService = {
  async getBlogMetrics(blogId: string): Promise<BlogMetrics> {
    const viewsRef = collection(db, 'pageViews');
    const q = query(viewsRef, where('blogId', '==', blogId), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    
    const views = snapshot.docs.map(doc => doc.data());
    const totalViews = views.length;
    
    // Calculate unique visitors by userAgent (simplified)
    const uniqueAgents = new Set(views.map(v => v.userAgent));
    const uniqueVisitors = uniqueAgents.size;
    
    // Group by date
    const viewsByDate = views.reduce((acc: any, view) => {
      const date = view.date || (view.timestamp?.toDate ? view.timestamp.toDate().toISOString().split('T')[0] : '');
      if (date) {
        acc[date] = (acc[date] || 0) + 1;
      }
      return acc;
    }, {});
    
    // Group by referrer
    const referrers = views.reduce((acc: any, view) => {
      try {
        const ref = view.referrer && view.referrer !== 'Direct' 
          ? new URL(view.referrer).hostname 
          : 'Direct';
        acc[ref] = (acc[ref] || 0) + 1;
      } catch {
        acc['Direct'] = (acc['Direct'] || 0) + 1;
      }
      return acc;
    }, {});
    
    // Group by hour
    const topHours = views.reduce((acc: any, view) => {
      try {
        const timestamp = view.timestamp?.toDate ? view.timestamp.toDate() : new Date(view.timestamp);
        const hour = timestamp.getHours();
        acc[hour] = (acc[hour] || 0) + 1;
      } catch {
        // Skip invalid timestamps
      }
      return acc;
    }, {});
    
    return {
      blogId,
      totalViews,
      uniqueVisitors,
      avgTimeOnPage: 0,
      avgScrollDepth: 0,
      bounceRate: 0,
      viewsByDate: Object.entries(viewsByDate).map(([date, views]) => ({ 
        date, 
        views: views as number 
      })).sort((a, b) => a.date.localeCompare(b.date)),
      referrers: Object.entries(referrers).map(([source, count]) => ({ 
        source, 
        count: count as number 
      })).sort((a, b) => b.count - a.count),
      topHours: Object.entries(topHours).map(([hour, views]) => ({ 
        hour: Number(hour), 
        views: views as number 
      })).sort((a, b) => a.hour - b.hour)
    };
  },

  async getSiteMetrics(siteId: string, _dateRange?: { start: Date; end: Date }): Promise<SiteMetrics> {
    const blogsRef = collection(db, 'blogs');
    const blogsQuery = query(blogsRef, where('siteId', '==', siteId));
    const blogsSnapshot = await getDocs(blogsQuery);
    
    const blogs = blogsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    const totalViews = blogs.reduce((sum, blog: any) => sum + (blog.totalViews || 0), 0);
    const totalBlogs = blogs.length;
    const avgTimeOnPage = blogs.reduce((sum, blog: any) => sum + (blog.avgTimeOnPage || 0), 0) / totalBlogs || 0;
    const avgScrollDepth = blogs.reduce((sum, blog: any) => sum + (blog.avgScrollDepth || 0), 0) / totalBlogs || 0;
    
    const topBlogs = blogs
      .sort((a: any, b: any) => (b.totalViews || 0) - (a.totalViews || 0))
      .slice(0, 10)
      .map((blog: any) => ({
        title: blog.title,
        views: blog.totalViews || 0,
        blogId: blog.id
      }));
    
    return {
      totalViews,
      totalBlogs,
      avgTimeOnPage: Math.round(avgTimeOnPage),
      avgScrollDepth: Math.round(avgScrollDepth),
      topBlogs
    };
  },

  async getRealtimeViews(siteId: string, minutes: number = 30) {
    try {
      const viewsRef = collection(db, 'pageViews');
      const cutoff = new Date(Date.now() - minutes * 60 * 1000);
      
      const q = query(
        viewsRef,
        where('siteId', '==', siteId),
        where('timestamp', '>=', Timestamp.fromDate(cutoff)),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          blogId: data.blogId,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp),
          url: data.url || 'Unknown'
        };
      });
    } catch (error) {
      console.error('Error fetching realtime views:', error);
      return [];
    }
  }
};
