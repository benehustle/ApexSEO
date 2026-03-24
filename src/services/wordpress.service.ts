/**
 * WordPress REST API Service
 * Handles all WordPress API interactions including posts, media, and sitemap
 */

export class WordPressService {
  /**
   * Normalize API URL to ensure it ends with /wp-json
   */
  private normalizeApiUrl(apiUrl: string): string {
    if (apiUrl.endsWith('/wp-json')) {
      return apiUrl;
    }
    if (apiUrl.endsWith('/wp-json/')) {
      return apiUrl.slice(0, -1);
    }
    return `${apiUrl.replace(/\/$/, '')}/wp-json`;
  }

  /**
   * Make authenticated request to WordPress REST API
   */
  private async makeRequest(
    apiUrl: string,
    username: string,
    appPassword: string,
    endpoint: string,
    method: string = 'GET',
    body?: any
  ) {
    const normalizedUrl = this.normalizeApiUrl(apiUrl);
    const auth = btoa(`${username}:${appPassword}`);
    
    const response = await fetch(`${normalizedUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `WordPress API error: ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorMessage;
      } catch {
        // If parsing fails, use the text as is
        if (errorText) {
          errorMessage = errorText;
        }
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * Test WordPress connection
   */
  async testConnection(apiUrl: string, username: string, appPassword: string): Promise<boolean> {
    try {
      await this.makeRequest(apiUrl, username, appPassword, '/wp/v2/posts?per_page=1');
      return true;
    } catch (error) {
      console.error('WordPress connection test failed:', error);
      return false;
    }
  }

  /**
   * Fetch sitemap URLs from WordPress via Cloud Function
   */
  async fetchSitemap(siteUrl: string, customSitemapUrl?: string): Promise<string[]> {
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../config/firebase');
      
      const fetchSitemapFn = httpsCallable(functions, 'fetchSitemap');
      const result = await fetchSitemapFn({ 
        siteUrl,
        customSitemapUrl 
      });
      const data = result.data as { urls: string[] };
      return data.urls || [];
    } catch (error) {
      console.error('Failed to fetch sitemap via Cloud Function:', error);
      // Return empty array on error to allow blog generation to continue
      return [];
    }
  }

  /**
   * Upload image to WordPress media library
   */
  async uploadImage(
    apiUrl: string,
    username: string,
    appPassword: string,
    imageBlob: Blob,
    filename: string,
    metadata?: {
      altText?: string;
      title?: string;
      description?: string;
      caption?: string;
    }
  ) {
    const normalizedUrl = this.normalizeApiUrl(apiUrl);
    const auth = btoa(`${username}:${appPassword}`);
    const formData = new FormData();
    formData.append('file', imageBlob, filename);

    const response = await fetch(`${normalizedUrl}/wp/v2/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to upload image to WordPress' }));
      throw new Error(error.message || 'Failed to upload image to WordPress');
    }

    const data = await response.json();
    const imageId = data.id;

    // If metadata is provided, update the image with alt text and other fields
    if (metadata) {
      await this.updateImageMetadata(apiUrl, username, appPassword, imageId, metadata);
    }

    return { id: imageId, url: data.source_url };
  }

  /**
   * Update WordPress media metadata (alt text, title, description, caption)
   */
  async updateImageMetadata(
    apiUrl: string,
    username: string,
    appPassword: string,
    mediaId: number,
    metadata: {
      altText?: string;
      title?: string;
      description?: string;
      caption?: string;
    }
  ): Promise<void> {
    const updateData: any = {};

    if (metadata.altText) {
      updateData.alt_text = metadata.altText;
    }
    if (metadata.title) {
      updateData.title = metadata.title;
    }
    if (metadata.description) {
      updateData.description = metadata.description;
    }
    if (metadata.caption) {
      updateData.caption = metadata.caption;
    }

    try {
      await this.makeRequest(
        apiUrl,
        username,
        appPassword,
        `/wp/v2/media/${mediaId}`,
        'POST',
        updateData
      );
    } catch (error) {
      console.error('Failed to update image metadata:', error);
      // Don't throw - metadata update failure shouldn't block publishing
    }
  }

  /**
   * Create a draft post in WordPress
   */
  async createDraftPost(
    apiUrl: string,
    username: string,
    appPassword: string,
    postData: {
      title: string;
      content: string;
      excerpt: string;
      featuredMediaId?: number;
      slug?: string;
      author?: string;
    }
  ) {
    const data = await this.makeRequest(apiUrl, username, appPassword, '/wp/v2/posts', 'POST', {
      title: postData.title,
      content: postData.content,
      excerpt: postData.excerpt,
      status: 'draft',
      featured_media: postData.featuredMediaId,
      slug: postData.slug, // URL-friendly slug
      // author ID would need to be looked up from username if provided
    });

    return { id: data.id, link: data.link };
  }

  /**
   * Update post SEO metadata (meta description, schemas, OG tags, Twitter cards)
   */
  async updatePostSeoMetadata(
    apiUrl: string,
    username: string,
    appPassword: string,
    postId: number,
    seoData: {
      metaDescription?: string;
      schemas?: string[]; // JSON-LD schemas
      openGraphTags?: Record<string, string>;
      twitterCardTags?: Record<string, string>;
      canonical?: string;
      imageAltText?: string;
    }
  ): Promise<void> {
    try {
      const metaFields: any = {};

      if (seoData.metaDescription) {
        metaFields._yoast_wpseo_metadesc = seoData.metaDescription;
      }

      // Store schemas and social tags as meta fields
      if (seoData.schemas && seoData.schemas.length > 0) {
        metaFields._apex_seo_schemas = JSON.stringify(seoData.schemas);
      }

      if (seoData.openGraphTags) {
        metaFields._apex_seo_og_tags = JSON.stringify(seoData.openGraphTags);
      }

      if (seoData.twitterCardTags) {
        metaFields._apex_seo_twitter_tags = JSON.stringify(seoData.twitterCardTags);
      }

      if (seoData.canonical) {
        metaFields._yoast_wpseo_canonical = seoData.canonical;
      }

      if (seoData.imageAltText) {
        metaFields._apex_seo_image_alt = seoData.imageAltText;
      }

      // Update post with meta fields
      await this.makeRequest(
        apiUrl,
        username,
        appPassword,
        `/wp/v2/posts/${postId}`,
        'POST',
        { meta: metaFields }
      );
    } catch (error) {
      console.error('Failed to update post SEO metadata:', error);
      // Don't throw - SEO metadata update failure shouldn't block publishing
    }
  }

  /**
   * Publish a WordPress post (or schedule it)
   */
  async publishPost(
    apiUrl: string,
    username: string,
    appPassword: string,
    postId: number,
    scheduledDate?: Date
  ) {
    const updateData: any = {
      status: 'publish'
    };

    if (scheduledDate) {
      updateData.date = scheduledDate.toISOString();
    }

    const data = await this.makeRequest(
      apiUrl,
      username,
      appPassword,
      `/wp/v2/posts/${postId}`,
      'POST',
      updateData
    );

    return { id: data.id, link: data.link };
  }

  /**
   * Get recent posts from WordPress
   */
  async getRecentPosts(
    apiUrl: string,
    username: string,
    appPassword: string,
    limit: number = 10
  ) {
    const posts = await this.makeRequest(
      apiUrl,
      username,
      appPassword,
      `/wp/v2/posts?per_page=${limit}&orderby=date&order=desc`
    );
    
    return posts.map((post: any) => ({
      id: post.id,
      title: post.title.rendered,
      link: post.link,
      date: post.date,
      status: post.status
    }));
  }

  /**
   * Update an existing WordPress post
   */
  async updatePost(
    apiUrl: string,
    username: string,
    appPassword: string,
    postId: number,
    updates: {
      title?: string;
      content?: string;
      excerpt?: string;
      status?: 'draft' | 'publish' | 'pending';
      featuredMediaId?: number;
    }
  ) {
    const data = await this.makeRequest(
      apiUrl,
      username,
      appPassword,
      `/wp/v2/posts/${postId}`,
      'POST',
      {
        ...updates,
        featured_media: updates.featuredMediaId
      }
    );

    return { id: data.id, link: data.link, status: data.status };
  }

  /**
   * Delete a WordPress post
   */
  async deletePost(
    apiUrl: string,
    username: string,
    appPassword: string,
    postId: number
  ) {
    await this.makeRequest(
      apiUrl,
      username,
      appPassword,
      `/wp/v2/posts/${postId}`,
      'DELETE'
    );
  }

  /**
   * Get WordPress site info
   */
  async getSiteInfo(apiUrl: string, username: string, appPassword: string) {
    try {
      const data = await this.makeRequest(apiUrl, username, appPassword, '/');
      return data;
    } catch (error) {
      console.error('WordPress site info fetch failed:', error);
      throw error;
    }
  }

  /**
   * Create a post with tracking script injected
   */
  async createPostWithTracking(
    apiUrl: string,
    username: string,
    appPassword: string,
    postData: {
      title: string;
      content: string;
      excerpt: string;
      featuredMediaId?: number;
    },
    trackingScript: string
  ): Promise<{ id: number; link: string }> {
    // Inject tracking script at the end of content
    const contentWithTracking = postData.content + trackingScript;
    
    const data = await this.makeRequest(apiUrl, username, appPassword, '/wp/v2/posts', 'POST', {
      title: postData.title,
      content: contentWithTracking,
      excerpt: postData.excerpt,
      status: 'draft',
      featured_media: postData.featuredMediaId
    });

    return { id: data.id, link: data.link };
  }
}

export const wordpressService = new WordPressService();
