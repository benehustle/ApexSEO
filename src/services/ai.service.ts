import { Site } from '../types/site';
import { functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';

interface BlogGenerationParams {
  keyword: string;
  siteContext: Site;
  internalLinks: string[];
  youtubeLinks: Array<{ url: string; title: string }>;
  wordCount: number;
}

export class AIContentService {
  /**
   * Queue a blog generation job (returns immediately with jobId)
   * The blog will be generated asynchronously and saved to Firestore
   */
  async generateBlogPost(params: BlogGenerationParams & {
    siteId: string;
    scheduledDate?: Date;
    userId?: string;
  }): Promise<{ jobId: string; status: string }> {
    try {
      const queueBlogGenerationFn = httpsCallable(functions, 'queueBlogGeneration');
      const result = await queueBlogGenerationFn({
        keyword: params.keyword,
        siteId: params.siteId,
        siteContext: params.siteContext,
        internalLinks: params.internalLinks,
        youtubeLinks: params.youtubeLinks,
        wordCount: params.wordCount,
        scheduledDate: params.scheduledDate?.toISOString(),
        userId: params.userId
      });
      
      const data = result.data as { jobId: string; status: string };
      return data;
    } catch (error) {
      console.error('Failed to queue blog generation:', error);
      throw error;
    }
  }

  async generateBlogIdeas(siteContext: Site, count: number = 10): Promise<string[]> {
    try {
      const generateBlogIdeasFn = httpsCallable(functions, 'generateBlogIdeas');
      const result = await generateBlogIdeasFn({ siteContext, count });
      const data = result.data as any;
      return data.ideas;
    } catch (error) {
      console.error('Failed to generate blog ideas:', error);
      throw error;
    }
  }

}

export const aiService = new AIContentService();
