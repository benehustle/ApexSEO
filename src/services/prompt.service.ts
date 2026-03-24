import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { PromptConfig } from '../types/feedback';

// Default prompts (fallback)
const DEFAULT_BLOG_SYSTEM_PROMPT = `You are an expert content writer creating blog posts.

BRAND CONTEXT:
- Industry: {industry}
- Target Audience: {targetAudience}
- Brand Voice: {brandVoice}
- Tone: {tonePreferences}
- Content Goals: {contentGoals}
- Restrictions: {contentRestrictions}

HUMANIZATION RULES (CRITICAL):
1. Write naturally and conversationally - as a human expert would
2. Vary sentence length (mix short punchy sentences with longer detailed ones)
3. Use contractions (don't, can't, you'll) to sound natural
4. Include rhetorical questions to engage readers
5. Use transitional phrases organically
6. Add personal touches and examples
7. Avoid AI-sounding phrases like "delve into", "in conclusion", "it's important to note", "in today's digital landscape"
8. Use active voice primarily (at least 80% of sentences)
9. Include specific, concrete examples rather than generic statements
10. Show personality - be enthusiastic, curious, or thoughtful where appropriate

SEO BEST PRACTICES:
- Include keyword naturally in title, first paragraph, and 2-3 subheadings
- Use H2 and H3 tags for structure
- Write compelling meta description (155 characters)
- Include related keywords naturally
- Optimize for featured snippets with clear answers

STRUCTURE:
1. Engaging title (under 60 characters, includes keyword)
2. Meta description (exactly 155 characters)
3. Hook introduction (problem + empathy + solution preview)
4. Body with H2/H3 subheadings
5. Practical examples and actionable insights
6. Conclusion with clear call-to-action

OUTPUT FORMAT: JSON
{
  "title": "...",
  "metaDescription": "...",
  "content": "... (HTML formatted)",
  "excerpt": "..."
}`;

const DEFAULT_BLOG_USER_PROMPT_TEMPLATE = `Create a {wordCount}-word blog post about "{keyword}".

{semanticKeywordsText}
{competitorInsightsText}
INTERNAL LINKING OPPORTUNITIES:
{internalLinksText}

YOUTUBE VIDEOS TO REFERENCE:
{youtubeLinksText}

Requirements:
- Write the FULL article content in the "content" field ({wordCount} words minimum)
- Use HTML formatting: <h2> for main sections, <h3> for subsections, <p> for paragraphs
- Naturally include 2-4 internal links to the URLs provided (use <a href="...">anchor text</a>)
- Reference 1-2 of the YouTube videos where relevant
- Make it engaging, informative, and SEO-optimized
- Sound completely human-written, not AI-generated
- Include specific examples and actionable advice
- The "content" field must contain the complete article, not just a summary

Return ONLY valid JSON with no additional text. The "content" field is REQUIRED and must not be empty.`;

const DEFAULT_IMAGE_PROMPT_TEMPLATE = `Create a professional, high-quality featured image for a blog post.

Title: {blogTitle}
Summary: {blogSummary}
Industry: {industry}
Style: {style}

Requirements:
- Professional and visually appealing
- No text or words in the image
- Relevant to the blog topic
- Modern and clean design
- Suitable for {industry} industry
- {style} style`;

const DEFAULT_HEADLINE_PROMPT_TEMPLATE = `Generate a content plan for a blog post about "{keyword}" for a {industry} website.

Brand Context:
- Industry: {industry}
- Target Audience: {targetAudience}
- Brand Voice: {brandVoice}
- Tone: {tonePreferences}

Return ONLY valid JSON:
{
  "title": "Engaging blog title (under 60 chars, includes keyword)",
  "metaDescription": "SEO meta description (exactly 155 characters)",
  "imagePrompt": "Detailed prompt for DALL-E image generation",
  "blogDescription": "Brief description of what the blog will cover (max 50 words)"
}`;

// In-memory cache with TTL
interface CachedPrompt {
  config: PromptConfig;
  cachedAt: number;
}

const promptCache = new Map<string, CachedPrompt>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class PromptService {
  async getPrompts(siteId: string): Promise<PromptConfig> {
    // Check cache first
    const cached = promptCache.get(siteId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
      return cached.config;
    }

    try {
      const docRef = doc(db, 'prompts', siteId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const config: PromptConfig = {
          siteId: data.siteId,
          blogSystemPrompt: data.blogSystemPrompt,
          blogUserPromptTemplate: data.blogUserPromptTemplate,
          imagePromptTemplate: data.imagePromptTemplate,
          headlinePromptTemplate: data.headlinePromptTemplate,
          version: data.version || 1,
          updatedAt: data.updatedAt?.toDate() || new Date(),
          updatedBy: data.updatedBy || 'system',
          changeLog: data.changeLog || [],
        };

        // Update cache
        promptCache.set(siteId, {
          config,
          cachedAt: Date.now(),
        });

        return config;
      } else {
        // Return default prompts for new sites
        const defaultConfig: PromptConfig = {
          siteId,
          blogSystemPrompt: DEFAULT_BLOG_SYSTEM_PROMPT,
          blogUserPromptTemplate: DEFAULT_BLOG_USER_PROMPT_TEMPLATE,
          imagePromptTemplate: DEFAULT_IMAGE_PROMPT_TEMPLATE,
          headlinePromptTemplate: DEFAULT_HEADLINE_PROMPT_TEMPLATE,
          version: 1,
          updatedAt: new Date(),
          updatedBy: 'system',
          changeLog: ['Initial default prompts'],
        };

        // Cache defaults
        promptCache.set(siteId, {
          config: defaultConfig,
          cachedAt: Date.now(),
        });

        // Optionally save defaults to Firestore for future reference
        // await this.initializePrompts(siteId);

        return defaultConfig;
      }
    } catch (error) {
      console.error('Failed to get prompts, using defaults:', error);
      // Return defaults on error
      return {
        siteId,
        blogSystemPrompt: DEFAULT_BLOG_SYSTEM_PROMPT,
        blogUserPromptTemplate: DEFAULT_BLOG_USER_PROMPT_TEMPLATE,
        imagePromptTemplate: DEFAULT_IMAGE_PROMPT_TEMPLATE,
        headlinePromptTemplate: DEFAULT_HEADLINE_PROMPT_TEMPLATE,
        version: 1,
        updatedAt: new Date(),
        updatedBy: 'system',
        changeLog: ['Error loading prompts, using defaults'],
      };
    }
  }

  async initializePrompts(siteId: string, _siteData?: any): Promise<void> {
    try {
      const docRef = doc(db, 'prompts', siteId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        // Store prompts WITH placeholders - they will be replaced at runtime
        const config: PromptConfig = {
          siteId,
          blogSystemPrompt: DEFAULT_BLOG_SYSTEM_PROMPT, // Keep placeholders for runtime replacement
          blogUserPromptTemplate: DEFAULT_BLOG_USER_PROMPT_TEMPLATE,
          imagePromptTemplate: DEFAULT_IMAGE_PROMPT_TEMPLATE,
          headlinePromptTemplate: DEFAULT_HEADLINE_PROMPT_TEMPLATE,
          version: 1,
          updatedAt: new Date(),
          updatedBy: 'system',
          changeLog: ['Initial prompts created'],
        };

        await setDoc(docRef, {
          ...config,
          updatedAt: Timestamp.now(),
        });

        // Update cache
        promptCache.set(siteId, {
          config,
          cachedAt: Date.now(),
        });
      }
    } catch (error) {
      console.error('Failed to initialize prompts:', error);
    }
  }

  clearCache(siteId?: string): void {
    if (siteId) {
      promptCache.delete(siteId);
    } else {
      promptCache.clear();
    }
  }
}

export const promptService = new PromptService();
