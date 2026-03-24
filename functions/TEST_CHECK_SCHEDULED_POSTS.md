# checkScheduledPosts Scheduled Function

## Overview
The `checkScheduledPosts` function is a scheduled Cloud Function that automatically checks for and publishes due calendar entries across all sites. It runs every hour and processes posts that are scheduled to be published.

## Function Details

- **Name**: `checkScheduledPosts`
- **Type**: Scheduled Cloud Function (Pub/Sub trigger)
- **Region**: `australia-southeast1`
- **Schedule**: Every hour at minute 0 (cron: `0 * * * *`)
- **Timezone**: UTC
- **Timeout**: 540 seconds (9 minutes)
- **Memory**: 1GB

## How It Works

1. **Collection Group Query**: Uses Firestore Collection Group Query to efficiently search across all `sites/{siteId}/contentCalendar/{calendarId}` collections
2. **Filtering**: Finds entries where:
   - `status` is one of: `'scheduled'`, `'approved'`, or `'pending'`
   - `scheduledDate` <= current time (posts that are due)
3. **Batch Processing**: Processes entries in batches of 5 (configurable) to avoid API rate limits
4. **Concurrency Control**: Limits parallel processing to prevent overwhelming Gemini API and WordPress
5. **Error Handling**: Catches and logs errors for individual entries without stopping the entire batch

## Prerequisites

### Firestore Index Required

**IMPORTANT**: This function requires a composite index for the Collection Group Query. When you first deploy, Firestore will provide a link to create the index automatically, or you can create it manually:

**Index Configuration:**
- Collection ID: `contentCalendar` (Collection Group)
- Fields:
  1. `status` (Ascending)
  2. `scheduledDate` (Ascending)

**To create the index:**
1. Deploy the function
2. Firestore will show an error with a link to create the index
3. Click the link and create the index
4. Wait for the index to build (may take a few minutes)

Alternatively, you can add it to `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "contentCalendar",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        {
          "fieldPath": "status",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "scheduledDate",
          "order": "ASCENDING"
        }
      ]
    }
  ]
}
```

## Calendar Entry Requirements

For a calendar entry to be processed, it must have:

1. **Status**: One of `'scheduled'`, `'approved'`, or `'pending'`
2. **scheduledDate**: A Firestore Timestamp that is <= current time
3. **Required Fields**:
   - `keyword`: Target SEO keyword
   - `blogTopic`: Blog post title
   - `blogDescription`: Description of content

## Processing Flow

```
1. Function triggers (every hour)
   ↓
2. Query all contentCalendar collections
   ↓
3. Filter: status IN ['scheduled', 'approved', 'pending'] AND scheduledDate <= now
   ↓
4. Process in batches of 5
   ↓
5. For each entry:
   - Extract siteId from document path
   - Call processCalendarEntry(siteId, calendarId)
   - Log result
   ↓
6. Log summary (successful vs failed)
```

## Concurrency Control

- **Batch Size**: 5 entries processed in parallel per batch
- **Delay Between Batches**: 1 second delay to avoid overwhelming APIs
- **Rate Limiting**: Designed to respect Gemini API and WordPress API rate limits

To adjust concurrency, modify the `concurrencyLimit` constant in the function:

```typescript
const concurrencyLimit = 5; // Change to 10 for faster processing (if APIs allow)
```

## Logging

The function provides detailed logging:

### Startup
```
[checkScheduledPosts] Starting scheduled post check...
[checkScheduledPosts] Current time: 2024-01-15T10:00:00.000Z
```

### Query Results
```
[checkScheduledPosts] Found 12 due calendar entries to process
```

### Batch Processing
```
[checkScheduledPosts] Processing batch 1/3 (5 entries)
[checkScheduledPosts] Processing: siteId=abc123, calendarId=xyz789, topic="My Blog Post"
```

### Results
```
[checkScheduledPosts] ✅ Successfully processed: siteId=abc123, calendarId=xyz789, postId=12345
[checkScheduledPosts] ❌ Failed to process: siteId=abc123, calendarId=xyz789, error=WordPress authentication failed
```

### Summary
```
[checkScheduledPosts] ✅ Processing complete:
  - Total entries found: 12
  - Successfully processed: 10
  - Failed: 2
```

## Manual Testing

### Trigger Manually via Firebase Console

1. Go to Firebase Console → Functions
2. Find `checkScheduledPosts`
3. Click "..." menu → "Trigger function"
4. The function will run immediately

### Trigger via gcloud CLI

```bash
gcloud functions call checkScheduledPosts \
  --region=australia-southeast1 \
  --gen2
```

### Test with Emulator

```bash
# Start emulator
firebase emulators:start --only functions

# In another terminal, trigger the function
curl -X POST http://localhost:5001/apex-seo-ffbd0/australia-southeast1/checkScheduledPosts
```

## Monitoring

### View Logs

```bash
# View recent logs
firebase functions:log --only checkScheduledPosts

# Follow logs in real-time
firebase functions:log --only checkScheduledPosts --follow
```

### Cloud Console

1. Go to Google Cloud Console
2. Navigate to Cloud Functions
3. Find `checkScheduledPosts`
4. Click "Logs" tab to view execution history

## Error Handling

The function handles errors gracefully:

1. **Individual Entry Errors**: If one entry fails, others continue processing
2. **Error Logging**: All errors are logged with context (siteId, calendarId, error message)
3. **Status Updates**: Failed entries are updated in Firestore with `status: 'error'` and `errorMessage`
4. **Summary Report**: Final log includes count of successful vs failed entries

## Scheduling Configuration

The function runs every hour. To change the schedule, modify the cron expression:

```typescript
.schedule("0 * * * *") // Every hour at minute 0
```

**Common Cron Patterns:**
- `"0 * * * *"` - Every hour
- `"0 */2 * * *"` - Every 2 hours
- `"0 9,17 * * *"` - At 9 AM and 5 PM daily
- `"0 9 * * 1"` - Every Monday at 9 AM
- `"*/15 * * * *"` - Every 15 minutes

## Performance Considerations

### Timeout
- Set to 540 seconds (9 minutes) to allow processing multiple entries
- If you have many entries, consider increasing timeout or reducing batch size

### Memory
- Set to 1GB to handle content generation (Gemini API calls can be memory-intensive)
- Monitor memory usage in Cloud Console

### Rate Limits
- Current batch size (5) is conservative to avoid rate limits
- Monitor API usage and adjust if needed
- Consider implementing exponential backoff for retries

## Troubleshooting

### No Entries Found
- Check that calendar entries have `status` in `['scheduled', 'approved', 'pending']`
- Verify `scheduledDate` is set and is a Firestore Timestamp
- Ensure `scheduledDate` is <= current time

### Index Error
- If you see "index required" error, create the composite index (see Prerequisites)
- Wait for index to finish building before testing

### Timeout Errors
- Reduce batch size (e.g., from 5 to 3)
- Increase timeout (e.g., from 540 to 600 seconds)
- Check if individual entries are taking too long

### Rate Limit Errors
- Reduce batch size
- Increase delay between batches
- Check Gemini API and WordPress API quotas

## Integration with Dashboard

The function updates calendar entry status, which can be displayed in your dashboard:

- **Success**: `status: 'published'`, `wordpressPostId`, `wordpressPostUrl` set
- **Error**: `status: 'error'`, `errorMessage` set
- **Processing**: `status: 'processing'` (temporary, set by processCalendarEntry)

You can query these statuses in your UI to show:
- Recently published posts
- Failed posts that need attention
- Posts currently being processed

## Best Practices

1. **Monitor Regularly**: Check logs weekly to ensure function is running correctly
2. **Set Alerts**: Configure Cloud Monitoring alerts for function failures
3. **Test Before Production**: Test with a few entries before deploying to production
4. **Gradual Rollout**: Start with a small number of scheduled posts to test
5. **Backup Strategy**: Keep manual publish option available as backup
