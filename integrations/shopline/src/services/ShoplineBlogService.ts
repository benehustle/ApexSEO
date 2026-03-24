import { ShoplineClient } from '../api/ShoplineClient';
import {
  BlogPostData,
  ShoplineBlogCollection,
  ShoplineBlogArticle,
  ShoplineBlogArticleResponse,
  ShoplineBlogCollectionResponse,
} from '../api/types';

/**
 * Shopline Blog Integration Service
 * Handles publishing blog posts to Shopline stores
 */
export class ShoplineBlogService {
  private client: ShoplineClient;

  constructor(client: ShoplineClient) {
    this.client = client;
  }

  /**
   * Publish a blog post to Shopline
   * @param postData Blog post data
   * @returns Created blog article
   */
  async publishBlogPost(postData: BlogPostData): Promise<ShoplineBlogArticleResponse> {
    try {
      // Step 1: Determine blog collection
      const blogCollection = await this.getOrCreateBlogCollection(postData);
      
      // Step 2: Prepare blog article data
      const blogArticle = this.prepareBlogArticleData(postData, blogCollection.id);
      
      // Step 3: Create blog article
      const createdArticle = await this.client.createBlogArticle(blogCollection.id, blogArticle);
      
      // Step 4: Update article with additional data if needed
      if (postData.tags && postData.tags.length > 0) {
        // Note: Shopline API may not support tags directly in blog article creation
        // This could be extended with custom fields or separate API calls
        console.warn('Tags are not currently supported in Shopline blog articles');
      }
      
      return createdArticle;
    } catch (error) {
      throw new Error(`Failed to publish blog post: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get or create a blog collection based on post data
   */
  private async getOrCreateBlogCollection(
    postData: BlogPostData
  ): Promise<ShoplineBlogCollectionResponse> {
    const blogCollectionHandle = postData.blogCollectionHandle || 'blog';
    const blogCollectionId = postData.blogCollectionId;
    
    // If blogCollectionId is provided, try to get the collection
    if (blogCollectionId) {
      try {
        return await this.client.getBlogCollection(blogCollectionId);
      } catch (error) {
        throw new Error(`Blog collection with ID ${blogCollectionId} not found: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Otherwise, try to find by handle
    const existingCollection = await this.client.findBlogCollectionByHandle(blogCollectionHandle);
    if (existingCollection) {
      return existingCollection;
    }
    
    // Create new blog collection
    const newCollection: ShoplineBlogCollection = {
      title: postData.blogCollectionHandle 
        ? this.formatTitleFromHandle(postData.blogCollectionHandle)
        : 'Blog',
      handle: blogCollectionHandle,
      commentable: 'yes',
    };
    
    return await this.client.createBlogCollection(newCollection);
  }

  /**
   * Prepare blog article data for Shopline API
   */
  private prepareBlogArticleData(
    postData: BlogPostData,
    _blogCollectionId: string
  ): ShoplineBlogArticle {
    const handle = postData.slug || this.generateHandleFromTitle(postData.title);
    const published = postData.published ?? true;
    const publishedAt = postData.publishDate 
      ? postData.publishDate.toISOString() 
      : new Date().toISOString();
    
    const article: ShoplineBlogArticle = {
      handle,
      title: postData.title,
      content_html: postData.content,
      published,
      published_at: publishedAt,
      digest: postData.excerpt,
      author: postData.author,
      template_name: undefined, // Optional
    };
    
    // Add image if provided
    if (postData.featuredImageUrl) {
      article.image = {
        src: postData.featuredImageUrl,
        alt: postData.title,
      };
    }
    
    return article;
  }

  /**
   * Generate a handle from title (URL-friendly)
   */
  private generateHandleFromTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 255);
  }

  /**
   * Format title from handle (capitalize words)
   */
  private formatTitleFromHandle(handle: string): string {
    return handle
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get a blog article by ID
   * @param blogCollectionId Blog collection ID
   * @param articleId Blog article ID
   * @returns Blog article
   */
  async getBlogArticle(
    blogCollectionId: string,
    articleId: string
  ): Promise<ShoplineBlogArticleResponse> {
    return await this.client.getBlogArticle(blogCollectionId, articleId);
  }

  /**
   * List blog articles in a collection
   * @param blogCollectionId Blog collection ID
   * @param limit Maximum number of articles
   * @param page Page number
   * @returns Array of blog articles
   */
  async listBlogArticles(
    blogCollectionId: string,
    limit: number = 50,
    page: number = 1
  ): Promise<ShoplineBlogArticleResponse[]> {
    return await this.client.listBlogArticles(blogCollectionId, limit, page);
  }

  /**
   * Update a blog article
   * @param blogCollectionId Blog collection ID
   * @param articleId Blog article ID
   * @param postData Updated blog post data
   * @returns Updated blog article
   */
  async updateBlogArticle(
    blogCollectionId: string,
    articleId: string,
    postData: Partial<BlogPostData>
  ): Promise<ShoplineBlogArticleResponse> {
    const existingArticle = await this.client.getBlogArticle(blogCollectionId, articleId);
    
    const updateData: Partial<ShoplineBlogArticle> = {};
    
    if (postData.title !== undefined) {
      updateData.title = postData.title;
    }
    
    if (postData.content !== undefined) {
      updateData.content_html = postData.content;
    }
    
    if (postData.excerpt !== undefined) {
      updateData.digest = postData.excerpt;
    }
    
    if (postData.author !== undefined) {
      updateData.author = postData.author;
    }
    
    if (postData.published !== undefined) {
      updateData.published = postData.published;
    }
    
    if (postData.publishDate !== undefined) {
      updateData.published_at = postData.publishDate.toISOString();
    }
    
    if (postData.featuredImageUrl !== undefined) {
      updateData.image = postData.featuredImageUrl 
        ? { src: postData.featuredImageUrl, alt: postData.title || existingArticle.title }
        : undefined;
    }
    
    return await this.client.updateBlogArticle(blogCollectionId, articleId, updateData);
  }

  /**
   * Delete a blog article
   * @param blogCollectionId Blog collection ID
   * @param articleId Blog article ID
   * @returns Success status
   */
  async deleteBlogArticle(
    blogCollectionId: string,
    articleId: string
  ): Promise<boolean> {
    return await this.client.deleteBlogArticle(blogCollectionId, articleId);
  }

  /**
   * List all blog collections
   * @param limit Maximum number of collections
   * @param page Page number
   * @returns Array of blog collections
   */
  async listBlogCollections(
    limit: number = 50,
    page: number = 1
  ): Promise<ShoplineBlogCollectionResponse[]> {
    return await this.client.listBlogCollections(limit, page);
  }
}