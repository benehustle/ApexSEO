import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  ShoplineApiConfig,
  ShoplineBlogCollection,
  ShoplineBlogCollectionResponse,
  ShoplineBlogArticle,
  ShoplineBlogArticleResponse,
  ShoplineError,
} from './types';

/**
 * Shopline REST API Client
 * Handles authenticated requests to Shopline Admin REST API
 */
export class ShoplineClient {
  private config: ShoplineApiConfig;
  private axiosInstance: AxiosInstance;

  constructor(config: ShoplineApiConfig) {
    this.config = config;
    const baseUrl = this.config.baseUrl || `https://${this.config.handle}.myshopline.com/admin/openapi`;
    
    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${this.config.accessToken}`,
      },
    });

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response) {
          const status = error.response.status;
          const data = error.response.data as ShoplineError | any;
          
          let message = `Shopline API error: ${status}`;
          
          if (data?.errors) {
            message += ` - ${data.errors}`;
          } else if (data?.message) {
            message += ` - ${data.message}`;
          } else if (data?.i18nCode) {
            message += ` - ${data.i18nCode}`;
          }
          
          if (status === 401) {
            message = 'Authentication failed. Please check your access token.';
          } else if (status === 403) {
            message = 'Insufficient permissions. Please check your app scopes.';
          } else if (status === 404) {
            message = 'Resource not found.';
          } else if (status === 429) {
            message = 'Rate limit exceeded. Please try again later.';
          } else if (status >= 500) {
            message = 'Shopline server error. Please try again later.';
          }
          
          error.message = message;
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Create a new blog collection
   * @param blogCollection Blog collection data
   * @returns Created blog collection
   */
  async createBlogCollection(
    blogCollection: ShoplineBlogCollection
  ): Promise<ShoplineBlogCollectionResponse> {
    try {
      const response = await this.axiosInstance.post<{ blog: ShoplineBlogCollectionResponse }>(
        '/store/blogs.json',
        { blog: blogCollection }
      );
      
      return response.data.blog;
    } catch (error) {
      throw this.handleApiError(error, 'createBlogCollection');
    }
  }

  /**
   * Get a blog collection by ID
   * @param blogCollectionId Blog collection ID
   * @returns Blog collection details
   */
  async getBlogCollection(blogCollectionId: string): Promise<ShoplineBlogCollectionResponse> {
    try {
      const response = await this.axiosInstance.get<{ blog: ShoplineBlogCollectionResponse }>(
        `/store/blogs/${blogCollectionId}.json`
      );
      
      return response.data.blog;
    } catch (error) {
      throw this.handleApiError(error, 'getBlogCollection');
    }
  }

  /**
   * List all blog collections
   * @param limit Maximum number of collections to return
   * @param page Page number for pagination
   * @returns Array of blog collections
   */
  async listBlogCollections(limit: number = 50, page: number = 1): Promise<ShoplineBlogCollectionResponse[]> {
    try {
      const response = await this.axiosInstance.get<{ blogs: ShoplineBlogCollectionResponse[] }>(
        '/store/blogs.json',
        {
          params: { limit, page },
        }
      );
      
      return response.data.blogs || [];
    } catch (error) {
      throw this.handleApiError(error, 'listBlogCollections');
    }
  }

  /**
   * Create a blog article in a specific collection
   * @param blogCollectionId The ID of the blog collection
   * @param article Blog article data
   * @returns Created blog article
   */
  async createBlogArticle(
    blogCollectionId: string,
    article: ShoplineBlogArticle
  ): Promise<ShoplineBlogArticleResponse> {
    try {
      const response = await this.axiosInstance.post<{ blog: ShoplineBlogArticleResponse }>(
        `/store/blogs/${blogCollectionId}/articles.json`,
        { blog: article }
      );
      
      return response.data.blog;
    } catch (error) {
      throw this.handleApiError(error, 'createBlogArticle');
    }
  }

  /**
   * Get a blog article by ID
   * @param blogCollectionId Blog collection ID
   * @param articleId Blog article ID
   * @returns Blog article details
   */
  async getBlogArticle(
    blogCollectionId: string,
    articleId: string
  ): Promise<ShoplineBlogArticleResponse> {
    try {
      const response = await this.axiosInstance.get<{ blog: ShoplineBlogArticleResponse }>(
        `/store/blogs/${blogCollectionId}/articles/${articleId}.json`
      );
      
      return response.data.blog;
    } catch (error) {
      throw this.handleApiError(error, 'getBlogArticle');
    }
  }

  /**
   * List blog articles in a collection
   * @param blogCollectionId Blog collection ID
   * @param limit Maximum number of articles to return
   * @param page Page number for pagination
   * @returns Array of blog articles
   */
  async listBlogArticles(
    blogCollectionId: string,
    limit: number = 50,
    page: number = 1
  ): Promise<ShoplineBlogArticleResponse[]> {
    try {
      const response = await this.axiosInstance.get<{ blogs: ShoplineBlogArticleResponse[] }>(
        `/store/blogs/${blogCollectionId}/articles.json`,
        {
          params: { limit, page },
        }
      );
      
      return response.data.blogs || [];
    } catch (error) {
      throw this.handleApiError(error, 'listBlogArticles');
    }
  }

  /**
   * Update a blog article
   * @param blogCollectionId Blog collection ID
   * @param articleId Blog article ID
   * @param article Updated blog article data
   * @returns Updated blog article
   */
  async updateBlogArticle(
    blogCollectionId: string,
    articleId: string,
    article: Partial<ShoplineBlogArticle>
  ): Promise<ShoplineBlogArticleResponse> {
    try {
      const response = await this.axiosInstance.put<{ blog: ShoplineBlogArticleResponse }>(
        `/store/blogs/${blogCollectionId}/articles/${articleId}.json`,
        { blog: article }
      );
      
      return response.data.blog;
    } catch (error) {
      throw this.handleApiError(error, 'updateBlogArticle');
    }
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
    try {
      await this.axiosInstance.delete(
        `/store/blogs/${blogCollectionId}/articles/${articleId}.json`
      );
      
      return true;
    } catch (error) {
      throw this.handleApiError(error, 'deleteBlogArticle');
    }
  }

  /**
   * Search for a blog collection by handle
   * @param handle Blog collection handle
   * @returns Blog collection or null if not found
   */
  async findBlogCollectionByHandle(handle: string): Promise<ShoplineBlogCollectionResponse | null> {
    try {
      const collections = await this.listBlogCollections(100);
      return collections.find(collection => collection.handle === handle) || null;
    } catch (error) {
      throw this.handleApiError(error, 'findBlogCollectionByHandle');
    }
  }

  /**
   * Create or get existing blog collection by handle
   * @param blogCollection Blog collection data
   * @returns Existing or newly created blog collection
   */
  async ensureBlogCollection(
    blogCollection: ShoplineBlogCollection
  ): Promise<ShoplineBlogCollectionResponse> {
    try {
      // Try to find existing collection
      const existing = await this.findBlogCollectionByHandle(blogCollection.handle);
      if (existing) {
        return existing;
      }
      
      // Create new collection
      return await this.createBlogCollection(blogCollection);
    } catch (error) {
      throw this.handleApiError(error, 'ensureBlogCollection');
    }
  }

  /**
   * Handle API errors consistently
   */
  private handleApiError(error: any, operation: string): Error {
    if (axios.isAxiosError(error)) {
      return new Error(`Shopline API ${operation} failed: ${error.message}`);
    }
    
    return error instanceof Error 
      ? error 
      : new Error(`Unknown error in ${operation}: ${String(error)}`);
  }
}