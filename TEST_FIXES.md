# Jiomart Scraper Fixes - Testing Guide

## Summary of Fixes Applied

### 1. **Category Name Preservation** ✅ FIXED
- **Issue**: Category always showing as "Unknown" 
- **Fix**: 
  - Modified lines 681-687 to extract category from first target
  - Updated all `transformJiomartProduct` calls to use `job.category` instead of hardcoded 'Unknown'
  - Category is now properly passed through the entire pipeline

### 2. **Timeout Integration** ✅ FIXED  
- **Issue**: 15-minute timeout too aggressive for large categories (Baby Care, etc.)
- **Fix**: 
  - Increased orchestrator timeout from 15 min → 30 min (line 501)
  - Optimized `smartScroll()` function:
    - Reduced iterations: 250 → 100
    - Increased scroll step: 800 → 1500px (fewer iterations needed)
    - Reduced scroll delay: 2-4s → 1.5-2.5s
    - Reduced stability threshold: 12 → 10
  - Result: Expected execution time ~5-7 minutes for large categories

### 3. **Better Error Handling** ✅ FIXED
- **Issue**: All AbortErrors triggering auto-pause (including legitimate timeouts)
- **Fix**:
  - Separated network errors from timeout errors
  - Only actual network errors (ECONNREFUSED, ENOTFOUND) trigger auto-pause
  - Timeout errors log warning but continue to next pincode
  - More granular error differentiation

## Testing Steps

### Test 1: Category Naming
```bash
# Scrape Baby Care with pincode 400706
# Expected: File should be saved as "Jiomart_400706_TIMESTAMP.json" in "Baby Care/" folder
# NOT in "Health & Wellness/" or "Unknown Category/" folder
```

### Test 2: File Creation on Success
```bash
# After scrape completes (5-10 minutes for large category)
# Verify:
# 1. File exists in correct category folder
# 2. File size is > 100KB (contains products)
# 3. "category" field in JSON is "Baby Care", not "Unknown"
```

### Test 3: Timeout Handling
```bash
# Large category should complete within 30 minutes
# Verify logs show:
# - ✅ Instead of "Network error — scrape AUTO-PAUSED"
# - Should show scrape completed successfully even if it takes 20+ minutes
```

### Test 4: Checkpoint Saves
```bash
# Monitor scraped_data/Baby Care/ folder during scraping
# Expect to see checkpoint files being created every 10 seconds (if using async endpoint)
# Even if main request fails, checkpoint should have saved partial data
```

## How to Run Tests

### Quick Test (Small Category)
```bash
curl -X POST http://localhost:7000/api/mass-scrape \
  -H "Content-Type: application/json" \
  -d '{
    "platforms": ["jiomart"],
    "categories": ["Bakery"],
    "pincodes": ["400706"],
    "autoIngest": false
  }'
```

### Full Test (Large Category - Wait 10-15 minutes)
```bash
curl -X POST http://localhost:7000/api/mass-scrape \
  -H "Content-Type: application/json" \
  -d '{
    "platforms": ["jiomart"],
    "categories": ["Baby Care"],
    "pincodes": ["400706"],
    "autoIngest": false
  }'
```

## Verification Checklist

- [ ] Logs show category name correctly (not "Unknown Category")
- [ ] Files created in correct folder (scraped_data/Baby Care/)
- [ ] No auto-pause on timeouts (should complete successfully)
- [ ] File contains valid JSON with products
- [ ] Category field in products is "Baby Care", not "Unknown"
- [ ] Timestamps in filenames are correct

## Known Limitations

1. **Checkpoint saves**: Only works with `/jiomartcategoryscrapper-async` endpoint
   - Orchestrator currently uses sync endpoint
   - Consider switching to async endpoint for better resilience

2. **Network detection**: Limited to common network errors
   - Rare network scenarios may still not be detected perfectly
   - Best approach: manual pause if needed

## Next Steps

1. Test with actual large categories (Baby Care, Fruits & Vegetables, etc.)
2. Monitor error logs for any unexpected issues
3. If issues persist, consider switching orchestrator to use async endpoint
4. Increase timeout further if needed (currently 30 min)
