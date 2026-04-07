# Fix ALL Instamart Fruits & Vegetables Products

## What This Script Does

Finds **ALL** Instamart products with category "Fruits & Vegetables" and:
1. ✅ Extracts correct category from `categoryUrl`
2. ✅ Maps using `categories_with_urls.json`
3. ✅ Updates `category`, `officialCategory`, `officialSubCategory`
4. ✅ Generates detailed report

## Quick Start

### Step 1: Verify MongoDB is running
```bash
# Check if MongoDB is accessible
```

### Step 2: Run the fix script
```bash
cd d:\creatosaurus-intership\quick-commerce-scrappers\mainserver
node fix-category-mapping.js
```

## What Happens

```
🔍 Scan Database
   ↓
Find all products:
   • platform = "instamart"
   • category = "Fruits & Vegetables"
   ↓
✅ Extract correct categories from categoryUrl
   ↓
💾 Bulk update all products in database
   ↓
📊 Generate report with results
```

## Expected Output

```
📊 Summary:
  ✅ Fixed: [X] products
  ⏭️  Skipped: [Y] products (already correct / no URL)
  ❌ Errors: 0

📝 Sample Fixed Products:
  [1] Country Delight Buffalo Milk
      Category: "Fruits & Vegetables" → "Dairy, Bread & Eggs"
      SubCat: → "Milk"
      
  [2] Fresh Spinach
      Category: "Fruits & Vegetables" → "Fruits & Vegetables"
      SubCat: → "Leafy and Seasonings" (more specific)
      
  ... and more
```

## If It Fails

If you get database errors:
1. Check MongoDB is running: `mongod --version`
2. Check connection string in `.env`: `MONGODB_URI`
3. Try again: `node fix-category-mapping.js`

## Result

All Instamart Fruits & Vegetables products will be properly categorized:
- ✅ Dairy products → "Dairy & Breads"
- ✅ Leafy items → "Leafy and Seasonings"
- ✅ Fruits → "Fresh Fruits"
- ✅ All others → correct subcategory based on URL

**Run it now! 🚀**
