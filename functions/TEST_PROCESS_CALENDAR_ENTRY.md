# Testing processCalendarEntry Function

## Overview
The `processCalendarEntry` function is the orchestrator that ties together content generation and WordPress publishing. It processes a calendar entry by generating blog content and publishing it to WordPress.

## Function Details

### Internal Function
- **Name**: `processCalendarEntry`
- **Location**: `functions/src/index.ts`
- **Type**: Exported async function (can be used by other Cloud Functions)

### HTTP Callable Function
- **Name**: `processCalendarEntryCallable`
- **Type**: Firebase HTTP Callable Function
- **Region**: `australia-southeast1`
- **Timeout**: 600 seconds (10 minutes)
- **Memory**: 1GB

## Prerequisites

1. **Calendar Entry**: A document must exist at `sites/{siteId}/contentCalendar/{calendarId}` with:
   - `keyword`: Target SEO keyword
   - `blogTopic`: Blog post title/topic
   - `blogDescription`: Description of the blog content
   - `imagePrompt`: (Optional) Prompt for featured image generation
   - `status`: Current status (will be updated during processing)

2. **Site Configuration**: The site must have WordPress credentials configured:
   - `wordpressUrl` or `wordpressApiUrl`
   - `wordpressUsername`
   - `wordpressAppPassword`

## Processing Flow

1. **Fetch Calendar Entry**: Retrieves the document from Firestore
2. **Safety Check**: Verifies the entry isn't already published (prevents duplicates)
3. **Status Update**: Sets status to 'processing' to prevent concurrent processing
4. **Generate Content**: Calls `generateBlogContent` to create HTML content
5. **Generate Slug**: Creates URL-friendly slug from `blogTopic`
6. **Publish to WordPress**: Calls `publishToWordPress` to create the post
7. **Update Firestore**: Updates the calendar entry with:
   - `status`: 'published'
   - `wordpressPostId`: WordPress post ID
   - `wordpressPostUrl`: Full URL to the published post
   - `publishedAt`: Timestamp of publication
8. **Error Handling**: If any step fails, updates status to 'error' and saves `errorMessage`

## Usage

### From Client-Side (JavaScript/TypeScript)

```typescript
import { functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';

// Call the function
const processCalendarEntry = httpsCallable(functions, 'processCalendarEntryCallable');

const handlePublishNow = async (siteId: string, calendarId: string) => {
  try {
    const result = await processCalendarEntry({
      siteId: siteId,
      calendarId: calendarId
    });

    if (result.data.success) {
      console.log('✅ Published successfully!');
      console.log('Post ID:', result.data.postId);
      console.log('Post URL:', result.data.postUrl);
    } else {
      console.error('❌ Publishing failed:', result.data.error);
    }
  } catch (error) {
    console.error('Error processing calendar entry:', error);
  }
};
```

### From Firebase Console (Testing)

1. Go to Firebase Console → Functions
2. Find `processCalendarEntryCallable`
3. Click "Test" tab
4. Use this test payload:

```json
{
  "siteId": "your-site-id-here",
  "calendarId": "your-calendar-entry-id-here"
}
```

### Using cURL (for testing)

```bash
# First, get your Firebase auth token
# Then call the function endpoint

curl -X POST \
  https://australia-southeast1-apex-seo-ffbd0.cloudfunctions.net/processCalendarEntryCallable \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "data": {
      "siteId": "your-site-id-here",
      "calendarId": "your-calendar-entry-id-here"
    }
  }'
```

### Using from Another Cloud Function

```typescript
// Inside another Cloud Function
import { processCalendarEntry } from './index';

const result = await processCalendarEntry('site-id', 'calendar-id');

if (result.success) {
  console.log(`Published! Post ID: ${result.postId}, URL: ${result.postUrl}`);
} else {
  console.error(`Failed: ${result.error}`);
}
```

## Response Format

### Success Response
```typescript
{
  success: true,
  postId: number,      // WordPress post ID
  postUrl: string     // Full URL to the published post
}
```

### Error Response
```typescript
{
  success: false,
  error: string       // Error message describing what went wrong
}
```

## Status Flow

The calendar entry status transitions through these states:

1. **Initial State**: Any status (e.g., 'planned', 'pending', 'approved')
2. **Processing**: Status set to 'processing' when function starts
3. **Published**: Status set to 'published' on success
4. **Error**: Status set to 'error' if any step fails

## Safety Features

### Duplicate Prevention
- If `status === 'published'`, the function returns early without processing
- Prevents accidental duplicate posts

### Concurrent Processing Prevention
- Sets status to 'processing' immediately after validation
- Prevents multiple instances from processing the same entry simultaneously

### Error Recovery
- All errors are caught and logged
- Calendar entry is updated with error status and message
- Allows for retry logic in the dashboard

## Calendar Entry Document Structure

### Required Fields
```typescript
{
  keyword: string;              // Target SEO keyword
  blogTopic: string;            // Blog post title
  blogDescription: string;      // Description of content
  status?: string;               // Current status
}
```

### Optional Fields
```typescript
{
  imagePrompt?: string;          // Prompt for featured image (TODO)
  wordpressPostId?: number;      // Set after publishing
  wordpressPostUrl?: string;     // Set after publishing
  publishedAt?: Timestamp;       // Set after publishing
  errorMessage?: string;         // Set on error
  updatedAt?: Timestamp;         // Updated on each change
}
```

## Error Scenarios

The function handles these error scenarios:

1. **Calendar Entry Not Found**: Returns error immediately
2. **Missing Required Fields**: Validates before processing
3. **Content Generation Failure**: Updates status to 'error' with message
4. **WordPress Publishing Failure**: Updates status to 'error' with message
5. **Network/API Errors**: Caught and logged with detailed messages

## Testing Checklist

- [ ] Calendar entry exists in Firestore at correct path
- [ ] Calendar entry has required fields (keyword, blogTopic, blogDescription)
- [ ] Site has WordPress credentials configured
- [ ] WordPress site is accessible
- [ ] Test with a calendar entry that has status !== 'published'
- [ ] Verify post appears in WordPress as draft
- [ ] Verify calendar entry status updated to 'published'
- [ ] Verify wordpressPostId and wordpressPostUrl are saved
- [ ] Test error handling with invalid calendar entry
- [ ] Test duplicate prevention (try publishing same entry twice)

## Integration with UI

### "Publish Now" Button
```typescript
const handlePublishNow = async () => {
  setLoading(true);
  try {
    const result = await processCalendarEntry({
      siteId: selectedSiteId,
      calendarId: selectedCalendarId
    });
    
    if (result.data.success) {
      // Show success message
      toast.success(`Published! View post: ${result.data.postUrl}`);
      // Refresh calendar entries
      loadCalendarEntries();
    } else {
      // Show error message
      toast.error(`Failed: ${result.data.error}`);
    }
  } catch (error) {
    toast.error('An error occurred');
  } finally {
    setLoading(false);
  }
};
```

### Scheduler Integration
The function can be called from a Cloud Scheduler job to automatically publish scheduled entries:

```typescript
// In a scheduled Cloud Function
export const scheduledPublish = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    // Find calendar entries scheduled for now
    const now = admin.firestore.Timestamp.now();
    const entries = await admin.firestore()
      .collectionGroup('contentCalendar')
      .where('status', '==', 'approved')
      .where('scheduledDate', '<=', now)
      .get();
    
    for (const entry of entries.docs) {
      const siteId = entry.ref.parent.parent?.id;
      if (siteId) {
        await processCalendarEntry(siteId, entry.id);
      }
    }
  });
```

## Notes

- **Image Generation**: Currently a TODO placeholder. The `imagePrompt` field is passed to `generateBlogContent` but not used for image generation yet.
- **Post Status**: Posts are published as drafts by default (configured in `publishToWordPress`). Change this if you want immediate publishing.
- **Slug Generation**: Automatically generates URL-friendly slugs from `blogTopic`. Special characters are removed and spaces become hyphens.
