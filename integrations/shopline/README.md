# Shopline Blog Integration

A production-ready TypeScript library for integrating with Shopline's blog posting API. This library provides complete OAuth 2.0 authentication flow, API client for blog operations, and a high-level service for publishing blog posts to Shopline stores.

## Features

- **OAuth 2.0 Authentication**: Complete authentication flow for Shopline apps
- **TypeScript Support**: Fully typed API with comprehensive type definitions
- **Blog Operations**: Create, read, update, delete blog collections and articles
- **Error Handling**: Robust error handling with detailed error messages
- **Production Ready**: Includes tests, documentation, and best practices
- **Extensible**: Modular design for easy extension to other Shopline APIs

## Installation

```bash
npm install shopline-integration
```

## Quick Start

### 1. Set up OAuth 2.0 Authentication

First, create a Shopline app in the [Shopline Developer Center](https://developer.shopline.com) to get your `appKey` and `appSecret`.

```typescript
import { createShoplineIntegration } from 'shopline-integration';

const { auth, client, blogService } = createShoplineIntegration({
  handle: 'your-store-handle', // e.g., 'mystore' from mystore.myshopline.com
  accessToken: 'existing-access-token', // Optional if you already have a token
  appKey: 'your-app-key',
  appSecret: 'your-app-secret',
  redirectUri: 'https://your-app.com/auth/callback',
});
```

### 2. OAuth 2.0 Flow

#### Handle Installation Request

When a merchant installs your app, Shopline sends a GET request to your app URL with query parameters:

```typescript
import { ShoplineAuth } from 'shopline-integration';

const auth = new ShoplineAuth({
  appKey: 'your-app-key',
  appSecret: 'your-app-secret',
  handle: 'store-handle-from-query',
  redirectUri: 'https://your-app.com/auth/callback',
});

// Verify the installation request signature
const isValid = auth.verifyInstallationRequest(queryParams);
if (!isValid) {
  throw new Error('Invalid signature');
}

// Generate authorization URL and redirect merchant
const authUrl = auth.generateAuthorizationUrl('read_blogs,write_blogs');
// Redirect merchant to authUrl
```

#### Handle Authorization Callback

After merchant authorization, Shopline redirects to your `redirectUri` with an authorization code:

```typescript
// Extract code from query parameters
const code = auth.handleAuthorizationCallback(queryParams);

// Exchange code for access token
const tokenData = await auth.exchangeCodeForToken(code);

// Store tokenData.accessToken for future API calls
const accessToken = tokenData.accessToken;
```

### 3. Publishing Blog Posts

Once you have an access token, you can publish blog posts:

```typescript
import { createShoplineIntegration } from 'shopline-integration';

const { blogService } = createShoplineIntegration({
  handle: 'store-handle',
  accessToken: 'your-access-token',
});

const blogPost = {
  title: 'My Awesome Blog Post',
  content: '<h1>Welcome to my blog</h1><p>This is the content...</p>',
  excerpt: 'A brief excerpt of the blog post',
  author: 'John Doe',
  featuredImageUrl: 'https://example.com/image.jpg',
  slug: 'my-awesome-blog-post',
  published: true,
  tags: ['technology', 'ecommerce'],
};

try {
  const publishedArticle = await blogService.publishBlogPost(blogPost);
  console.log('Blog published successfully:', publishedArticle);
} catch (error) {
  console.error('Failed to publish blog:', error);
}
```

## API Reference

### ShoplineAuth

Handles OAuth 2.0 authentication flow.

```typescript
const auth = new ShoplineAuth(config);

// Methods
auth.verifyInstallationRequest(queryParams); // boolean
auth.generateAuthorizationUrl(scope, customField?); // string
auth.handleAuthorizationCallback(queryParams); // string (authorization code)
auth.exchangeCodeForToken(authorizationCode); // Promise<ShoplineAccessToken>
auth.refreshAccessToken(currentToken?); // Promise<ShoplineAccessToken>

// Static methods
ShoplineAuth.isTokenExpired(expireTime); // boolean
ShoplineAuth.getTokenTimeRemaining(expireTime); // number
```

### ShoplineClient

Low-level API client for Shopline REST API.

```typescript
const client = new ShoplineClient(config);

// Blog collection operations
client.createBlogCollection(blogCollection); // Promise<ShoplineBlogCollectionResponse>
client.getBlogCollection(blogCollectionId); // Promise<ShoplineBlogCollectionResponse>
client.listBlogCollections(limit, page); // Promise<ShoplineBlogCollectionResponse[]>
client.findBlogCollectionByHandle(handle); // Promise<ShoplineBlogCollectionResponse | null>
client.ensureBlogCollection(blogCollection); // Promise<ShoplineBlogCollectionResponse>

// Blog article operations
client.createBlogArticle(blogCollectionId, article); // Promise<ShoplineBlogArticleResponse>
client.getBlogArticle(blogCollectionId, articleId); // Promise<ShoplineBlogArticleResponse>
client.listBlogArticles(blogCollectionId, limit, page); // Promise<ShoplineBlogArticleResponse[]>
client.updateBlogArticle(blogCollectionId, articleId, article); // Promise<ShoplineBlogArticleResponse>
client.deleteBlogArticle(blogCollectionId, articleId); // Promise<boolean>
```

### ShoplineBlogService

High-level service for blog operations.

```typescript
const blogService = new ShoplineBlogService(client);

// Main methods
blogService.publishBlogPost(blogPostData); // Promise<ShoplineBlogArticleResponse>
blogService.getBlogArticle(blogCollectionId, articleId); // Promise<ShoplineBlogArticleResponse>
blogService.listBlogArticles(blogCollectionId, limit, page); // Promise<ShoplineBlogArticleResponse[]>
blogService.updateBlogArticle(blogCollectionId, articleId, blogPostData); // Promise<ShoplineBlogArticleResponse>
blogService.deleteBlogArticle(blogCollectionId, articleId); // Promise<boolean>
blogService.listBlogCollections(limit, page); // Promise<ShoplineBlogCollectionResponse[]>
```

## Types

### BlogPostData

```typescript
interface BlogPostData {
  title: string;
  content: string; // HTML content
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
```

### ShoplineBlogArticle

```typescript
interface ShoplineBlogArticle {
  handle: string;
  title: string;
  content_html: string;
  published?: boolean;
  published_at?: string;
  digest?: string;
  author?: string;
  template_name?: string;
  image?: {
    alt?: string;
    src: string;
  };
}
```

## Error Handling

All methods throw descriptive errors:

```typescript
try {
  await blogService.publishBlogPost(postData);
} catch (error) {
  if (error.message.includes('Authentication failed')) {
    // Handle authentication error
  } else if (error.message.includes('Rate limit')) {
    // Handle rate limiting
  } else {
    // Handle other errors
  }
}
```

## Testing

Run the test suite:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## Building

Build the library:

```bash
npm run build
```

## License

MIT

## Support

For issues, feature requests, or questions, please open an issue on GitHub.

## Contributing

Contributions are welcome! Please see CONTRIBUTING.md for guidelines.

## Shopline API Documentation

- [Shopline Developer Portal](https://developer.shopline.com)
- [API Reference](https://developer.shopline.com/docs/api)
- [OAuth 2.0 Documentation](https://developer.shopline.com/docs/apps/api-instructions-for-use/app-authorization)