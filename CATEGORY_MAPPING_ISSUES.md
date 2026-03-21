# Category Mapping Analysis - Instamart Scraper

## 🔴 CRITICAL ISSUE FOUND

The category, officialCategory, and officialSubCategory mapping is **BROKEN**.

---

## Current Mapping (WRONG) ❌

### In `server.js` (Line 703):
```javascript
const officialCategory = 'Unknown';  // ❌ HARDCODED!
const officialSubCategory = 'N/A';   // ❌ HARDCODED!
```

And it's passed to transformInstamartProduct as:
```javascript
return transformInstamartProduct(
    product,
    productCategoryUrl,
    'Unknown',        // ❌ ALWAYS 'Unknown'
    'N/A',           // ❌ ALWAYS 'N/A'
    pincode,
    index + 1,
    categoryMapping
);
```

---

## What's AVAILABLE in API Response 📊

Looking at the dump JSON, each product has multiple category fields in `variations[0]`:

### Example 1: Drumstick Leaves
```json
{
  "displayName": "Drumstick Leaves (Nugge Soppu)",
  "variations": [
    {
      "category": "Leafy and Seasonings",        // ← Available!
      "subCategoryType": "Leafy",                // ← Available!
      "superCategory": "Fruits and Vegetables"   // ← Available!
    }
  ]
}
```

### Example 2: Sambar Onion
```json
{
  "displayName": "Sambar Onion (Sambar Eerulli)",
  "variations": [
    {
      "category": "Vegetables",                  // ← Available!
      "subCategoryType": "Sambar Onion",        // ← Available!
      "superCategory": "Fruits and Vegetables"   // ← Available!
    }
  ]
}
```

### Example 3: Organic Ginger
```json
{
  "displayName": "Organic Certified Ginger (Shunti)",
  "variations": [
    {
      "category": "Organic",                      // ← Available!
      "subCategoryType": "Organic Ginger",       // ← Available!
      "superCategory": "Fruits and Vegetables"   // ← Available!
    }
  ]
}
```

### Example 4: Lady's Finger
```json
{
  "displayName": "Lady's Finger (Bendekaayi)",
  "variations": [
    {
      "category": "Vegetables",                  // ← Available!
      "subCategoryType": "Lady's Finger",       // ← Available!
      "superCategory": "Fruits and Vegetables"   // ← Available!
    }
  ]
}
```

---

## Category Hierarchy Found in API

Based on the dump analysis, the structure is:

```
superCategory (Top Level)
    └── category (Mid Level)
           └── subCategoryType (Product Type)
```

### Examples:
```
Fruits and Vegetables
    └── Leafy and Seasonings
        └── Leafy
        └── Spinach
        └── Ginger
        └── Thai (Thai Ginger)
    
    └── Vegetables
        └── Sambar Onion
        └── Peeled
        └── Lady's Finger
        └── Green Peas
        
    └── Organic
        └── Organic Ginger
```

---

## Current Wrong Output ❌

When a product is scraped, the current code produces:

```json
{
  "productName": "Drumstick Leaves (Nugge Soppu)",
  "category": "N/A",              // ❌ WRONG! Should be "Fruits and Vegetables"
  "officialCategory": "Unknown",  // ❌ WRONG! Should be "Leafy and Seasonings"
  "officialSubCategory": "N/A"    // ❌ WRONG! Should be "Leafy"
}
```

---

## What It SHOULD Be ✅

```json
{
  "productName": "Drumstick Leaves (Nugge Soppu)",
  "category": "Fruits and Vegetables",      // ✅ From superCategory
  "officialCategory": "Leafy and Seasonings", // ✅ From category
  "officialSubCategory": "Leafy"              // ✅ From subCategoryType
}
```

---

## Code Flow Problem

### 1. Raw Product Data Processing (`server.js` Line ~350)
```javascript
function processCapturedJson(json) {
    // ... finds products ...
    return rawProducts.map(item => {
        const variant = item.variations[0];  // Gets first variation
        
        // ❌ IS NOT CAPTURING CATEGORY INFO HERE!
        return {
            productId: pid,
            productName: name,
            // ... missing category fields ...
            productWeight: weight,
            // ...
        };
    });
}
```

**Problem:** The raw product processing doesn't extract `category`, `subCategoryType`, or `superCategory` from `variations[0]`.

### 2. Transformation Step (`server.js` Line ~703)
```javascript
const officialCategory = 'Unknown';  // ❌ No source!
const officialSubCategory = 'N/A';   // ❌ No source!

return transformInstamartProduct(
    product,
    productCategoryUrl,
    officialCategory,      // ❌ Always 'Unknown'
    officialSubCategory,   // ❌ Always 'N/A'
    pincode,
    index + 1,
    categoryMapping
);
```

**Problem:** Parameters passed are hardcoded instead of coming from the product data.

### 3. Transform Function (`transform_response_format.js` Line ~24)
```javascript
export function transformInstamartProduct(product, categoryUrl, categoryName, subCategoryName, pincode, rank, categoryMapping = null) {
    let masterCategory = 'N/A';
    let officialCategory = 'N/A';
    let officialSubCategory = 'N/A';

    if (categoryMapping && categoryMapping.categoryMappingFound) {
        masterCategory = categoryMapping.masterCategory || 'N/A';
        officialCategory = categoryMapping.officialCategory || 'N/A';
        officialSubCategory = categoryMapping.officialSubCategory || 'N/A';
    } else {
        // Fallback only uses parameters (which are 'Unknown' and 'N/A')
        officialCategory = categoryName || 'N/A';
        officialSubCategory = subCategoryName || 'N/A';
    }
}
```

**Problem:** Function only uses the hardcoded values or enrichment mapping, never the API data.

---

## Complete Data Mapping Summary

### Categories in Raw API Response

| Field | Location | Example Value | Currently Used? |
|-------|----------|----------------|-----------------|
| **superCategory** | `item.variations[0].superCategory` | `"Fruits and Vegetables"` | ❌ NO |
| **category** | `item.variations[0].category` | `"Leafy and Seasonings"`, `"Vegetables"`, `"Organic"` | ❌ NO |
| **subCategoryType** | `item.variations[0].subCategoryType` | `"Leafy"`, `"Ginger"`, `"Lady's Finger"` | ❌ NO |

### Where They Should Go

```
API superCategory → transformInstamartProduct "masterCategory" param
                 → Output: product.category

API category → transformInstamartProduct "categoryName" param
            → Output: product.officialCategory

API subCategoryType → transformInstamartProduct "subCategoryName" param
                   → Output: product.officialSubCategory
```

---

## All Products in Dump with Their Categories

| Product Name | superCategory | category | subCategoryType |
|--------------|---------------|----------|-----------------|
| Drumstick Leaves | Fruits and Vegetables | Leafy and Seasonings | Leafy |
| Spinach & Coriander Leaves | Fruits and Vegetables | Leafy and Seasonings | Spinach |
| Chandramukhi Potato | Fruits and Vegetables | Vegetables | (varies) |
| Organic Certified Lady's Finger | Fruits and Vegetables | Vegetables | Lady's Finger |
| Baby Lady's Finger | Fruits and Vegetables | Vegetables | Lady's Finger |
| Lady's Finger | Fruits and Vegetables | Vegetables | Lady's Finger |
| Green Peas | Fruits and Vegetables | Vegetables | Green Peas |
| Organic Certified Ginger | Fruits and Vegetables | Organic | Organic Ginger |
| Ginger | Fruits and Vegetables | Leafy and Seasonings | Ginger |
| Thai Ginger | Fruits and Vegetables | Leafy and Seasonings | Thai |
| Sambar Onion | Fruits and Vegetables | Vegetables | Sambar Onion |
| Peeled Sambhar Onion | Fruits and Vegetables | Vegetables | Peeled |

---

## Impact of This Bug

### Current Bad Output Example:
```json
{
  "productName": "Organic Certified Ginger (Shunti)",
  "category": "N/A",
  "categoryUrl": "https://www.swiggy.com/...",
  "officialCategory": "Unknown",
  "officialSubCategory": "N/A",
  "currentPrice": "89",
  "originalPrice": "99"
}
```

### Correct Output Should Be:
```json
{
  "productName": "Organic Certified Ginger (Shunti)",
  "category": "Fruits and Vegetables",
  "categoryUrl": "https://www.swiggy.com/...",
  "officialCategory": "Organic",
  "officialSubCategory": "Organic Ginger",
  "currentPrice": "89",
  "originalPrice": "99"
}
```

---

## What Needs to be Fixed

1. **Extract category fields in `processCapturedJson()`** - Add `superCategory`, `category`, and `subCategoryType` to raw product object

2. **Pass category fields to `transformInstamartProduct()`** - Don't hardcode 'Unknown' and 'N/A', use actual values from product data

3. **Update fallback in `transformInstamartProduct()`** - Use the product's category fields if categoryMapping is unavailable

---
