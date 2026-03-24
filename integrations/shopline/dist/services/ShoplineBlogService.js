"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShoplineBlogService = void 0;
class ShoplineBlogService {
    client;
    constructor(client) {
        this.client = client;
    }
    async publishBlogPost(postData) {
        try {
            const blogCollection = await this.getOrCreateBlogCollection(postData);
            const blogArticle = this.prepareBlogArticleData(postData, blogCollection.id);
            const createdArticle = await this.client.createBlogArticle(blogCollection.id, blogArticle);
            if (postData.tags && postData.tags.length > 0) {
                console.warn('Tags are not currently supported in Shopline blog articles');
            }
            return createdArticle;
        }
        catch (error) {
            throw new Error(`Failed to publish blog post: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getOrCreateBlogCollection(postData) {
        const blogCollectionHandle = postData.blogCollectionHandle || 'blog';
        const blogCollectionId = postData.blogCollectionId;
        if (blogCollectionId) {
            try {
                return await this.client.getBlogCollection(blogCollectionId);
            }
            catch (error) {
                throw new Error(`Blog collection with ID ${blogCollectionId} not found: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        const existingCollection = await this.client.findBlogCollectionByHandle(blogCollectionHandle);
        if (existingCollection) {
            return existingCollection;
        }
        const newCollection = {
            title: postData.blogCollectionHandle
                ? this.formatTitleFromHandle(postData.blogCollectionHandle)
                : 'Blog',
            handle: blogCollectionHandle,
            commentable: 'yes',
        };
        return await this.client.createBlogCollection(newCollection);
    }
    prepareBlogArticleData(postData, _blogCollectionId) {
        const handle = postData.slug || this.generateHandleFromTitle(postData.title);
        const published = postData.published ?? true;
        const publishedAt = postData.publishDate
            ? postData.publishDate.toISOString()
            : new Date().toISOString();
        const article = {
            handle,
            title: postData.title,
            content_html: postData.content,
            published,
            published_at: publishedAt,
            digest: postData.excerpt,
            author: postData.author,
            template_name: undefined,
        };
        if (postData.featuredImageUrl) {
            article.image = {
                src: postData.featuredImageUrl,
                alt: postData.title,
            };
        }
        return article;
    }
    generateHandleFromTitle(title) {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 255);
    }
    formatTitleFromHandle(handle) {
        return handle
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    async getBlogArticle(blogCollectionId, articleId) {
        return await this.client.getBlogArticle(blogCollectionId, articleId);
    }
    async listBlogArticles(blogCollectionId, limit = 50, page = 1) {
        return await this.client.listBlogArticles(blogCollectionId, limit, page);
    }
    async updateBlogArticle(blogCollectionId, articleId, postData) {
        const existingArticle = await this.client.getBlogArticle(blogCollectionId, articleId);
        const updateData = {};
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
    async deleteBlogArticle(blogCollectionId, articleId) {
        return await this.client.deleteBlogArticle(blogCollectionId, articleId);
    }
    async listBlogCollections(limit = 50, page = 1) {
        return await this.client.listBlogCollections(limit, page);
    }
}
exports.ShoplineBlogService = ShoplineBlogService;
//# sourceMappingURL=ShoplineBlogService.js.map