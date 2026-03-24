export interface Blog {
  id: string;
  siteId: string;
  userId: string;
  title: string;
  metaDescription: string;
  content: string;
  excerpt: string;
  keyword: string;
  relatedKeywords: string[];
  featuredImageUrl: string;
  internalLinks: Array<{ url: string; anchorText: string }>;
  externalLinks: Array<{ url: string; anchorText: string; type: 'youtube' }>;
  wordCount: number;
  status: 'planned' | 'pending' | 'approved' | 'rejected' | 'scheduled' | 'published';
  scheduledDate: Date;
  publishedDate?: Date;
  wordpressPostId?: number;
  wordpressPostUrl?: string;
  trackingScriptId: string;
  trackingScript?: string;
  totalViews: number;
  uniqueVisitors: number;
  avgTimeOnPage: number;
  avgScrollDepth: number;
  bounceRate: number;
  lastViewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // New fields for content plans
  imagePrompt?: string;
  blogDescription?: string; // 50 words max
  semanticKeywords?: string[]; // Related keywords for topical authority
  contentClusterId?: string; // Links related posts in a cluster
  isPillarPost?: boolean; // True for main topic posts
  competitorInsights?: {
    avgWordCount: number;
    commonHeadings: string[];
    contentStructure: string;
  }; // From Section 1 analysis
  manuallyEdited?: boolean; // True if user edited before publish
  generationJobId?: string; // ID of the blog generation job
  errorState?: {
    message: string;
    retryCount: number;
    lastErrorAt: Date;
  };
}
