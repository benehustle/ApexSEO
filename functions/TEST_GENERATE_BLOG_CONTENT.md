# Testing generateBlogContent Function

## Overview
The `generateBlogContent` function generates full HTML blog content from a calendar entry using the Gemini API.

## Function Details

### Internal Function
- **Name**: `generateBlogContent`
- **Location**: `functions/src/index.ts`
- **Type**: Internal async function (can be used by other Cloud Functions)

### HTTP Callable Function
- **Name**: `generateBlogContentCallable`
- **Type**: Firebase HTTP Callable Function
- **Region**: `australia-southeast1`
- **Timeout**: 540 seconds (9 minutes)
- **Memory**: 1GB

## Usage

### From Client-Side (JavaScript/TypeScript)

```typescript
import { functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';

// Call the function
const generateBlogContent = httpsCallable(functions, 'generateBlogContentCallable');

const testGeneration = async () => {
  try {
    const result = await generateBlogContent({
      calendarEntry: {
        keyword: "best seo practices",
        blogTopic: "Best SEO Practices for 2024",
        blogDescription: "A comprehensive guide to modern SEO strategies and techniques that help improve search engine rankings and organic traffic.",
        imagePrompt: "Professional SEO dashboard with analytics" // Optional
      }
    });

    console.log('Generated content:', result.data.content);
    console.log('Word count:', result.data.wordCount);
    console.log('Character count:', result.data.characterCount);
  } catch (error) {
    console.error('Error generating content:', error);
  }
};
```

### From Firebase Console (Testing)

1. Go to Firebase Console → Functions
2. Find `generateBlogContentCallable`
3. Click "Test" tab
4. Use this test payload:

```json
{
  "calendarEntry": {
    "keyword": "best seo practices",
    "blogTopic": "Best SEO Practices for 2024",
    "blogDescription": "A comprehensive guide to modern SEO strategies and techniques that help improve search engine rankings and organic traffic.",
    "imagePrompt": "Professional SEO dashboard with analytics"
  }
}
```

### Using cURL (for testing)

```bash
# First, get your Firebase auth token
# Then call the function endpoint

curl -X POST \
  https://australia-southeast1-apex-seo-ffbd0.cloudfunctions.net/generateBlogContentCallable \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "data": {
      "calendarEntry": {
        "keyword": "best seo practices",
        "blogTopic": "Best SEO Practices for 2024",
        "blogDescription": "A comprehensive guide to modern SEO strategies and techniques that help improve search engine rankings and organic traffic."
      }
    }
  }'
```

### Using from Another Cloud Function

```typescript
// Inside another Cloud Function
import { generateBlogContent } from './index'; // Note: You may need to export it

const htmlContent = await generateBlogContent({
  keyword: "best seo practices",
  blogTopic: "Best SEO Practices for 2024",
  blogDescription: "A comprehensive guide to modern SEO strategies...",
  imagePrompt: "Optional image prompt"
});
```

## Response Format

```typescript
{
  success: true,
  content: string,        // HTML content ready for WordPress
  wordCount: number,      // Approximate word count
  characterCount: number // Total character count
}
```

## Requirements

- **Authentication**: User must be authenticated
- **Required Fields**:
  - `keyword`: Target SEO keyword
  - `blogTopic`: Main topic/title of the blog
  - `blogDescription`: Description of what the blog will cover
- **Optional Fields**:
  - `imagePrompt`: Prompt for image generation (not used in content generation)

## Output Format

The function returns HTML content that:
- Starts with `<h1>` tag (the blogTopic)
- Uses semantic HTML (`<h2>`, `<h3>`, `<p>`, `<ul>`, `<li>`, etc.)
- Does NOT include `<html>`, `<head>`, or `<body>` tags
- Is ready to paste directly into WordPress editor
- Contains minimum 1000 words
- Naturally optimizes for the provided keyword

## Error Handling

The function will throw errors for:
- Missing authentication
- Missing required fields
- Gemini API failures
- Content generation failures

All errors are logged to Cloud Functions logs for debugging.
