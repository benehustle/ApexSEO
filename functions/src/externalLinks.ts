/**
 * External Links Search Worker
 * Searches the internet for relevant content to use as external links in blog posts
 */

import axios from "axios";

interface ExternalLink {
  title: string;
  url: string;
  snippet?: string;
  domain?: string;
}

/**
 * Search for relevant external links using Google Custom Search API
 * @param {string} keyword - The keyword to search for
 * @param {string} [siteContext] - Optional site context for more targeted results
 * @return {Promise<Array<ExternalLink>>} Array of relevant external links
 */
export async function searchExternalLinks(
  keyword: string,
  siteContext?: string
): Promise<Array<ExternalLink>> {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    console.warn(
      "[searchExternalLinks] Google Custom Search API key or Engine ID not found. Skipping external link search."
    );
    return [];
  }

  if (!keyword || keyword.trim().length === 0) {
    console.warn("[searchExternalLinks] Keyword is empty");
    return [];
  }

  try {
    // Construct search query - prioritize authoritative sources
    const searchQuery = siteContext ?
      `${keyword} ${siteContext} site:.edu OR site:.gov OR site:.org` :
      `${keyword} site:.edu OR site:.gov OR site:.org OR "research" OR "study"`;

    console.log(`[searchExternalLinks] Searching for external links with query: ${searchQuery}`);

    const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
      params: {
        key: apiKey,
        cx: searchEngineId,
        q: searchQuery,
        num: 5, // Get top 5 results
        safe: "active",
      },
      timeout: 15000, // 15 second timeout
    });

    const links: Array<ExternalLink> = [];

    if (response.data.items && response.data.items.length > 0) {
      for (const item of response.data.items) {
        // Filter out YouTube, social media, and low-quality domains
        const url = item.link || "";
        const domain = new URL(url).hostname.toLowerCase();

        // Skip YouTube and social media
        if (
          domain.includes("youtube.com") ||
          domain.includes("youtu.be") ||
          domain.includes("facebook.com") ||
          domain.includes("twitter.com") ||
          domain.includes("linkedin.com") ||
          domain.includes("instagram.com") ||
          domain.includes("tiktok.com")
        ) {
          continue;
        }

        // Prefer authoritative domains (checking but not storing result)
        const isAuthoritativeDomain =
          domain.includes(".edu") ||
          domain.includes(".gov") ||
          domain.includes(".org") ||
          domain.includes("wikipedia.org") ||
          domain.includes("mayo") ||
          domain.includes("webmd") ||
          domain.includes("nih.gov") ||
          domain.includes("cdc.gov");
        // Note: isAuthoritativeDomain is checked but not currently used for filtering
        // Keeping the check for potential future use
        void isAuthoritativeDomain;

        links.push({
          title: item.title || "Untitled",
          url: url,
          snippet: item.snippet || "",
          domain: domain,
        });

        // Stop at 3-4 high-quality links
        if (links.length >= 4) {
          break;
        }
      }
    }

    // If we didn't get enough authoritative links, do a second search without domain restrictions
    if (links.length < 3) {
      try {
        const fallbackQuery = `${keyword} guide OR tips OR best practices`;
        console.log(`[searchExternalLinks] Fallback search: ${fallbackQuery}`);

        const fallbackResponse = await axios.get("https://www.googleapis.com/customsearch/v1", {
          params: {
            key: apiKey,
            cx: searchEngineId,
            q: fallbackQuery,
            num: 3,
            safe: "active",
          },
          timeout: 15000,
        });

        if (fallbackResponse.data.items && fallbackResponse.data.items.length > 0) {
          for (const item of fallbackResponse.data.items) {
            const url = item.link || "";
            const domain = new URL(url).hostname.toLowerCase();

            // Skip if already added or if it's YouTube/social media
            if (
              links.some((l) => l.url === url) ||
              domain.includes("youtube.com") ||
              domain.includes("youtu.be") ||
              domain.includes("facebook.com") ||
              domain.includes("twitter.com")
            ) {
              continue;
            }

            links.push({
              title: item.title || "Untitled",
              url: url,
              snippet: item.snippet || "",
              domain: domain,
            });

            if (links.length >= 5) {
              break;
            }
          }
        }
      } catch (fallbackError: any) {
        console.warn(`[searchExternalLinks] Fallback search failed: ${fallbackError.message}`);
      }
    }

    console.log(`[searchExternalLinks] ✅ Found ${links.length} external links for keyword: ${keyword}`);
    return links;
  } catch (error: any) {
    console.error("[searchExternalLinks] ❌ Error searching external links:", error.message);
    // Return empty array on error - don't block blog generation
    return [];
  }
}

/**
 * Format external links for AI prompt
 * @param {Array<ExternalLink>} links - Array of external links
 * @return {string} Formatted string for prompt
 */
export function formatExternalLinksForPrompt(links: Array<ExternalLink>): string {
  if (links.length === 0) {
    return "No external links available";
  }

  return links
    .map(
      (link, index) =>
        `${index + 1}. ${link.title} - ${link.url}${link.snippet ? `\n   ${link.snippet.substring(0, 150)}...` : ""}`
    )
    .join("\n");
}
