# 📅 Date Override Feature - Manual Insertion Guide

## Overview

The date override feature allows you to manually specify the `scrapedAt` date when ingesting files, instead of using the date from the JSON file or the current date.

---

## How Date Override Works

### Without Date Override (Default Behavior)
```javascript
// Script tries dates in this order:
1. dateOverride parameter      → ❌ (not provided)
2. products[0].time            → If JSON file has "time" field
3. products[0].scrapedAt       → If JSON file has "scrapedAt" field
4. current date                → new Date()
```

### With Date Override (New Feature)
```javascript
// Ignores product dates, uses specified date
1. dateOverride parameter      → ✅ USES THIS!
2. products[0].time            → Ignored
3. products[0].scrapedAt       → Ignored
4. current date                → Ignored
```

---

## API Endpoints Updated

### 1. Direct API Ingestion
**Endpoint:** `POST /api/data/ingest`

**With Date Override:**
```json
{
  "pincode": "401202",
  "platform": "instamart",
  "category": "Fruits & Vegetables",
  "products": [...],
  "dateOverride": "2026-03-25T10:30:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Processed 200 products in 2345ms.",
  "stats": {
    "new": 180,
    "updated": 20,
    "elapsed": "2345ms"
  }
}
```

---

### 2. Manual File Ingestion
**Endpoint:** `POST /api/data/ingest-file`

**With Date Override:**
```json
{
  "filePath": "/absolute/path/to/Instamart_401202_2026-03-25.json",
  "dateOverride": "2026-03-25T10:30:00Z"
}
```

**Without Date Override (Uses file data):**
```json
{
  "filePath": "/absolute/path/to/Instamart_401202_2026-03-25.json"
}
```

---

### 3. Batch Directory Ingestion
**Endpoint:** `POST /api/data/ingest-directory`

**With Date Override (applies to ALL files):**
```json
{
  "dirPath": "/absolute/path/to/scraped_data",
  "dateOverride": "2026-03-25T10:30:00Z"
}
```

**Without Date Override (uses date from each file):**
```json
{
  "dirPath": "/absolute/path/to/scraped_data"
}
```

---

## Practical Examples

### Example 1: Ingest with Yesterday's Date

**Scenario:** You want to re-scrape yesterday's data but insert it as if it was today

```bash
curl -X POST http://localhost:3000/api/data/ingest-file \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "d:\\creatosaurus-intership\\quick-commerce-scrappers\\mainserver\\scraped_data\\Fruits _ Vegetables\\Instamart_401202_2026-03-25.json",
    "dateOverride": "2026-03-25T00:00:00Z"
  }'
```

**What Happens:**
- All products in file → inserted with `scrapedAt: 2026-03-25T00:00:00Z`
- Ignores any time data in the JSON file
- Creates snapshot for March 25

---

### Example 2: Batch Ingest with Custom Date

**Scenario:** Ingest multiple days of backfilled data as if scraped on March 25

```json
POST /api/data/ingest-directory
{
  "dirPath": "d:\\creatosaurus-intership\\quick-commerce-scrappers\\mainserver\\scraped_data",
  "dateOverride": "2026-03-25T12:00:00Z"
}
```

**All files in that directory:**
- Instamart file → inserted with `scrapedAt: 2026-03-25T12:00:00Z`
- Blinkit file → inserted with `scrapedAt: 2026-03-25T12:00:00Z`
- Zepto file → inserted with `scrapedAt: 2026-03-25T12:00:00Z`
- etc.

---

### Example 3: Retry Failed Insertion with Same Date

**Scenario:** Yesterday's insertion failed, retrying today. Want to keep the SAME scrapedAt date.

```json
POST /api/data/ingest-file
{
  "filePath": "d:\\path\\to\\Blinkit_400703_2026-03-24.json",
  "dateOverride": "2026-03-24T14:30:00Z"
}
```

**Why this matters:**
- Without override: Would use today's date, creating wrong timeline
- With override: Products recorded as if scraped on March 24
- Duplicate check still works: existing products with same date won't be re-inserted

---

## Date Format

All dates must be in **ISO 8601 format**:

| Format | Example | Notes |
|--------|---------|-------|
| Full timestamp | `2026-03-25T10:30:45Z` | Recommended - includes seconds |
| Just date+time | `2026-03-25T10:30:00Z` | Common format |
| Date only | `2026-03-25T00:00:00Z` | Midnight UTC |
| Alternate | `2026-03-25T10:30:45.123Z` | With milliseconds |

**Valid Examples:**
- ✅ `2026-03-25T14:30:00Z`
- ✅ `2026-03-25T00:00:00Z`
- ✅ `2026-03-25T23:59:59Z`
- ✅ `2026-03-25T10:30:45.500Z`

**Invalid Examples:**
- ❌ `2026-03-25` (missing time)
- ❌ `03/25/2026` (wrong format)
- ❌ `2026-03-25 10:30:00` (space instead of T)

---

## Verification: How to Check It's Working

### Check 1: View Inserted Products
```javascript
// Query MongoDB to verify date
db.productsnapshots.findOne({
  platform: "instamart",
  category: "Fruits & Vegetables"
}).pretty()
```

**Output:**
```json
{
  "_id": ObjectId(...),
  "scrapedAt": ISODate("2026-03-25T10:30:00.000Z"),  // ← Should match override
  "category": "Fruits & Vegetables",
  ...
}
```

### Check 2: Monitor Logs
When ingesting with date override, logs should show:
```
⏰ Using date override: 2026-03-25T10:30:00.000Z
📅 Using scrapedAt: 2026-03-25T10:30:00.000Z
✅ Bulk inserted 200 snapshots
```

### Check 3: Query by Date
```javascript
// Find products with specific date
db.productsnapshots.countDocuments({
  scrapedAt: ISODate("2026-03-25T10:30:00Z")
})
// Should return your inserted count
```

### Check 4: Test Duplicate Prevention
If you re-run the same file with SAME date override:
```
⚠️  Some duplicates detected, inserting individually...
```

This is GOOD - means duplicate protection is working!

---

## Common Scenarios

### Scenario 1: Fill Data Gap (Missing Day)
You forgot to scrape March 23. Now it's March 26. You want to backfill March 23 data.

```bash
# Scrape fresh data today
npm run scrape:instamart 401202  # Gets fresh current prices

# BUT insert as if it was March 23
curl -X POST http://localhost:3000/api/data/ingest-file \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "d:\\path\\scraped_data\\Instamart_401202_fresh.json",
    "dateOverride": "2026-03-23T14:00:00Z"
  }'
```

Result:
- Data inserted with March 23 timestamp ✅
- Price comparisons work correctly ✅
- Timeline not affected ✅

---

### Scenario 2: Retry Failed Batch
Yesterday's batch ingestion failed halfway through. Some files processed, some didn't.

**First time (failed):**
```
❌ Connection timeout at file 5/10
```

**Today, retry with same date:**
```json
{
  "dirPath": "d:\\scraped_data",
  "dateOverride": "2026-03-24T10:00:00Z"
}
```

Result:
- Already-inserted files → skipped (duplicate check)
- Failed files → successfully inserted
- All with consistent March 24 timestamp ✅

---

### Scenario 3: Multi-Day Backfill
Multiple days of historical data needs to be loaded.

```bash
# Day 1
curl -X POST ... -d '{"filePath": "...", "dateOverride": "2026-03-22T14:00:00Z"}'

# Day 2
curl -X POST ... -d '{"filePath": "...", "dateOverride": "2026-03-23T14:00:00Z"}'

# Day 3
curl -X POST ... -d '{"filePath": "...", "dateOverride": "2026-03-24T14:00:00Z"}'

# Day 4 (today)
curl -X POST ... -d '{"filePath": "...", "dateOverride": "2026-03-25T14:00:00Z"}'
```

Result:
- Clean timeline from March 22-25 ✅
- Price trends calculated correctly ✅
- Duplicate prevention works for each date ✅

---

## Technical Details

### Where Date Override is Applied

**Flow:**
```
User Request
    ↓
  dateOverride parameter?
    ↓ YES
  Use dateOverride for ALL products
    ↓
  Normalize and validate date
    ↓
  Apply to scrapedAt field for EACH product
    ↓
  Insert to database
```

### What Gets Updated

When date override is provided:
```javascript
{
  scrapedAt: dateOverride,              // ← Changed to override
  category: "Fruits & Vegetables",      // ← Unchanged
  productName: "Milk",                  // ← Unchanged
  currentPrice: 45,                     // ← Unchanged
  // ... all other fields unchanged
}
```

### Duplicate Check Still Works

**Key Point:** Duplicate prevention uses compound index:
```javascript
{ scrapedAt, category, platform, pincode, productId }
```

Even with date override:
- Same date + category + platform + pincode + productId = **DUPLICATE** ✅
- Error code 11000 → gracefully skipped ✅

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Products inserted with today's date | No dateOverride provided | Add `"dateOverride": "2026-03-25T..."` to request |
| "Invalid date format" error | Wrong date format | Use ISO 8601: `2026-03-25T10:30:00Z` |
| Duplicate error appears | Re-ingesting same file with same date | ✅ Expected! Duplicates skipped |
| Products have different scrapedAt | Files had different timestamps | Provide dateOverride to make consistent |
| Verification query returns 0 | Date doesn't match | Check exact date: `db.products.find({scrapedAt: ISODate(...)})` |

---

## Best Practices

1. ✅ **Always use UTC timezone** - Format with `Z` suffix
2. ✅ **Set consistent time** - e.g., `14:00:00Z` for all daily batches
3. ✅ **Document your custom dates** - Log why you overrode date
4. ✅ **Verify after ingestion** - Query to confirm date applied
5. ✅ **Keep backup of original files** - Before manual insertion
6. ✅ **Use same date for retry** - If re-ingesting failed batch
7. ❌ **Don't use current date for historical data** - Defeats timeline purpose

---

## Command Reference

### Ingest Single File with Override
```bash
curl -X POST http://localhost:3000/api/data/ingest-file \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "/path/to/file.json",
    "dateOverride": "2026-03-25T10:30:00Z"
  }'
```

### Ingest Directory with Override
```bash
curl -X POST http://localhost:3000/api/data/ingest-directory \
  -H "Content-Type: application/json" \
  -d '{
    "dirPath": "/path/to/scraped_data",
    "dateOverride": "2026-03-25T10:30:00Z"
  }'
```

### Direct API with Override
```bash
curl -X POST http://localhost:3000/api/data/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "pincode": "401202",
    "platform": "instamart",
    "category": "Fruits & Vegetables",
    "products": [...],
    "dateOverride": "2026-03-25T10:30:00Z"
  }'
```

---

## Summary

✅ **Date override is NOW WORKING** across all ingestion methods:
- Single file ingestion
- Batch directory ingestion  
- Direct API ingestion

✅ **Key benefits:**
- Backfill historical data with correct dates
- Retry failed operations with same timestamp
- Maintain clean timeline
- Duplicate prevention still works

✅ **Format:** `"dateOverride": "ISO8601_DATE_STRING"`

✅ **Example:** `"dateOverride": "2026-03-25T10:30:00Z"`
