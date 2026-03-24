export interface KeywordWithVolume {
  keyword: string;
  searchVolume: number;
  difficulty: number;
  opportunityScore: number;
  competitorInsights?: {
    avgWordCount: number;
    commonHeadings: string[];
    semanticKeywords: string[];
    contentStructure: string;
  };
}

export interface Site {
  id: string;
  userId: string;
  name: string;
  url: string;
  wordpressApiUrl: string;
  wordpressUsername: string;
  wordpressAppPassword: string;
  industry: string;
  targetAudience: string;
  brandVoice: string;
  tonePreferences: string[];
  contentGoals: string;
  competitors: string[];
  primaryKeywords: string[]; // Legacy: kept for backward compatibility
  primaryKeywordsWithData?: KeywordWithVolume[]; // New: stores full keyword data with volumes
  contentRestrictions: string;
  blogsPerWeek: number;
  country?: string; // Country code (e.g., 'US', 'AU', 'GB', 'CA')
  postcode?: string; // Postcode/ZIP code for location targeting
  sitemapUrl?: string; // Custom XML sitemap URL (if different from default /wp-sitemap.xml)
  sitemapMetadata?: Array<{url: string; title: string; metaDescription: string}>; // Cached sitemap with metadata
  blogsGenerated: number;
  status: 'pending' | 'connected' | 'error';
  isActive?: boolean; // Default true
  autoApproveBlogs?: boolean; // Default: false
  workflowState?: 'idle' | 'keywords_generating' | 'keywords_complete' | 'content_planning' | 'content_plan_complete';
  errorState?: {
    message: string;
    lastErrorAt: Date;
  };
  /** Email to send this site's monthly report to (the client). */
  clientReportEmail?: string;
  /** Whether to send the monthly report to clientReportEmail. */
  receiveMonthlyReport?: boolean;
  createdAt: Date;
  updatedAt: Date;
}
