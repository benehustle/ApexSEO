import { blogService } from './blog.service';
import { siteService } from './site.service';

export class ContentPlanService {
  private geminiApiKey: string;
  private cachedGeminiModel: string | null = null;

  constructor() {
    this.geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  }

  /**
   * Get available Gemini model that supports generateContent
   */
  private async getAvailableGeminiModel(): Promise<string | null> {
    if (this.cachedGeminiModel) {
      return this.cachedGeminiModel;
    }

    if (!this.geminiApiKey) {
      return null;
    }

    try {
      // Try to list available models
      const listResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.geminiApiKey}`);
      if (listResponse.ok) {
        const data = await listResponse.json();
        const models = data.models || [];
        
        // Find a model that supports generateContent
        const supportedModel = models.find((m: any) => 
          m.supportedGenerationMethods?.includes('generateContent') &&
          (m.name.includes('flash') || m.name.includes('pro'))
        );
        
        if (supportedModel) {
          // Extract model name (remove 'models/' prefix if present)
          const modelName = supportedModel.name.replace('models/', '');
          this.cachedGeminiModel = modelName;
          console.log('Found available Gemini model:', modelName);
          return modelName;
        }
      }
    } catch (error) {
      console.warn('Failed to list Gemini models:', error);
    }

    // Fallback: try common model names in order
    const fallbackModels = [
      'gemini-2.0-flash-exp',
      'gemini-2.0-flash-thinking-exp',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-pro',
    ];

    // Cache the first working model
    for (const model of fallbackModels) {
      try {
        const testResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'test' }] }],
            }),
          }
        );
        
        if (testResponse.ok || testResponse.status === 400) {
          // 400 might mean the model exists but the request was invalid, which is fine
          this.cachedGeminiModel = model;
          console.log('Using Gemini model:', model);
          return model;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  /**
   * Call Gemini API with automatic model discovery and timeout
   */
  private async callGeminiAPI(prompt: string, timeoutMs: number = 15000): Promise<string | null> {
    const model = await this.getAvailableGeminiModel();
    if (!model) {
      console.warn('No available Gemini model found');
      return null;
    }

    // Try v1beta first, then v1
    const endpoints = [
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`,
      `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${this.geminiApiKey}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt,
              }],
            }],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          return text || null;
        } else if (response.status === 404) {
          // Try next endpoint
          continue;
        } else {
          const errorData = await response.text();
          console.error('Gemini API error:', response.status, response.statusText, errorData);
          return null;
        }
      } catch (fetchError: any) {
        if (fetchError.name === 'AbortError') {
          console.warn('Request timeout for endpoint:', endpoint);
          return null;
        }
        console.warn('Fetch error for endpoint:', endpoint, fetchError);
        continue;
      }
    }

    return null;
  }

  /**
   * Generate content plan for a month (client-side)
   */
  async generateContentPlan(siteId: string, monthCount: number = 1): Promise<{
    success: boolean;
    blogsCreated: number;
    blogIds: string[];
  }> {
    // Add overall timeout (5 minutes)
    const overallTimeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Content plan generation timed out after 5 minutes')), 300000)
    );

    return Promise.race([
      this._generateContentPlanInternal(siteId, monthCount),
      overallTimeout,
    ]);
  }

  private async _generateContentPlanInternal(siteId: string, monthCount: number = 1): Promise<{
    success: boolean;
    blogsCreated: number;
    blogIds: string[];
  }> {
    try {
      const site = await siteService.getSite(siteId);
      if (!site) {
        throw new Error('Site not found');
      }

      const primaryKeywords = site.primaryKeywords || [];
      if (primaryKeywords.length === 0) {
        throw new Error('Site must have primary keywords. Generate keywords first.');
      }

      // Update workflow state
      await siteService.updateSite(siteId, {
        workflowState: 'content_planning',
      });

      // Calculate number of posts needed
      const blogsPerWeek = site.blogsPerWeek || 2;
      const postsNeeded = Math.ceil(blogsPerWeek * 4 * monthCount); // 4 weeks per month

      // Basic clustering: Group keywords by similarity
      const clusters: Record<string, string[]> = {};
      primaryKeywords.forEach((keyword: string, index: number) => {
        const clusterId = `cluster_${Math.floor(index / 5)}`; // 5 keywords per cluster
        if (!clusters[clusterId]) {
          clusters[clusterId] = [];
        }
        clusters[clusterId].push(keyword);
      });

      // Identify pillar keywords (first keyword in each cluster)
      const pillarKeywords = Object.values(clusters).map((cluster) => cluster[0]);

      // Generate content plans
      const contentPlans: Array<{
        keyword: string;
        title: string;
        metaDescription: string;
        imagePrompt: string;
        blogDescription: string;
        semanticKeywords: string[];
        contentClusterId: string;
        isPillarPost: boolean;
      }> = [];

      // Generate plans in batches to avoid overwhelming the API
      const batchSize = 2; // Reduced batch size to avoid timeouts
      const keywordTimeout = 20000; // 20 seconds per keyword
      
      for (let i = 0; i < postsNeeded && i < primaryKeywords.length; i += batchSize) {
        const batch = primaryKeywords.slice(i, i + batchSize);
        console.log(`Generating content plans for batch ${Math.floor(i / batchSize) + 1}, keywords: ${batch.join(', ')}`);
        
        const batchPlans = await Promise.all(
          batch.map(async (keyword: string) => {
            console.log(`Processing keyword: ${keyword}`);
            const clusterId = Object.keys(clusters).find((id) => clusters[id].includes(keyword)) || 'cluster_0';
            const isPillarPost = pillarKeywords.includes(keyword);

            // Generate semantic keywords for this keyword (with timeout)
            let semanticKeywords: string[] = [];
            if (this.geminiApiKey) {
              try {
                console.log(`Generating semantic keywords for: ${keyword}`);
                const semanticText = await Promise.race([
                  this.callGeminiAPI(
                    `Generate 5-10 semantic keywords (related terms) for the keyword "${keyword}" in the ${site.industry} industry. Return ONLY a JSON array of strings.`
                  ),
                  new Promise<string | null>((_, reject) => 
                    setTimeout(() => reject(new Error('Semantic keywords generation timeout')), keywordTimeout)
                  )
                ]) as string | null;
                
                if (semanticText) {
                  const semanticJsonMatch = semanticText.match(/\[[\s\S]*\]/);
                  if (semanticJsonMatch) {
                    semanticKeywords = JSON.parse(semanticJsonMatch[0]);
                    console.log(`✓ Generated ${semanticKeywords.length} semantic keywords for ${keyword}`);
                  }
                }
              } catch (error) {
                console.warn(`Failed to generate semantic keywords for ${keyword}:`, error);
                // Continue without semantic keywords
              }
            }

            // Generate content plan for this keyword (with timeout)
            let planData: {
              title: string;
              metaDescription: string;
              imagePrompt: string;
              blogDescription: string;
            };

            if (this.geminiApiKey) {
              try {
                console.log(`Generating content plan for: ${keyword}`);
                
                // Load headline prompt template from Firestore
                const { promptService } = await import('./prompt.service');
                const prompts = await promptService.getPrompts(site.id);
                
                // Build headline prompt from template
                const headlinePrompt = prompts.headlinePromptTemplate
                  .replace(/{keyword}/g, keyword)
                  .replace(/{industry}/g, site.industry || 'General')
                  .replace(/{targetAudience}/g, site.targetAudience || 'General audience')
                  .replace(/{brandVoice}/g, site.brandVoice || 'Professional')
                  .replace(/{tonePreferences}/g, (site.tonePreferences || ['Professional']).join(', '));
                
                const planText = await Promise.race([
                  this.callGeminiAPI(headlinePrompt),
                  new Promise<string | null>((_, reject) => 
                    setTimeout(() => reject(new Error('Content plan generation timeout')), keywordTimeout)
                  )
                ]) as string | null;

                if (planText) {
                  console.log(`✓ Generated content plan for ${keyword}`);
                  let jsonString = planText.trim();

                  // Remove markdown code blocks if present
                  if (jsonString.startsWith('```')) {
                    const firstNewline = jsonString.indexOf('\n');
                    if (firstNewline !== -1) {
                      const jsonStart = firstNewline + 1;
                      const lastCodeBlock = jsonString.lastIndexOf('```');
                      if (lastCodeBlock > jsonStart) {
                        jsonString = jsonString.substring(jsonStart, lastCodeBlock).trim();
                      } else {
                        jsonString = jsonString.substring(jsonStart).trim();
                      }
                    }
                  }

                  // Extract JSON
                  if (!jsonString.startsWith('{')) {
                    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                      jsonString = jsonMatch[0];
                    }
                  }

                  planData = JSON.parse(jsonString);
                } else {
                  throw new Error('No response from API');
                }
              } catch (error: any) {
                console.error(`Failed to generate content plan for ${keyword}:`, error);
                // Use fallback plan data
                planData = {
                  title: `Planned: ${keyword}`,
                  metaDescription: `A blog post about ${keyword} for ${site.industry} businesses.`,
                  imagePrompt: `An image related to ${keyword} in the ${site.industry} industry.`,
                  blogDescription: `This blog post will cover various aspects of ${keyword}.`,
                };
              }
            } else {
              // No API key, use fallback
              planData = {
                title: `Planned: ${keyword}`,
                metaDescription: `A blog post about ${keyword} for ${site.industry} businesses.`,
                imagePrompt: `An image related to ${keyword} in the ${site.industry} industry.`,
                blogDescription: `This blog post will cover various aspects of ${keyword}.`,
              };
            }

            console.log(`✓ Completed processing for ${keyword}`);

            return {
              keyword,
              title: planData.title,
              metaDescription: planData.metaDescription,
              imagePrompt: planData.imagePrompt,
              blogDescription: planData.blogDescription,
              semanticKeywords,
              contentClusterId: clusterId,
              isPillarPost,
            };
          })
        );

        contentPlans.push(...batchPlans);
        console.log(`✓ Completed batch ${Math.floor(i / batchSize) + 1}, total plans: ${contentPlans.length}`);

        // Small delay between batches
        if (i + batchSize < postsNeeded && i + batchSize < primaryKeywords.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Calculate schedule based on blogsPerWeek
      const daysInterval = Math.floor(7 / blogsPerWeek);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 5); // Start 5 days from now
      startDate.setHours(9, 0, 0, 0);

      // Create blog documents with status "planned"
      const createdBlogs: string[] = [];
      for (let i = 0; i < contentPlans.length; i++) {
        const plan = contentPlans[i];
        const scheduledDate = new Date(startDate);
        scheduledDate.setDate(startDate.getDate() + (i * daysInterval));

        // Skip weekends
        if (scheduledDate.getDay() === 0) scheduledDate.setDate(scheduledDate.getDate() + 1);
        if (scheduledDate.getDay() === 6) scheduledDate.setDate(scheduledDate.getDate() + 2);

        const blogData: any = {
          siteId,
          userId: site.userId,
          title: plan.title,
          metaDescription: plan.metaDescription,
          content: '', // Will be generated later
          excerpt: plan.blogDescription,
          keyword: plan.keyword,
          relatedKeywords: [],
          featuredImageUrl: '',
          imagePrompt: plan.imagePrompt,
          blogDescription: plan.blogDescription,
          semanticKeywords: plan.semanticKeywords,
          contentClusterId: plan.contentClusterId,
          isPillarPost: plan.isPillarPost,
          internalLinks: [],
          externalLinks: [],
          wordCount: 0,
          status: 'planned',
          scheduledDate: scheduledDate,
          publishedDate: undefined, // Will be converted to null in createBlog
          wordpressPostId: undefined, // Will be converted to null in createBlog
          wordpressPostUrl: undefined, // Will be converted to null in createBlog
          trackingScriptId: '',
          trackingScript: '',
          totalViews: 0,
          uniqueVisitors: 0,
          avgTimeOnPage: 0,
          avgScrollDepth: 0,
          bounceRate: 0,
          lastViewedAt: undefined, // Will be converted to null in createBlog
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const blogId = await blogService.createBlog(blogData);
        createdBlogs.push(blogId);
      }

      // Update workflow state
      await siteService.updateSite(siteId, {
        workflowState: 'content_plan_complete',
      });

      console.log(`✓ Generated ${createdBlogs.length} content plans for site ${siteId}`);

      return {
        success: true,
        blogsCreated: createdBlogs.length,
        blogIds: createdBlogs,
      };
    } catch (error: any) {
      console.error('Error in generateContentPlan:', error);

      // Update workflow state to idle on error
      try {
        await siteService.updateSite(siteId, {
          workflowState: 'idle',
        });
      } catch (updateError) {
        console.error('Failed to update workflow state on error:', updateError);
      }

      throw error;
    }
  }
}

export const contentPlanService = new ContentPlanService();
