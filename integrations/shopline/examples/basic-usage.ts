/**
 * Basic usage example for Shopline Blog Integration
 * 
 * This example demonstrates:
 * 1. OAuth 2.0 authentication flow
 * 2. Publishing a blog post
 * 3. Managing blog articles
 */

import { createShoplineIntegration } from '../src/index';

// Configuration - replace with your actual credentials
const config = {
  handle: 'your-store-handle', // e.g., 'mystore' from mystore.myshopline.com
  accessToken: 'your-access-token', // Obtain via OAuth flow
  appKey: 'your-app-key', // Only needed for authentication
  appSecret: 'your-app-secret', // Only needed for authentication
  redirectUri: 'https://your-app.com/auth/callback',
};

async function main() {
  console.log('=== Shopline Blog Integration Example ===\n');

  // Create integration instance
  const { auth, client, blogService } = createShoplineIntegration(config);

  // Example 1: Verify installation request (webhook handler)
  console.log('1. OAuth 2.0 Flow:');
  console.log('   To handle app installation, verify the request signature:');
  console.log('   const isValid = auth.verifyInstallationRequest(queryParams);');
  console.log('   Then redirect merchant to authorization URL:');
  console.log('   const authUrl = auth.generateAuthorizationUrl("read_blogs,write_blogs");\n');

  // Example 2: Publish a blog post
  console.log('2. Publishing a Blog Post:');
  
  const blogPost = {
    title: 'Getting Started with E-commerce',
    content: `
      <h1>Welcome to Our Blog</h1>
      <p>E-commerce has revolutionized the way we shop...</p>
      <h2>Key Benefits</h2>
      <ul>
        <li>24/7 availability</li>
        <li>Global reach</li>
        <li>Lower operational costs</li>
      </ul>
    `,
    excerpt: 'Discover how e-commerce can transform your business',
    author: 'Jane Smith',
    slug: 'getting-started-with-ecommerce',
    published: true,
    tags: ['ecommerce', 'business', 'technology'],
  };

  try {
    console.log('   Publishing blog post...');
    // Uncomment to actually publish
    // const publishedArticle = await blogService.publishBlogPost(blogPost);
    // console.log(`   ✅ Blog published successfully!`);
    // console.log(`   Article ID: ${publishedArticle.id}`);
    // console.log(`   URL: ${publishedArticle.url}`);
    console.log('   (Publishing disabled in example - uncomment to enable)\n');
  } catch (error) {
    console.error(`   ❌ Error publishing blog: ${error.message}\n`);
  }

  // Example 3: List blog collections
  console.log('3. Listing Blog Collections:');
  try {
    // Uncomment to actually list
    // const collections = await blogService.listBlogCollections();
    // console.log(`   Found ${collections.length} blog collections:`);
    // collections.forEach(collection => {
    //   console.log(`   - ${collection.title} (${collection.handle})`);
    // });
    console.log('   (Listing disabled in example - uncomment to enable)\n');
  } catch (error) {
    console.error(`   ❌ Error listing collections: ${error.message}\n`);
  }

  // Example 4: Token expiration check
  console.log('4. Token Management:');
  const expireTime = '2025-12-31T23:59:59Z';
  const isExpired = auth?.isTokenExpired(expireTime);
  console.log(`   Token expired? ${isExpired}`);
  console.log(`   Use auth.refreshAccessToken() before token expires.\n`);

  console.log('=== Example Complete ===');
}

// Run the example
main().catch(console.error);

/**
 * Example output when run:
 * 
 * === Shopline Blog Integration Example ===
 * 
 * 1. OAuth 2.0 Flow:
 *    To handle app installation, verify the request signature:
 *    const isValid = auth.verifyInstallationRequest(queryParams);
 *    Then redirect merchant to authorization URL:
 *    const authUrl = auth.generateAuthorizationUrl("read_blogs,write_blogs");
 * 
 * 2. Publishing a Blog Post:
 *    Publishing blog post...
 *    (Publishing disabled in example - uncomment to enable)
 * 
 * 3. Listing Blog Collections:
 *    (Listing disabled in example - uncomment to enable)
 * 
 * 4. Token Management:
 *    Token expired? false
 *    Use auth.refreshAccessToken() before token expires.
 * 
 * === Example Complete ===
 */