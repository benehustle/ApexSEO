export interface ShoplineImage {
    alt?: string;
    src: string;
}
export interface ShoplineBlogCollection {
    title: string;
    commentable?: 'no' | 'moderate' | 'yes';
    handle: string;
}
export interface ShoplineBlogCollectionResponse extends ShoplineBlogCollection {
    template_suffix?: string;
    updated_at: string;
    created_at: string;
    id: string;
}
export interface ShoplineBlogArticle {
    handle: string;
    title: string;
    content_html: string;
    published?: boolean;
    published_at?: string;
    digest?: string;
    author?: string;
    template_name?: string;
    image?: ShoplineImage;
    url?: string;
}
export interface ShoplineBlogArticleResponse extends ShoplineBlogArticle {
    id: string;
    blog_collection_id: string;
    created_at: string;
    updated_at: string;
}
export interface ShoplineError {
    errors: string;
}
export interface ShoplineAuthConfig {
    appKey: string;
    appSecret: string;
    handle: string;
    redirectUri: string;
}
export interface ShoplineAccessToken {
    accessToken: string;
    expireTime: string;
    scope: string;
}
export interface ShoplineApiConfig {
    baseUrl?: string;
    accessToken: string;
    handle: string;
}
export interface BlogPostData {
    title: string;
    content: string;
    excerpt?: string;
    slug?: string;
    featuredImageUrl?: string;
    author?: string;
    published?: boolean;
    publishDate?: Date;
    tags?: string[];
    blogCollectionId?: string;
    blogCollectionHandle?: string;
}
//# sourceMappingURL=types.d.ts.map