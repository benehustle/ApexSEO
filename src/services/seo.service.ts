import { Blog } from '../types/blog';
import { Site } from '../types/site';

/**
 * Generates image alt text from blog title and keyword
 */
export function generateImageAltText(title: string, keyword: string): string {
  return `${title} - ${keyword}`;
}

/**
 * Generates JSON-LD BlogPosting schema
 */
export function generateBlogPostingSchema(blog: Blog, site: Site, postUrl: string, authorName: string = 'Apex SEO'): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: blog.title,
    description: blog.metaDescription,
    image: blog.featuredImageUrl || undefined,
    author: {
      '@type': 'Organization',
      name: authorName,
      url: site.url
    },
    datePublished: blog.publishedDate?.toISOString() || new Date().toISOString(),
    dateModified: blog.updatedAt.toISOString(),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': postUrl
    },
    keywords: [blog.keyword, ...(blog.relatedKeywords || [])].join(', '),
    wordCount: blog.wordCount,
    articleBody: blog.content.replace(/<[^>]*>/g, ''), // Strip HTML for readability
  };

  // Remove undefined values
  Object.keys(schema).forEach(key =>
    (schema as any)[key] === undefined && delete (schema as any)[key]
  );

  return JSON.stringify(schema);
}

/**
 * Generates JSON-LD ImageObject schema
 */
export function generateImageObjectSchema(
  imageUrl: string,
  altText: string,
  width: number = 1200,
  height: number = 630
): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    url: imageUrl,
    description: altText,
    width: width,
    height: height
  };

  return JSON.stringify(schema);
}

/**
 * Generates JSON-LD Organization schema
 */
export function generateOrganizationSchema(site: Site): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    url: site.url,
    sameAs: [],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support'
    }
  };

  return JSON.stringify(schema);
}

/**
 * Generates Open Graph meta tags
 */
export function generateOpenGraphTags(blog: Blog, siteUrl: string, postUrl: string): Record<string, string> {
  return {
    'og:title': blog.title,
    'og:description': blog.metaDescription,
    'og:image': blog.featuredImageUrl || '',
    'og:url': postUrl,
    'og:type': 'article',
    'og:site_name': siteUrl
  };
}

/**
 * Generates Twitter Card meta tags
 */
export function generateTwitterCardTags(blog: Blog, postUrl: string, siteTwitterHandle?: string): Record<string, string> {
  const tags: Record<string, string> = {
    'twitter:card': 'summary_large_image',
    'twitter:title': blog.title,
    'twitter:description': blog.metaDescription,
    'twitter:image': blog.featuredImageUrl || '',
    'twitter:url': postUrl
  };

  if (siteTwitterHandle) {
    tags['twitter:creator'] = siteTwitterHandle;
    tags['twitter:site'] = siteTwitterHandle;
  }

  return tags;
}

/**
 * Combines all SEO metadata into a structured format
 */
export function generateSeoMetadata(
  blog: Blog,
  site: Site,
  postUrl: string,
  options?: {
    authorName?: string;
    twitterHandle?: string;
  }
) {
  const altText = generateImageAltText(blog.title, blog.keyword);

  return {
    altText,
    schemas: {
      blogPosting: generateBlogPostingSchema(blog, site, postUrl, options?.authorName),
      imageObject: generateImageObjectSchema(blog.featuredImageUrl || '', altText),
      organization: generateOrganizationSchema(site)
    },
    openGraph: generateOpenGraphTags(blog, site.url, postUrl),
    twitterCard: generateTwitterCardTags(blog, postUrl, options?.twitterHandle),
    canonical: postUrl,
    metaDescription: blog.metaDescription
  };
}

/**
 * Validates heading hierarchy in HTML content
 * Returns { valid: boolean, errors: string[] }
 */
export function validateHeadingHierarchy(htmlContent: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const headingRegex = /<h([1-6])(?:\s[^>]*)?>([^<]*)<\/h\1>/gi;

  let matches;
  let previousLevel = 0;
  let foundH1 = false;
  let h1Count = 0;

  while ((matches = headingRegex.exec(htmlContent)) !== null) {
    const level = parseInt(matches[1]);
    const text = matches[2];

    // Check for H1
    if (level === 1) {
      h1Count++;
      foundH1 = true;
    }

    // Validate hierarchy (no skipping levels)
    if (previousLevel > 0 && level > previousLevel + 1) {
      errors.push(`Heading hierarchy skipped from H${previousLevel} to H${level}: "${text}"`);
    }

    previousLevel = level;
  }

  // Check for exactly one H1
  if (h1Count === 0) {
    errors.push('Missing H1 heading. The blog title should be wrapped in <h1> tags.');
  } else if (h1Count > 1) {
    errors.push(`Found ${h1Count} H1 headings. There should only be one H1 per page.`);
  }

  if (!foundH1) {
    errors.push('No H1 tag found in content. The article must start with an H1 heading.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Wraps blog title in H1 and ensures proper heading structure
 * Converts bare text headings to proper H2 tags if needed
 */
export function fixHeadingHierarchy(htmlContent: string, title: string): string {
  let content = htmlContent;

  // Remove any existing H1 tags that aren't the title
  content = content.replace(/<h1(?:\s[^>]*)?>([^<]*)<\/h1>/gi, (match, text) => {
    if (text.toLowerCase().trim() === title.toLowerCase().trim()) {
      return match; // Keep this H1
    }
    return `<h2>${text}</h2>`; // Convert other H1s to H2
  });

  // If title isn't wrapped in H1, add it at the beginning
  if (!content.includes(`<h1>${title}</h1>`) && !content.includes(`<h1>${title}</h1>`)) {
    content = `<h1>${title}</h1>\n${content}`;
  }

  // Fix heading skips (H2 -> H4 should become H2 -> H3 -> H4)
  // This is more complex, so we'll mark them for now
  const headingRegex = /<h([1-6])(?:\s[^>]*)?>([^<]*)<\/h\1>/gi;
  let previousLevel = 1;

  content = content.replace(headingRegex, (match, level, text) => {
    level = parseInt(level);
    if (level === 1) return match; // Leave H1 alone

    if (level > previousLevel + 1) {
      // Fix by converting to appropriate level
      const correctLevel = previousLevel + 1;
      previousLevel = correctLevel;
      return `<h${correctLevel}>${text}</h${correctLevel}>`;
    }
    previousLevel = level;
    return match;
  });

  return content;
}

/**
 * Validates meta description length (target: 155 characters)
 * Returns validation result with warnings
 */
export function validateMetaDescription(metaDesc: string): {
  valid: boolean;
  length: number;
  warning?: string;
} {
  const length = metaDesc.length;
  const targetLength = 155;
  const minLength = 120;
  const maxLength = 160;

  let warning: string | undefined;

  if (length < minLength) {
    warning = `Meta description is ${length} chars (minimum: ${minLength}). Expand to capture more search results.`;
  } else if (length > maxLength) {
    warning = `Meta description is ${length} chars (maximum: ${maxLength}). May be truncated in search results.`;
  }

  return {
    valid: length >= minLength && length <= maxLength,
    length,
    warning
  };
}

/**
 * Generates URL-friendly slug from blog title optimized for keyword
 * Format: "keyword-words-from-title"
 */
export function generateSlug(title: string, keyword?: string): string {
  let slug = title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens

  // If keyword provided, try to include it at the start
  if (keyword) {
    const keywordSlug = keyword.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    // If keyword is not already in slug, prepend it
    if (!slug.includes(keywordSlug)) {
      slug = `${keywordSlug}-${slug}`;
    }
  }

  return slug.substring(0, 200); // Max URL length consideration
}

/**
 * Calculates Flesch-Kincaid readability score (0-100)
 * Higher score = easier to read
 * Score interpretation:
 * 90-100: Very easy (5th grade)
 * 80-90: Easy (6th grade)
 * 70-80: Fairly easy (7th grade)
 * 60-70: Standard (8th-9th grade)
 * 50-60: Fairly difficult (10th-12th grade)
 * 30-50: Difficult (College)
 * 0-30: Very difficult (College graduate)
 */
export function calculateReadabilityScore(htmlContent: string): number {
  // Remove HTML tags
  const text = htmlContent.replace(/<[^>]*>/g, '');

  // Count sentences (rough estimate)
  const sentenceCount = (text.match(/[.!?]+/g) || []).length || 1;

  // Count words
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length || 1;

  // Count syllables (simplified: count vowel groups)
  const syllableCount = words.reduce((sum, word) => {
    const syllables = (word.match(/[aeiou]+/gi) || []).length;
    return sum + Math.max(1, syllables); // Minimum 1 syllable per word
  }, 0);

  // Flesch-Kincaid Grade Level formula
  const gradeLevel = (0.39 * (wordCount / sentenceCount)) +
    (11.8 * (syllableCount / wordCount)) - 15.59;

  // Convert to Flesch Reading Ease (0-100)
  // Reading Ease = 206.835 - (1.015 × ASL) - (84.6 × ASP)
  // Where ASL = average sentence length, ASP = average syllables per word
  const readingEase = 206.835 -
    (1.015 * (wordCount / sentenceCount)) -
    (84.6 * (syllableCount / wordCount));

  // Clamp to 0-100
  return Math.max(0, Math.min(100, readingEase));
}

/**
 * Analyzes keyword density in content
 * Returns primary and secondary keyword frequencies
 */
export function analyzeKeywordDensity(
  htmlContent: string,
  primaryKeyword: string,
  secondaryKeywords?: string[]
): { primary: number; secondary: Record<string, number> } {
  // Remove HTML tags and normalize
  const text = htmlContent.replace(/<[^>]*>/g, ' ')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ');

  const words = text.split(/\s+/).filter(w => w.length > 0);
  const totalWords = words.length || 1;

  // Calculate primary keyword density
  const primaryWords = primaryKeyword.toLowerCase().split(/\s+/);
  let primaryCount = 0;

  for (let i = 0; i <= words.length - primaryWords.length; i++) {
    const phrase = words.slice(i, i + primaryWords.length).join(' ');
    if (phrase === primaryKeyword.toLowerCase()) {
      primaryCount++;
    }
  }

  const primaryDensity = (primaryCount / Math.max(1, totalWords - primaryWords.length)) * 100;

  // Calculate secondary keyword density
  const secondaryDensity: Record<string, number> = {};
  if (secondaryKeywords) {
    secondaryKeywords.forEach(keyword => {
      const keywordWords = keyword.toLowerCase().split(/\s+/);
      let count = 0;

      for (let i = 0; i <= words.length - keywordWords.length; i++) {
        const phrase = words.slice(i, i + keywordWords.length).join(' ');
        if (phrase === keyword.toLowerCase()) {
          count++;
        }
      }

      secondaryDensity[keyword] = (count / Math.max(1, totalWords - keywordWords.length)) * 100;
    });
  }

  return {
    primary: Math.round(primaryDensity * 100) / 100, // Round to 2 decimals
    secondary: Object.fromEntries(
      Object.entries(secondaryDensity).map(([k, v]) => [k, Math.round(v * 100) / 100])
    )
  };
}

/**
 * Optimizes content for featured snippets
 * Structures answers in list/table/definition format
 * Returns suggestions and formatted content
 */
export function optimizeForFeaturedSnippets(
  htmlContent: string,
  keyword: string
): { optimized: boolean; suggestions: string[] } {
  const suggestions: string[] = [];

  // Check for list structure
  const hasOrderedList = /<ol[^>]*>[\s\S]*?<\/ol>/i.test(htmlContent);
  const hasUnorderedList = /<ul[^>]*>[\s\S]*?<\/ul>/i.test(htmlContent);

  if (!hasOrderedList && !hasUnorderedList) {
    suggestions.push(`Add a numbered or bulleted list explaining "${keyword}"`);
  }

  // Check for table
  const hasTable = /<table[^>]*>[\s\S]*?<\/table>/i.test(htmlContent);
  if (!hasTable) {
    suggestions.push(`Consider adding a comparison table for "${keyword}"`);
  }

  // Check for definitions
  const hasDefinitions = /<(dt|dd)[^>]*>[\s\S]*?<\/(dt|dd)>/i.test(htmlContent) ||
    /<strong>.*?:<\/strong>\s*/.test(htmlContent);

  if (!hasDefinitions) {
    suggestions.push(`Add a clear definition or explanation of "${keyword}" (start with: "The definition of ${keyword} is..."`);
  }

  // Check for step-by-step guide
  const hasSteps = /step\s+\d|how\s+to|guide|tutorial/i.test(htmlContent);
  if (!hasSteps && htmlContent.toLowerCase().includes('how')) {
    suggestions.push(`Structure the content as numbered steps for better featured snippet eligibility`);
  }

  // Check for paragraph answer (should be < 40 words)
  const paragraphs = htmlContent.match(/<p[^>]*>([^<]*)<\/p>/gi) || [];
  const shortAnswers = paragraphs.filter(p => {
    const text = p.replace(/<[^>]*>/g, '');
    const wordCount = text.split(/\s+/).length;
    return wordCount > 0 && wordCount < 40;
  });

  const optimized = hasOrderedList || hasUnorderedList || hasTable || hasDefinitions || shortAnswers.length > 0;

  return { optimized, suggestions };
}

/**
 * Validates internal links in content
 * Checks that URLs are properly formatted and not broken
 */
export function validateInternalLinks(
  htmlContent: string,
  siteUrl: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const linkRegex = /<a\s+[^>]*href=['"]([^'"]+)['"]/gi;

  let match;
  const links = new Set<string>();

  while ((match = linkRegex.exec(htmlContent)) !== null) {
    const href = match[1];
    links.add(href);

    // Check for external links that should be internal
    if (!href.startsWith('http') && !href.startsWith('#')) {
      errors.push(`Relative link detected: "${href}" - should be absolute URL`);
    }

    // Check for empty or invalid links
    if (!href || href.trim() === '') {
      errors.push(`Empty link found - href is empty`);
    }

    // Check for unencoded special characters
    if (href.includes('  ') || href.includes('\n')) {
      errors.push(`Invalid link format: "${href.substring(0, 50)}..."`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Injects semantic keywords naturally throughout content
 * Suggests placement in headings and paragraphs
 */
export function suggestSemanticKeywordPlacement(
  htmlContent: string,
  semanticKeywords: string[]
): { suggestions: Array<{ keyword: string; location: string; placement: string }> } {
  const suggestions: Array<{ keyword: string; location: string; placement: string }> = [];
  const text = htmlContent.toLowerCase();

  semanticKeywords.forEach(keyword => {
    const lowerKeyword = keyword.toLowerCase();

    if (!text.includes(lowerKeyword)) {
      // Find good places to add the keyword
      const headings = htmlContent.match(/<h([2-3])[^>]*>([^<]*)<\/h\1>/gi) || [];

      if (headings.length > 1) {
        suggestions.push({
          keyword,
          location: 'Subheading',
          placement: `Add "${keyword}" to an H2 or H3 subheading`
        });
      }

      suggestions.push({
        keyword,
        location: 'Paragraph',
        placement: `Naturally incorporate "${keyword}" in a paragraph (especially 2nd or 3rd paragraph)`
      });
    }
  });

  return { suggestions };
}

export const seoService = {
  generateImageAltText,
  generateBlogPostingSchema,
  generateImageObjectSchema,
  generateOrganizationSchema,
  generateOpenGraphTags,
  generateTwitterCardTags,
  generateSeoMetadata,
  validateHeadingHierarchy,
  fixHeadingHierarchy,
  validateMetaDescription,
  generateSlug,
  calculateReadabilityScore,
  analyzeKeywordDensity,
  optimizeForFeaturedSnippets,
  validateInternalLinks,
  suggestSemanticKeywordPlacement
};
