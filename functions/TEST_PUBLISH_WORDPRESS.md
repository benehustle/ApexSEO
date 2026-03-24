# Testing publishToWordPress Function

## Overview
The `publishToWordPress` function publishes blog content to WordPress using the WordPress REST API with Basic Authentication.

## Function Details

### Internal Function
- **Name**: `publishToWordPress`
- **Location**: `functions/src/index.ts`
- **Type**: Exported async function (can be used by other Cloud Functions)

### HTTP Callable Function
- **Name**: `publishBlogCallable`
- **Type**: Firebase HTTP Callable Function
- **Region**: `australia-southeast1`
- **Timeout**: 60 seconds
- **Memory**: 512MB

## Prerequisites

1. **Site Configuration**: The site must have the following fields in Firestore `sites/{siteId}`:
   - `wordpressUrl` or `wordpressApiUrl` (base WordPress URL, e.g., `https://example.com`)
   - `wordpressUsername` (WordPress username)
   - `wordpressAppPassword` (WordPress Application Password)

2. **WordPress Setup**:
   - WordPress REST API must be enabled (default in WordPress 4.7+)
   - Application Password must be created in WordPress (Users → Profile → Application Passwords)
   - The user must have permission to create posts

## Usage

### From Client-Side (JavaScript/TypeScript)

```typescript
import { functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';

// Call the function
const publishBlog = httpsCallable(functions, 'publishBlogCallable');

const testPublish = async () => {
  try {
    const result = await publishBlog({
      siteId: 'your-site-id-here',
      postData: {
        title: 'Test Blog Post',
        content: '<h1>Test Blog Post</h1><p>This is a test blog post content.</p>',
        slug: 'test-blog-post',
        excerpt: 'This is a test excerpt' // Optional
      }
    });

    console.log('Published successfully!');
    console.log('Post ID:', result.data.postId);
    console.log('Post URL:', result.data.postUrl);
  } catch (error) {
    console.error('Error publishing:', error);
  }
};
```

### From Firebase Console (Testing)

1. Go to Firebase Console → Functions
2. Find `publishBlogCallable`
3. Click "Test" tab
4. Use this test payload:

```json
{
  "siteId": "your-site-id-here",
  "postData": {
    "title": "Test Blog Post",
    "content": "<h1>Test Blog Post</h1><p>This is a test blog post with some content.</p><h2>Section 1</h2><p>More content here.</p>",
    "slug": "test-blog-post",
    "excerpt": "This is a test excerpt for the blog post"
  }
}
```

### Using cURL (for testing)

```bash
# First, get your Firebase auth token
# Then call the function endpoint

curl -X POST \
  https://australia-southeast1-apex-seo-ffbd0.cloudfunctions.net/publishBlogCallable \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "data": {
      "siteId": "your-site-id-here",
      "postData": {
        "title": "Test Blog Post",
        "content": "<h1>Test</h1><p>Content here</p>",
        "slug": "test-blog-post",
        "excerpt": "Test excerpt"
      }
    }
  }'
```

### Using from Another Cloud Function

```typescript
// Inside another Cloud Function
import { publishToWordPress } from './index';

const result = await publishToWordPress('site-id-here', {
  title: 'My Blog Post',
  content: '<h1>Title</h1><p>Content...</p>',
  slug: 'my-blog-post',
  excerpt: 'Optional excerpt'
});

console.log(`Published! Post ID: ${result.postId}, URL: ${result.postUrl}`);
```

## Response Format

```typescript
{
  success: true,
  postId: number,      // WordPress post ID
  postUrl: string     // Full URL to the published post
}
```

## Requirements

- **Authentication**: User must be authenticated
- **Required Fields**:
  - `siteId`: The Firestore site document ID
  - `postData.title`: Blog post title
  - `postData.content`: HTML content for the post
  - `postData.slug`: URL-friendly slug for the post
- **Optional Fields**:
  - `postData.excerpt`: Post excerpt/summary

## URL Normalization

The function automatically:
- Ensures the URL uses HTTPS
- Removes trailing slashes
- Handles both `wordpressUrl` and `wordpressApiUrl` fields
- Strips `/wp-json` if present (adds it back correctly)
- Appends `/wp-json/wp/v2/posts` to create the API endpoint

**Examples:**
- `https://example.com` → `https://example.com/wp-json/wp/v2/posts`
- `https://example.com/` → `https://example.com/wp-json/wp/v2/posts`
- `http://example.com/wp-json` → `https://example.com/wp-json/wp/v2/posts`

## Post Status

By default, posts are created as **drafts** (`status: "draft"`) so you can review them before publishing. To change this, modify the `publishToWordPress` function and change:

```typescript
status: "draft", // Change to "publish" to publish immediately
```

## Error Handling

The function provides detailed error messages for common issues:

- **401 Unauthorized**: "WordPress authentication failed. Please check your username and application password."
- **403 Forbidden**: "WordPress API access forbidden. Please check your application password permissions."
- **404 Not Found**: "WordPress API endpoint not found. Please verify the URL is correct."
- **500+ Server Error**: WordPress server error details
- **Missing Credentials**: Clear error if site configuration is incomplete
- **Network Errors**: Handles unreachable WordPress sites

All errors are logged to Cloud Functions logs for debugging.

## WordPress Application Password Setup

1. Log in to WordPress admin
2. Go to **Users → Profile** (or your user profile)
3. Scroll down to **Application Passwords**
4. Enter a name (e.g., "Apex SEO")
5. Click **Add New Application Password**
6. Copy the generated password (you won't see it again!)
7. Use this password as `wordpressAppPassword` in your site configuration

**Note**: Application Passwords are different from your regular WordPress password and are more secure for API access.

## Testing Checklist

- [ ] Site has `wordpressUrl` or `wordpressApiUrl` configured
- [ ] Site has `wordpressUsername` configured
- [ ] Site has `wordpressAppPassword` (Application Password) configured
- [ ] WordPress site is accessible
- [ ] WordPress REST API is enabled
- [ ] Application Password has been created in WordPress
- [ ] User has permission to create posts in WordPress
- [ ] Test with a simple post first
- [ ] Verify post appears in WordPress admin as draft
- [ ] Check post URL is correct
