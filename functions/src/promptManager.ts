import * as admin from "firebase-admin";

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
  "content": "... (HTML formatted - MUST contain full article text, minimum word count required)",
  "excerpt": "..."
}

CRITICAL: The "content" field MUST contain the complete, full article text in HTML format. It cannot be empty, cannot be a summary, and must meet the minimum word count requirement.`;

const DEFAULT_BLOG_USER_PROMPT_TEMPLATE = `Create a {wordCount}-word blog post about "{keyword}".

{semanticKeywordsText}
{competitorInsightsText}
INTERNAL LINKING OPPORTUNITIES:
{internalLinksText}

EXTERNAL LINKS TO REFERENCE:
{externalLinksText}

CRITICAL REQUIREMENTS:
- You MUST write the FULL article content in the "content" field
- The "content" field must contain at least {wordCount} words of actual article text
- Use HTML formatting: <h2> for main sections, <h3> for subsections, <p> for paragraphs
- Naturally include 2-4 internal links to the URLs provided (use <a href="...">anchor text</a>)
- Link to 2-3 of the external sources where they support key claims or add credibility (use <a href="URL" target="_blank" rel="noopener noreferrer">anchor text</a>)
- Make it engaging, informative, and SEO-optimized
- Sound completely human-written, not AI-generated
- Include specific examples and actionable advice
- The "content" field must contain the COMPLETE FULL ARTICLE TEXT, not a summary, not empty, not placeholder text

OUTPUT FORMAT - Return ONLY valid JSON with no additional text:
{
  "title": "Full blog post title here",
  "metaDescription": "SEO meta description (155 characters)",
  "content": "FULL ARTICLE CONTENT HERE IN HTML FORMAT - THIS MUST BE THE COMPLETE ARTICLE WITH AT LEAST {wordCount} WORDS",
  "excerpt": "Brief excerpt or summary"
}

IMPORTANT: The "content" field is MANDATORY and must contain the full article text. Do not leave it empty or use placeholder text.`;

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

export interface PromptConfig {
  siteId: string;
  blogSystemPrompt: string;
  blogUserPromptTemplate: string;
  imagePromptTemplate: string;
  headlinePromptTemplate: string;
  version: number;
  updatedAt: admin.firestore.Timestamp;
  updatedBy: "system" | "user";
  changeLog: string[];
}

// In-memory cache with TTL
interface CachedPrompt {
  config: PromptConfig;
  cachedAt: number;
}

const promptCache = new Map<string, CachedPrompt>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getPrompts(siteId: string): Promise<PromptConfig> {
  // Check cache first
  const cached = promptCache.get(siteId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    console.log(`[getPrompts] Using cached prompts for site ${siteId} (version ${cached.config.version})`);
    return cached.config;
  }

  try {
    const docRef = admin.firestore().doc(`prompts/${siteId}`);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const data = docSnap.data();
      if (!data) {
        throw new Error("Document exists but data is null");
      }

      // Validate required fields
      if (!data.blogSystemPrompt || !data.blogUserPromptTemplate) {
        console.error(`[getPrompts] Missing required prompt fields for site ${siteId}`);
        throw new Error("Missing required prompt fields in Firestore document");
      }

      const config: PromptConfig = {
        siteId: data.siteId || siteId,
        blogSystemPrompt: data.blogSystemPrompt,
        blogUserPromptTemplate: data.blogUserPromptTemplate,
        imagePromptTemplate: data.imagePromptTemplate || DEFAULT_IMAGE_PROMPT_TEMPLATE,
        headlinePromptTemplate: data.headlinePromptTemplate || DEFAULT_HEADLINE_PROMPT_TEMPLATE,
        version: data.version || 1,
        updatedAt: data.updatedAt || admin.firestore.Timestamp.now(),
        updatedBy: data.updatedBy || "system",
        changeLog: data.changeLog || [],
      };

      // Update cache
      promptCache.set(siteId, {
        config,
        cachedAt: Date.now(),
      });

      console.log(`[getPrompts] Loaded prompts from Firestore for site ${siteId} (version ${config.version})`);
      return config;
    } else {
      // Return default prompts for new sites
      console.log(`[getPrompts] No prompts found in Firestore for site ${siteId}, using defaults`);
      const defaultConfig: PromptConfig = {
        siteId,
        blogSystemPrompt: DEFAULT_BLOG_SYSTEM_PROMPT,
        blogUserPromptTemplate: DEFAULT_BLOG_USER_PROMPT_TEMPLATE,
        imagePromptTemplate: DEFAULT_IMAGE_PROMPT_TEMPLATE,
        headlinePromptTemplate: DEFAULT_HEADLINE_PROMPT_TEMPLATE,
        version: 1,
        updatedAt: admin.firestore.Timestamp.now(),
        updatedBy: "system",
        changeLog: ["Initial default prompts"],
      };

      // Cache defaults
      promptCache.set(siteId, {
        config: defaultConfig,
        cachedAt: Date.now(),
      });

      return defaultConfig;
    }
  } catch (error: any) {
    console.error(`[getPrompts] Failed to get prompts for site ${siteId}, using defaults:`, error);
    // Return defaults on error
    return {
      siteId,
      blogSystemPrompt: DEFAULT_BLOG_SYSTEM_PROMPT,
      blogUserPromptTemplate: DEFAULT_BLOG_USER_PROMPT_TEMPLATE,
      imagePromptTemplate: DEFAULT_IMAGE_PROMPT_TEMPLATE,
      headlinePromptTemplate: DEFAULT_HEADLINE_PROMPT_TEMPLATE,
      version: 1,
      updatedAt: admin.firestore.Timestamp.now(),
      updatedBy: "system",
      changeLog: ["Error loading prompts, using defaults"],
    };
  }
}

export async function initializePrompts(siteId: string, _siteContext: any): Promise<void> {
  try {
    const docRef = admin.firestore().doc(`prompts/${siteId}`);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      // Store prompts WITH placeholders - they will be replaced at runtime
      const config: PromptConfig = {
        siteId,
        blogSystemPrompt: DEFAULT_BLOG_SYSTEM_PROMPT, // Keep placeholders for runtime replacement
        blogUserPromptTemplate: DEFAULT_BLOG_USER_PROMPT_TEMPLATE,
        imagePromptTemplate: DEFAULT_IMAGE_PROMPT_TEMPLATE,
        headlinePromptTemplate: DEFAULT_HEADLINE_PROMPT_TEMPLATE,
        version: 1,
        updatedAt: admin.firestore.Timestamp.now(),
        updatedBy: "system",
        changeLog: ["Initial prompts created"],
      };

      await docRef.set(config);
      console.log(`[initializePrompts] Initialized prompts for site ${siteId}`);

      // Update cache
      promptCache.set(siteId, {
        config,
        cachedAt: Date.now(),
      });
    } else {
      console.log(`[initializePrompts] Prompts already exist for site ${siteId}`);
    }
  } catch (error: any) {
    console.error(`[initializePrompts] Failed to initialize prompts for site ${siteId}:`, error);
    // Don't throw - getPrompts will use defaults if initialization fails
    // This prevents blog generation from failing if there's a Firestore permission issue
  }
}

export function clearPromptCache(siteId?: string): void {
  if (siteId) {
    promptCache.delete(siteId);
  } else {
    promptCache.clear();
  }
}
