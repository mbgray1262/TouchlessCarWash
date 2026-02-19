# Firecrawl Pipeline Setup Guide

This document explains how to use the Firecrawl web scraping pipeline to automatically discover and import car wash listings into your database.

## Overview

The Firecrawl pipeline consists of:

1. **Edge Functions**: Two Supabase Edge Functions handle crawling and webhook processing
2. **Database Table**: `crawl_jobs` table tracks all scraping jobs
3. **Admin Interface**: Web UI for managing and monitoring crawls
4. **Automatic Processing**: Scraped data is automatically parsed and added to submissions

## Prerequisites

You need a Firecrawl API key to use this pipeline:

1. Sign up at [firecrawl.dev](https://firecrawl.dev)
2. Get your API key from the dashboard
3. The API key will be automatically configured in your Supabase project

## How to Use

### 1. Access the Admin Interface

Navigate to `/admin/crawls` in your application to access the crawl management dashboard.

### 2. Create a New Crawl Job

Click "New Crawl" and configure:

- **Starting URL**: The webpage where crawling should begin (e.g., `https://carwashfinder.com/locations`)
- **Max Depth**: How many link levels to follow (default: 3)
- **Page Limit**: Maximum number of pages to crawl (default: 100)
- **Include Paths**: Only crawl URLs matching these patterns (optional)
- **Exclude Paths**: Skip URLs matching these patterns (optional)
- **Extract Schema**: Enable structured data extraction for car wash information

### 3. Monitor Progress

Once started, the crawl job will:

1. Show status: `pending` → `running` → `completed` or `failed`
2. Update in real-time via webhooks
3. Display number of pages scraped
4. Show extracted data when complete

### 4. Review Results

Click "View" on any crawl job to see:

- **Configuration**: Settings used for the crawl
- **Results**: All scraped pages and extracted data
- **Error Details**: If the crawl failed, see why

### 5. Process Extracted Data

When a crawl completes with structured extraction enabled:

- Car wash data is automatically parsed
- New submissions are created in the `submissions` table
- Review submissions at `/admin/submissions` (if you have that page)
- Approve submissions to add them as listings

## Data Extraction Schema

The default car wash extraction schema captures:

- **Business Name**: Official name of the car wash
- **Address Information**: Street address, city, state, ZIP
- **Contact Details**: Phone number, website URL
- **Operating Hours**: Business hours by day of week
- **Wash Packages**: Available packages with names, prices, descriptions
- **Amenities**: Features like "Free Vacuums", "Touchless", "Self-Service"
- **Location Coordinates**: Latitude and longitude (if available)

## API Endpoints

### Start a Crawl

```bash
POST /functions/v1/start-crawl
Authorization: Bearer YOUR_SUPABASE_ANON_KEY
Content-Type: application/json

{
  "url": "https://example.com/car-washes",
  "maxDepth": 3,
  "limit": 100,
  "includePaths": ["/locations/*"],
  "excludePaths": ["/blog/*"],
  "extractSchema": { ... }
}
```

### Webhook Endpoint

The webhook endpoint `/functions/v1/crawl-webhook` is automatically called by Firecrawl when:
- Crawl starts
- Progress updates occur
- Crawl completes
- Errors happen

## Database Schema

### crawl_jobs Table

```sql
- id: UUID (primary key)
- job_id: Text (Firecrawl job ID)
- url: Text (starting URL)
- status: Text (pending, running, completed, failed)
- crawl_config: JSONB (configuration used)
- results: JSONB (scraped data)
- results_count: Integer (number of pages)
- error_message: Text (error details if failed)
- created_at: Timestamp
- updated_at: Timestamp
- completed_at: Timestamp
```

## Best Practices

1. **Start Small**: Test with `maxDepth: 1` and `limit: 10` first
2. **Use Path Filters**: Narrow down to relevant pages only
3. **Monitor Costs**: Firecrawl charges per page scraped
4. **Review Before Approval**: Check submissions before making them live listings
5. **Avoid Duplicates**: Check if a site was already crawled before starting a new job

## Troubleshooting

### Crawl Gets Stuck in "Running"

- Webhook might not be configured correctly
- Check Firecrawl dashboard for job status
- Refresh the crawl detail page to see latest status

### No Data Extracted

- The website structure might not match the extraction schema
- Try crawling without extraction first to see raw content
- Adjust the schema to match the actual page structure

### Rate Limiting

- Firecrawl has built-in rate limiting
- Reduce `limit` if hitting API constraints
- Space out crawls over time

## Security Notes

- Only authenticated users can create crawls
- Service role is required for webhook updates
- All crawl jobs are visible to authenticated users
- Review extracted data before approving listings

## Support

For Firecrawl-specific issues:
- Documentation: [docs.firecrawl.dev](https://docs.firecrawl.dev)
- Support: [firecrawl.dev/support](https://firecrawl.dev/support)

For pipeline issues:
- Check Edge Function logs in Supabase dashboard
- Review crawl job error messages
- Inspect webhook payload in function logs
