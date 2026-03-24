import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { siteService } from './site.service';
import { wordpressService } from './wordpress.service';
import { aiService } from './ai.service';
import { keywordService } from './keyword.service';
import { rateLimiterService } from './rateLimiter.service';
import { RateLimitError } from '../types/errors';
import { Blog } from '../types/blog';
import { Site } from '../types/site';

export class BlogOrchestrator {
  async generateBulkBlogs(siteId: string, count: number = 30, userId?: string): Promise<void> {
    const site = await siteService.getSite(siteId);
    if (!site) throw new Error('Site not found');

    const siteUserId = userId || site.userId;
    if (!siteUserId) throw new Error('User ID is required for rate limiting');

    // Generate keyword ideas
    const keywords = await this.generateKeywordList(site, count);

    // Calculate schedule
    const schedule = this.calculateSchedule(site.blogsPerWeek, count);

    // Generate blogs one by one
    for (let i = 0; i < count; i++) {
      try {
        await this.generateSingleBlog({
          siteId,
          keyword: keywords[i],
          scheduledDate: schedule[i],
          userId: siteUserId
        });
      } catch (error) {
        console.error(`Failed to generate blog ${i + 1}:`, error);
        // If rate limit error, stop generating
        if (error instanceof RateLimitError) {
          throw error;
        }
      }
    }

    await siteService.updateSite(siteId, {
      blogsGenerated: site.blogsGenerated + count
    });
  }

  async generateSingleBlog(params: {
    siteId: string;
    keyword: string;
    scheduledDate: Date;
    userId?: string;
  }): Promise<Blog> {
    const site = await siteService.getSite(params.siteId);
    if (!site) throw new Error('Site not found');

    const userId = params.userId || site.userId;
    if (!userId) throw new Error('User ID is required for rate limiting');

    // Check rate limits before generating
    const canProceed = await rateLimiterService.checkRateLimit(userId, 'BLOG_GENERATION');
    if (!canProceed) {
      throw new RateLimitError('Blog generation quota exceeded. Please try again later.');
    }

    // Step 1: Fetch internal links from sitemap (gracefully handle failures)
    let internalLinks: string[] = [];
    try {
      internalLinks = await wordpressService.fetchSitemap(site.url, site.sitemapUrl);
    } catch (error) {
      console.warn('Failed to fetch sitemap, continuing without internal links:', error);
      internalLinks = [];
    }

    // Step 2: Find relevant YouTube videos (gracefully handle failures)
    let youtubeVideos: Array<{ url: string; title: string }> = [];
    try {
      youtubeVideos = await keywordService.findRelevantVideos(params.keyword, 3);
    } catch (error) {
      console.warn('Failed to fetch YouTube videos, continuing without videos:', error);
      youtubeVideos = [];
    }

    // Step 3: Queue blog generation (asynchronous)
    const { jobId } = await aiService.generateBlogPost({
      keyword: params.keyword,
      siteContext: site,
      internalLinks,
      youtubeLinks: youtubeVideos,
      wordCount: 3000, // Support up to 3000 words
      siteId: params.siteId,
      scheduledDate: params.scheduledDate,
      userId: userId
    });

    // Create a placeholder blog document that will be updated when generation completes
    // This allows the UI to show progress
    const blogsRef = collection(db, 'blogs');
    const placeholderBlog = {
      siteId: params.siteId,
      userId: userId,
      title: `Generating blog for "${params.keyword}"...`,
      metaDescription: '',
      content: '',
      excerpt: '',
      keyword: params.keyword,
      relatedKeywords: [],
      featuredImageUrl: '',
      internalLinks: [],
      externalLinks: [],
      wordCount: 0,
      status: 'pending' as const,
      scheduledDate: Timestamp.fromDate(params.scheduledDate),
      trackingScriptId: this.generateTrackingId(),
      generationJobId: jobId, // Link to the generation job
      totalViews: 0,
      uniqueVisitors: 0,
      avgTimeOnPage: 0,
      avgScrollDepth: 0,
      bounceRate: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    const docRef = await addDoc(blogsRef, placeholderBlog);

    // Increment rate limit counter
    await rateLimiterService.incrementCounter(userId, 'BLOG_GENERATION');

    // Return placeholder blog - the background function will update it when complete
    return {
      id: docRef.id,
      ...placeholderBlog,
      scheduledDate: params.scheduledDate,
      createdAt: new Date(),
      updatedAt: new Date()
    } as Blog;
  }

  private async generateKeywordList(site: Site, count: number): Promise<string[]> {
    const keywords: string[] = [];
    const seedKeywords = site.primaryKeywords.slice(0, 3);
    
    if (seedKeywords.length === 0) {
      // Fallback: generate from industry
      const generated = await keywordService.generateKeywords(
        site.industry,
        site.industry,
        count
      );
      return generated;
    }
    
    for (const seedKeyword of seedKeywords) {
      try {
        const generated = await keywordService.generateKeywords(
          seedKeyword,
          site.industry,
          Math.ceil(count / seedKeywords.length)
        );
        keywords.push(...generated);
      } catch (error) {
        console.error(`Failed to generate keywords for ${seedKeyword}:`, error);
      }
    }

    return keywords.slice(0, count);
  }

  private calculateSchedule(blogsPerWeek: number, totalBlogs: number): Date[] {
    const schedule: Date[] = [];
    const daysInterval = Math.floor(7 / blogsPerWeek);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(9, 0, 0, 0); // Set to 9 AM

    for (let i = 0; i < totalBlogs; i++) {
      const scheduledDate = new Date(startDate);
      scheduledDate.setDate(scheduledDate.getDate() + (i * daysInterval));
      
      // Skip weekends
      if (scheduledDate.getDay() === 0) scheduledDate.setDate(scheduledDate.getDate() + 1);
      if (scheduledDate.getDay() === 6) scheduledDate.setDate(scheduledDate.getDate() + 2);
      
      schedule.push(scheduledDate);
    }

    return schedule;
  }


  private generateTrackingId(): string {
    return `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const blogOrchestrator = new BlogOrchestrator();
