import { ShoplineClient } from '../api/ShoplineClient';
import { BlogPostData, ShoplineBlogArticleResponse, ShoplineBlogCollectionResponse } from '../api/types';
export declare class ShoplineBlogService {
    private client;
    constructor(client: ShoplineClient);
    publishBlogPost(postData: BlogPostData): Promise<ShoplineBlogArticleResponse>;
    private getOrCreateBlogCollection;
    private prepareBlogArticleData;
    private generateHandleFromTitle;
    private formatTitleFromHandle;
    getBlogArticle(blogCollectionId: string, articleId: string): Promise<ShoplineBlogArticleResponse>;
    listBlogArticles(blogCollectionId: string, limit?: number, page?: number): Promise<ShoplineBlogArticleResponse[]>;
    updateBlogArticle(blogCollectionId: string, articleId: string, postData: Partial<BlogPostData>): Promise<ShoplineBlogArticleResponse>;
    deleteBlogArticle(blogCollectionId: string, articleId: string): Promise<boolean>;
    listBlogCollections(limit?: number, page?: number): Promise<ShoplineBlogCollectionResponse[]>;
}
//# sourceMappingURL=ShoplineBlogService.d.ts.map