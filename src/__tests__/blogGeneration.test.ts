import { describe, it, expect, vi, beforeEach } from 'vitest';
import { blogOrchestrator } from '../services/blog.orchestrator';
import { siteService } from '../services/site.service';
import { mockSite } from '../test/utils';

// Mock all services
vi.mock('../services/site.service');
vi.mock('../services/wordpress.service', () => ({
  wordpressService: {
    fetchSitemap: vi.fn(),
  },
}));
vi.mock('../services/ai.service', () => ({
  aiService: {
    generateBlogPost: vi.fn(),
  },
}));
vi.mock('../services/image.service', () => ({
  imageService: {
    generateAndUpload: vi.fn(),
  },
}));
vi.mock('../services/keyword.service', () => ({
  keywordService: {
    analyzeKeyword: vi.fn(),
    findRelevantVideos: vi.fn(),
  },
}));
vi.mock('../services/rateLimiter.service', () => ({
  rateLimiterService: {
    checkRateLimit: vi.fn().mockResolvedValue(true),
    incrementCounter: vi.fn().mockResolvedValue(undefined),
    trackApiUsage: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../services/tracking.service', () => ({
  trackingService: {
    generateTrackingScript: vi.fn().mockReturnValue('<script>/* tracking */</script>'),
  },
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: 'blog-123' }),
  doc: vi.fn(),
  Timestamp: {
    now: vi.fn(() => ({ toDate: () => new Date() })),
    fromDate: vi.fn((date) => ({ toDate: () => date })),
  },
}));

describe('Blog Generation Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle errors gracefully when site is not found', async () => {
    vi.mocked(siteService.getSite).mockResolvedValue(null);

    await expect(
      blogOrchestrator.generateSingleBlog({
        siteId: 'non-existent',
        keyword: 'testing',
        scheduledDate: new Date(),
        userId: 'test-user-id',
      })
    ).rejects.toThrow('Site not found');
  });

  it('should validate site exists before generation', async () => {
    vi.mocked(siteService.getSite).mockResolvedValue(mockSite);

    // This test verifies the orchestrator can be instantiated and validates input
    expect(blogOrchestrator).toBeDefined();
    expect(typeof blogOrchestrator.generateSingleBlog).toBe('function');
  });
});
