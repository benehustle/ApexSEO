"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShoplineClient = void 0;
const axios_1 = __importDefault(require("axios"));
class ShoplineClient {
    config;
    axiosInstance;
    constructor(config) {
        this.config = config;
        const baseUrl = this.config.baseUrl || `https://${this.config.handle}.myshopline.com/admin/openapi`;
        this.axiosInstance = axios_1.default.create({
            baseURL: baseUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Authorization': `Bearer ${this.config.accessToken}`,
            },
        });
        this.axiosInstance.interceptors.response.use((response) => response, (error) => {
            if (error.response) {
                const status = error.response.status;
                const data = error.response.data;
                let message = `Shopline API error: ${status}`;
                if (data?.errors) {
                    message += ` - ${data.errors}`;
                }
                else if (data?.message) {
                    message += ` - ${data.message}`;
                }
                else if (data?.i18nCode) {
                    message += ` - ${data.i18nCode}`;
                }
                if (status === 401) {
                    message = 'Authentication failed. Please check your access token.';
                }
                else if (status === 403) {
                    message = 'Insufficient permissions. Please check your app scopes.';
                }
                else if (status === 404) {
                    message = 'Resource not found.';
                }
                else if (status === 429) {
                    message = 'Rate limit exceeded. Please try again later.';
                }
                else if (status >= 500) {
                    message = 'Shopline server error. Please try again later.';
                }
                error.message = message;
            }
            return Promise.reject(error);
        });
    }
    async createBlogCollection(blogCollection) {
        try {
            const response = await this.axiosInstance.post('/store/blogs.json', { blog: blogCollection });
            return response.data.blog;
        }
        catch (error) {
            throw this.handleApiError(error, 'createBlogCollection');
        }
    }
    async getBlogCollection(blogCollectionId) {
        try {
            const response = await this.axiosInstance.get(`/store/blogs/${blogCollectionId}.json`);
            return response.data.blog;
        }
        catch (error) {
            throw this.handleApiError(error, 'getBlogCollection');
        }
    }
    async listBlogCollections(limit = 50, page = 1) {
        try {
            const response = await this.axiosInstance.get('/store/blogs.json', {
                params: { limit, page },
            });
            return response.data.blogs || [];
        }
        catch (error) {
            throw this.handleApiError(error, 'listBlogCollections');
        }
    }
    async createBlogArticle(blogCollectionId, article) {
        try {
            const response = await this.axiosInstance.post(`/store/blogs/${blogCollectionId}/articles.json`, { blog: article });
            return response.data.blog;
        }
        catch (error) {
            throw this.handleApiError(error, 'createBlogArticle');
        }
    }
    async getBlogArticle(blogCollectionId, articleId) {
        try {
            const response = await this.axiosInstance.get(`/store/blogs/${blogCollectionId}/articles/${articleId}.json`);
            return response.data.blog;
        }
        catch (error) {
            throw this.handleApiError(error, 'getBlogArticle');
        }
    }
    async listBlogArticles(blogCollectionId, limit = 50, page = 1) {
        try {
            const response = await this.axiosInstance.get(`/store/blogs/${blogCollectionId}/articles.json`, {
                params: { limit, page },
            });
            return response.data.blogs || [];
        }
        catch (error) {
            throw this.handleApiError(error, 'listBlogArticles');
        }
    }
    async updateBlogArticle(blogCollectionId, articleId, article) {
        try {
            const response = await this.axiosInstance.put(`/store/blogs/${blogCollectionId}/articles/${articleId}.json`, { blog: article });
            return response.data.blog;
        }
        catch (error) {
            throw this.handleApiError(error, 'updateBlogArticle');
        }
    }
    async deleteBlogArticle(blogCollectionId, articleId) {
        try {
            await this.axiosInstance.delete(`/store/blogs/${blogCollectionId}/articles/${articleId}.json`);
            return true;
        }
        catch (error) {
            throw this.handleApiError(error, 'deleteBlogArticle');
        }
    }
    async findBlogCollectionByHandle(handle) {
        try {
            const collections = await this.listBlogCollections(100);
            return collections.find(collection => collection.handle === handle) || null;
        }
        catch (error) {
            throw this.handleApiError(error, 'findBlogCollectionByHandle');
        }
    }
    async ensureBlogCollection(blogCollection) {
        try {
            const existing = await this.findBlogCollectionByHandle(blogCollection.handle);
            if (existing) {
                return existing;
            }
            return await this.createBlogCollection(blogCollection);
        }
        catch (error) {
            throw this.handleApiError(error, 'ensureBlogCollection');
        }
    }
    handleApiError(error, operation) {
        if (axios_1.default.isAxiosError(error)) {
            return new Error(`Shopline API ${operation} failed: ${error.message}`);
        }
        return error instanceof Error
            ? error
            : new Error(`Unknown error in ${operation}: ${String(error)}`);
    }
}
exports.ShoplineClient = ShoplineClient;
//# sourceMappingURL=ShoplineClient.js.map