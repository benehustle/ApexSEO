import { KeywordWithVolume } from '../types/site';

export interface KeywordAnalysis {
  keyword: string;
  searchVolume: number;
  difficulty: number;
  opportunityScore: number;
  relatedKeywords: string[];
  youtubeVideos: Array<{ url: string; title: string; viewCount: number }>;
  analyzedAt: Date;
}

export class KeywordService {
  private dataForSeoLogin: string;
  private dataForSeoPassword: string;
  private youtubeApiKey: string;
  private geminiApiKey: string;
  private cachedGeminiModel: string | null = null;

  constructor() {
    this.dataForSeoLogin = import.meta.env.VITE_DATAFORSEO_LOGIN || '';
    this.dataForSeoPassword = import.meta.env.VITE_DATAFORSEO_PASSWORD || '';
    this.youtubeApiKey = import.meta.env.VITE_YOUTUBE_API_KEY || '';
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
   * Generate keywords with volume and difficulty check (client-side)
   */
  async generateKeywordsWithVolumeCheck(params: {
    seedKeyword: string;
    industry: string;
    country?: string;
    postcode?: string;
    minVolume?: number;
    maxDifficulty?: number;
    targetCount?: number;
  }): Promise<KeywordWithVolume[]> {
    const {
      seedKeyword,
      industry,
      country,
      postcode,
      minVolume = 200,
      maxDifficulty = 50,
      targetCount = 10,
    } = params;

    const goodKeywords: KeywordWithVolume[] = [];
    let attempts = 0;
    const maxAttempts = 10;

    // Helper function to get spelling preferences based on country
    const getSpellingContext = (countryCode?: string): string => {
      if (!countryCode) return '';

      const spellingMap: Record<string, string> = {
        'US': 'Use American English spelling (e.g., color, organize, center, analyze)',
        'AU': 'Use Australian English spelling (e.g., colour, organise, centre, analyse)',
        'GB': 'Use British English spelling (e.g., colour, organise, centre, analyse)',
        'CA': 'Use Canadian English spelling (e.g., colour, organize, centre, analyze)',
        'NZ': 'Use New Zealand English spelling (e.g., colour, organise, centre, analyse)',
        'IE': 'Use Irish English spelling (e.g., colour, organise, centre, analyse)',
        'ZA': 'Use South African English spelling (e.g., colour, organise, centre, analyse)',
        'IN': 'Use Indian English spelling (e.g., colour, organise, centre, analyse)',
        'SG': 'Use Singapore English spelling (e.g., colour, organise, centre, analyse)',
        'MY': 'Use Malaysian English spelling (e.g., colour, organise, centre, analyse)',
      };

      return spellingMap[countryCode] || '';
    };

    const locationContext = country ?
      `${country === 'US' ? 'United States' : country === 'AU' ? 'Australia' : country === 'GB' ? 'United Kingdom' : country === 'CA' ? 'Canada' : country === 'NZ' ? 'New Zealand' : country === 'IE' ? 'Ireland' : country === 'ZA' ? 'South Africa' : country === 'IN' ? 'India' : country === 'SG' ? 'Singapore' : country === 'MY' ? 'Malaysia' : country}` :
      '';

    const locationKeywords = country && postcode ?
      ` Include location-specific keywords like "${locationContext} ${postcode}", "near ${postcode}", "${locationContext} based", "local ${locationContext}"` :
      country ?
        ` Include location-specific keywords like "${locationContext} based", "in ${locationContext}", "local ${locationContext}"` :
        '';

    while (goodKeywords.length < targetCount && attempts < maxAttempts) {
      attempts++;
      console.log(`Attempt ${attempts}: Generating keywords, have ${goodKeywords.length}/${targetCount}`);

      // Generate 20 keywords using AI
      const currentSeed = attempts === 1 ? seedKeyword : goodKeywords[0]?.keyword || seedKeyword;

      let generatedKeywords: string[] = [];

      // Use Gemini API (supports CORS)
      if (this.geminiApiKey) {
        try {
          const model = await this.getAvailableGeminiModel();
          if (!model) {
            console.warn('No available Gemini model found, falling back to mock keywords');
          } else {
            // Try v1beta first, then v1
            const endpoints = [
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`,
              `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${this.geminiApiKey}`,
            ];

            let response: Response | null = null;
            for (const endpoint of endpoints) {
              try {
                response = await fetch(endpoint, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    contents: [{
                      parts: [{
                        text: `Generate 20 related keyword ideas for "${currentSeed}" in the ${industry} industry${locationContext ? ` targeting ${locationContext}` : ''}${postcode ? ` (postcode: ${postcode})` : ''}.

Generate a MIX of keyword types:
- Short keywords (2-4 words): High search volume, competitive
- Medium-tail keywords (4-6 words): Balanced volume and competition
- Long-tail keywords (6+ words): Lower competition, specific intent
- Question-based keywords: "how to", "what is", "why", "when", "where"
- Problem-solution keywords: Address specific pain points${locationKeywords}

${getSpellingContext(country) ? `${getSpellingContext(country)}.` : ''}

Prioritize keywords that are likely to have search volume ≥200 and difficulty <50.

Return ONLY a valid JSON array of strings. Do not include any explanation or other text.`,
                      }],
                    }],
                  }),
                });

                if (response.ok) {
                  const data = await response.json();
                  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (text) {
                    const jsonMatch = text.match(/\[[\s\S]*\]/);
                    if (jsonMatch) {
                      generatedKeywords = JSON.parse(jsonMatch[0]);
                      break; // Success, exit loop
                    }
                  }
                } else if (response.status === 404) {
                  // Try next endpoint
                  continue;
                } else {
                  const errorData = await response.text();
                  console.error('Gemini API error:', response.status, response.statusText, errorData);
                  break; // Non-404 error, don't try other endpoints
                }
              } catch (fetchError) {
                console.warn('Fetch error for endpoint:', endpoint, fetchError);
                continue;
              }
            }
          }
        } catch (error) {
          console.error('Failed to call Gemini API:', error);
        }
      }

      // Fallback to mock keywords if API fails
      if (generatedKeywords.length === 0) {
        generatedKeywords = this.generateMockKeywords(currentSeed, 20);
      }

      // Get search volumes and difficulty for all keywords
      for (const keyword of generatedKeywords) {
        if (goodKeywords.length >= targetCount) break;
        if (goodKeywords.some((k) => k.keyword === keyword)) continue;

        try {
          const analysis = await this.analyzeKeyword(keyword, '', country);
          const searchVolume = analysis.searchVolume;
          const difficulty = analysis.difficulty;

          // Filter: volume >= minVolume AND difficulty < maxDifficulty
          if (searchVolume >= minVolume && difficulty < maxDifficulty) {
            const opportunityScore = Math.round(((searchVolume / 1000) + (100 - difficulty)) / 2);
            goodKeywords.push({
              keyword,
              searchVolume,
              difficulty,
              opportunityScore,
            });
            console.log(`✓ Added keyword: ${keyword} (volume: ${searchVolume}, difficulty: ${difficulty})`);
          } else {
            console.log(`✗ Rejected keyword: ${keyword} (volume: ${searchVolume}, difficulty: ${difficulty})`);
          }
        } catch (error: any) {
          console.warn(`Error analyzing keyword ${keyword}:`, error.message);
        }
      }

      // Small delay to avoid rate limiting
      if (goodKeywords.length < targetCount && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Sort by opportunity score (highest first)
    goodKeywords.sort((a, b) => b.opportunityScore - a.opportunityScore);

    // Take top targetCount
    return goodKeywords.slice(0, targetCount);
  }

  async analyzeKeyword(keyword: string, _siteUrl: string, country?: string): Promise<KeywordAnalysis> {
    const [searchData, youtubeVideos] = await Promise.all([
      this.getSearchData(keyword, country),
      this.findRelevantVideos(keyword, 5),
    ]);

    const opportunityScore = this.calculateOpportunityScore(
      searchData.searchVolume,
      searchData.difficulty
    );

    return {
      keyword,
      searchVolume: searchData.searchVolume,
      difficulty: searchData.difficulty,
      opportunityScore,
      relatedKeywords: searchData.relatedKeywords,
      youtubeVideos,
      analyzedAt: new Date(),
    };
  }

  private async getSearchData(keyword: string, country?: string): Promise<{
    searchVolume: number;
    difficulty: number;
    relatedKeywords: string[];
  }> {
    if (!this.dataForSeoLogin || !this.dataForSeoPassword) {
      // Fallback to estimated values if DataForSEO not configured
      const hash = keyword.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const volumeBase = (hash * 13) % 100;
      let searchVolume;
      if (volumeBase > 90) searchVolume = 50000 + (hash % 50000);
      else if (volumeBase > 70) searchVolume = 10000 + (hash % 40000);
      else searchVolume = 100 + (hash % 5000);

      const difficulty = 20 + (hash % 60);
      const suffixes = ['guide', 'tips', 'best practices', 'examples', 'how to', 'tutorial', 'strategy', 'optimization'];
      const relatedKeywords = suffixes
        .slice(0, 3 + (hash % 3))
        .map((suffix) => `${keyword} ${suffix}`);

      return {
        searchVolume,
        difficulty,
        relatedKeywords,
      };
    }

    try {
      // Map country codes to DataForSEO location codes
      const locationCodeMap: Record<string, number> = {
        'US': 2840, // United States
        'AU': 2036, // Australia
        'GB': 2826, // United Kingdom
        'CA': 2124, // Canada
        'NZ': 5544, // New Zealand
        'IE': 2724, // Ireland
        'ZA': 4724, // South Africa
        'IN': 3564, // India
        'SG': 7024, // Singapore
        'MY': 4584, // Malaysia
      };

      const locationCode = country && locationCodeMap[country] ? locationCodeMap[country] : 2840;

      const auth = btoa(`${this.dataForSeoLogin}:${this.dataForSeoPassword}`);

      const response = await fetch('https://api.dataforseo.com/v3/keywords_data/google/search_volume/live', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{
          keywords: [keyword],
          location_code: locationCode,
          language_code: 'en',
        }]),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`DataForSEO API error for "${keyword}": ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
        throw new Error(`DataForSEO API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.tasks || !data.tasks[0] || !data.tasks[0].result || data.tasks[0].result.length === 0) {
        console.warn(`DataForSEO returned no results for "${keyword}"`);
        return {
          searchVolume: 0,
          difficulty: 50,
          relatedKeywords: [],
        };
      }

      const result = data.tasks[0].result[0];
      const searchVolume = result.search_volume || 0;
      const competition = result.competition;

      console.log(`DataForSEO result for "${keyword}": volume=${searchVolume}, competition=${competition}`);

      return {
        searchVolume,
        difficulty: this.estimateDifficulty(competition),
        relatedKeywords: result.keyword_suggestions?.slice(0, 10) || [],
      };
    } catch (error) {
      console.error('Failed to fetch keyword data from DataForSEO:', error);
      // Return fallback values
      return {
        searchVolume: 0,
        difficulty: 50,
        relatedKeywords: [],
      };
    }
  }

  private estimateDifficulty(competition: string | number | undefined): number {
    if (typeof competition === 'number') {
      // DataForSEO returns competition as 0-1 float, we want 0-100
      const normalized = competition <= 1 ? competition * 100 : competition;
      return Math.round(Math.min(Math.max(normalized, 0), 100));
    }

    const competitionMap: Record<string, number> = {
      'LOW': 25,
      'MEDIUM': 50,
      'HIGH': 75,
      'low': 25,
      'medium': 50,
      'high': 75,
    };

    return competitionMap[competition as string] || 50;
  }

  private calculateOpportunityScore(volume: number, difficulty: number): number {
    // Higher volume and lower difficulty = better opportunity
    const volumeScore = Math.min(volume / 1000, 100);
    const difficultyScore = 100 - difficulty;
    return Math.round((volumeScore + difficultyScore) / 2);
  }

  async findRelevantVideos(keyword: string, count: number = 3): Promise<Array<{ url: string; title: string; viewCount: number }>> {
    if (!this.youtubeApiKey) {
      console.warn('YouTube API key not configured');
      return [];
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&maxResults=${count}&order=relevance&key=${this.youtubeApiKey}`
      );

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        return [];
      }

      // Get video statistics for view counts
      const videoIds = data.items.map((item: any) => item.id.videoId).join(',');
      const statsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds}&key=${this.youtubeApiKey}`
      );

      let viewCounts: Record<string, number> = {};
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        statsData.items?.forEach((item: any) => {
          viewCounts[item.id] = parseInt(item.statistics.viewCount || '0', 10);
        });
      }

      return data.items.map((item: any) => ({
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        title: item.snippet.title,
        viewCount: viewCounts[item.id.videoId] || 0,
      }));
    } catch (error) {
      console.error('Failed to fetch YouTube videos:', error);
      return [];
    }
  }

  private generateMockKeywords(seed: string, count: number): string[] {
    const modifiers = [
      'guide', 'tutorial', 'best practices', 'examples', 'strategy',
      'for beginners', 'advanced', 'tips', 'trends 2024', 'case study',
      'checklist', 'template', 'tools', 'software', 'platform',
    ];

    return Array.from({ length: count }, (_, i) => {
      const modifier = modifiers[i % modifiers.length];
      return `${seed} ${modifier}`;
    });
  }

  /**
   * Generate keywords (legacy method for backward compatibility)
   */
  async generateKeywords(seedKeyword: string, _industry: string, count: number = 20): Promise<string[]> {
    // For MVP, just generate mock keywords
    return this.generateMockKeywords(seedKeyword, count);
  }

  /**
   * Batch analyze multiple keywords
   */
  async analyzeKeywords(keywords: string[], siteUrl: string): Promise<KeywordAnalysis[]> {
    const analyses = await Promise.all(
      keywords.map((keyword) => this.analyzeKeyword(keyword, siteUrl))
    );
    return analyses;
  }

  /**
   * Get top keywords by opportunity score
   */
  getTopKeywordsByOpportunity(analyses: KeywordAnalysis[], limit: number = 10): KeywordAnalysis[] {
    return analyses
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, limit);
  }
}

export const keywordService = new KeywordService();
