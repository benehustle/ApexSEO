import { ShoplineApiConfig, ShoplineBlogCollection, ShoplineBlogCollectionResponse, ShoplineBlogArticle, ShoplineBlogArticleResponse } from './types';
export declare class ShoplineClient {
    private config;
    private axiosInstance;
    constructor(config: ShoplineApiConfig);
    createBlogCollection(blogCollection: ShoplineBlogCollection): Promise<ShoplineBlogCollectionResponse>;
    getBlogCollection(blogCollectionId: string): Promise<ShoplineBlogCollectionResponse>;
    listBlogCollections(limit?: number, page?: number): Promise<ShoplineBlogCollectionResponse[]>;
    createBlogArticle(blogCollectionId: string, article: ShoplineBlogArticle): Promise<ShoplineBlogArticleResponse>;
    getBlogArticle(blogCollectionId: string, articleId: string): Promise<ShoplineBlogArticleResponse>;
    listBlogArticles(blogCollectionId: string, limit?: number, page?: number): Promise<ShoplineBlogArticleResponse[]>;
    updateBlogArticle(blogCollectionId: string, articleId: string, article: Partial<ShoplineBlogArticle>): Promise<ShoplineBlogArticleResponse>;
    deleteBlogArticle(blogCollectionId: string, articleId: string): Promise<boolean>;
    findBlogCollectionByHandle(handle: string): Promise<ShoplineBlogCollectionResponse | null>;
    ensureBlogCollection(blogCollection: ShoplineBlogCollection): Promise<ShoplineBlogCollectionResponse>;
    private handleApiError;
}
//# sourceMappingURL=ShoplineClient.d.ts.map