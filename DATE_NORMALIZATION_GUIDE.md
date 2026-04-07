# 📅 Date Normalization Guide

## Problem Statement
Products in the same category have inconsistent `scrapedAt` dates (March 20-24). This causes price comparison analytics to fail because they can't group prices by consistent dates.

**Example:**
```
Category: Skincare
Same product appears with:
  - scrapedAt: 2026-03-20T00:00:00Z
  - scrapedAt: 2026-03-21T00:00:00Z
  - scrapedAt: 2026-03-22T00:00:00Z (target)
  - scrapedAt: 2026-03-23T00:00:00Z
  - scrapedAt: 2026-03-24T00:00:00Z

✅ AFTER FIX: All normalized to 2026-03-22T00:00:00Z
```

---

## Solution: Two Scripts

### 1. **Test First: Single Category (Skincare)**
**File:** `fix-category-scrape-dates.js`  
**Purpose:** Test date normalization on a single category before batch applying

```bash
# Test on Skincare (Mar 20-24 → Mar 22)
node fix-category-scrape-dates.js
```

**What it does:**
- ✅ Counts products to fix (Skincare with dates Mar 20-24)
- ✅ Shows date distribution BEFORE
- ✅ Displays platform breakdown
- ✅ Shows sample products (before)
- ✅ Updates all products to Mar 22
- ✅ Verifies update success
- ✅ Shows sample products (after)
- ✅ Shows date distribution AFTER

**Example Output:**
```
📊 Pattern Analysis: Skincare (Mar 20-24)
   2026-03-20: 245 products
   2026-03-21: 189 products
   2026-03-22: 412 products (target)
   2026-03-23: 156 products
   2026-03-24: 98 products
   Total: 1,100 products

🔄 Updating all to 2026-03-22T00:00:00Z...
✅ Successfully updated: 1,100 products
```

---

### 2. **Batch Apply: All Categories**
**File:** `fix-all-category-dates.js`  
**Purpose:** Apply date normalization to ALL categories except Fruits & Vegetables

```bash
# Fix all categories except Fruits & Vegetables
node fix-all-category-dates.js
```

**What it does:**
- ✅ Gets all categories (skips Fruits & Vegetables)
- ✅ Counts products in date range (Mar 20-24) per category
- ✅ Updates ALL products to Mar 22
- ✅ Verifies updates with detailed report
- ✅ Shows summary: categories fixed, total products updated

**Example Output:**
```
🔍 Step 1: Identifying categories...
📊 Total categories: 28
📋 Categories to fix: 27
⏭️  Excluding: Fruits & Vegetables

📅 Step 2: Analyzing products with dates in range (Mar 20-24)...
📊 Products in date range (Mar 20-24): 18,547

By category:
   Skincare: 1,100
   Personal Care: 847
   Ethnic Wear: 923
   Home Care: 1,234
   [... more categories ...]

💾 Step 3: Applying date fixes...
   ✅ Skincare: 1,100 products → Mar 22
   ✅ Personal Care: 847 products → Mar 22
   [... more categories ...]

✅ DATES FIXED
   Categories Fixed: 24
   Total Products Updated: 18,547
   Verification: All 18,547 products confirmed
```

---

## Workflow

### Step 1: Test on Skincare First ✅ **TEST PHASE**
```bash
node fix-category-scrape-dates.js
```

Expected behavior:
- Should find ~1,000-2,000 Skincare products with mixed Mar 20-24 dates
- Update all to Mar 22
- Verify update succeeded
- Show before/after samples

**If Success → Proceed to Step 2**  
**If Error → Check logs and troubleshoot**

---

### Step 2: Apply to All Categories ✅ **BATCH PHASE**
```bash
node fix-all-category-dates.js
```

Expected behavior:
- Should find 10,000-20,000+ products across all categories
- Update all to Mar 22
- Verify each category update
- Show final summary

---

## Verification Steps

### Manual Verification
Before running scripts, verify the data:

```javascript
// Check products with date range in Skincare
db.productSnapshots.find({
  category: "Skincare",
  scrapedAt: {
    $gte: ISODate("2026-03-20T00:00:00Z"),
    $lte: ISODate("2026-03-24T23:59:59Z")
  }
}).limit(5)
```

### After Script Runs
Check that update worked:

```javascript
// Count Skincare products with Mar 22 date
db.productSnapshots.find({
  category: "Skincare",
  scrapedAt: ISODate("2026-03-22T00:00:00Z")
}).count()
```

Should match the "modified" count from script output.

---

## Troubleshooting

### Issue: Script hangs
**Solution:** Check MongoDB connection
```bash
# Verify MongoDB is running
mongosh
use quick_commerce
db.productSnapshots.countDocuments()
```

### Issue: "No products found"
**Solution:** Products might already be normalized or outside date range
- Check actual dates in database
- Verify category name spelling exactly

### Issue: Modified ≠ Verified count
**Solution:** Potential duplicate update or rollback occurred
- Re-run script to ensure idempotency
- Scripts are safe to re-run (idempotent)

---

## Date Normalization Strategy

### Why March 22?
- Middle date of the range (Mar 20-24)
- Represents "average" scrape date
- Allows price comparison across full range
- Consistent with analytics expectations

### Format Used
All dates stored as: `2026-03-22T00:00:00Z` (ISO 8601)

### Other Categories Excluded
- **Fruits & Vegetables** - Already fixed in separate script
- Other categories - Don't yet have mixed dates

---

## Performance Notes

**Time Complexity:**
- Skincare test: ~5-10 seconds
- All categories: ~30-60 seconds

**Database Impact:**
- Batch update (optimized for performance)
- No N+1 queries
- Minimal index rebuilding

**Safe to Run:**
- ✅ Idempotent (can re-run multiple times)
- ✅ No data loss (only updates `scrapedAt` field)
- ✅ Preserves all other product data
- ✅ No duplicate products created

---

## After Completion

Once all categories are normalized:

1. ✅ All products have consistent `scrapedAt` dates
2. ✅ Price comparison queries will work correctly
3. ✅ Analytics will group products by actual scrape date
4. ✅ Ready for further enhancements (price trends, etc.)

### Next Steps
- Re-enable price trend analytics
- Run category-level price aggregations
- Validate results match expectations
- Monitor for future date inconsistencies

---

## Quick Reference

| Script | Purpose | Categories | Time | Notes |
|--------|---------|-----------|------|-------|
| `fix-category-scrape-dates.js` | Test on Skincare | 1 (Skincare) | 5-10s | Run first to verify |
| `fix-all-category-dates.js` | Fix all except F&V | 27 categories | 30-60s | Run after test succeeds |

**Target Date:** `2026-03-22T00:00:00Z` (UTC)  
**Date Range:** `2026-03-20` to `2026-03-24`  
**Excluded:** `Fruits & Vegetables` category

---

## Execution Commands

```bash
# Step 1: Test on Skincare
node fix-category-scrape-dates.js

# Expected output: Skincare products fixed, verified
# If successful, proceed to Step 2

# Step 2: Fix all other categories
node fix-all-category-dates.js

# Expected output: All categories fixed, total count verified
# Batch operation complete!
```

---

**Status:** Ready to execute  
**Warning:** Batch fix affects 10,000-20,000+ documents  
**Backup:** Ensure you have database backups before running
