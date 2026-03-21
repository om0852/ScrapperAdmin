# Flipkart Minutes Server - Field Mapping Verification Report

## Current vs Required Field Mappings

| Field | Current Mapping | Required Path | Status | Action |
|-------|-----------------|----------------|--------|--------|
| **productName** | `titles.title` | `value.titles.title` | ✓ Correct | ✓ Keep |
| **productWeight** | `extractedQty \|\| subtitle` | `value.titles.subtitle` | ⚠️ INCORRECT | Fix - Use subtitle directly |
| **quantity** | `extractedQty \|\| "N/A"` | `value.maxOrderQuantityAllowed` | ❌ WRONG | Fix - Extract from max quantity |
| **productId** | `id` | `value.id` | ✓ Correct | ✓ Keep - DO NOT CHANGE |
| **productUrl** | `baseUrl`, `smartUrl`, or `/p/{id}` | `value.productUrl` | ✓ Correct | ✓ Keep |
| **currentPrice** | `finalPrice?.value` | `value.pricing.finalPrice.value` | ✓ Correct | ✓ Keep |
| **originalPrice** | MRP from `pricing.prices[]` | Find MRP in `pricing.prices[]` | ✓ Correct | ✓ Keep |
| **isAd** | `false` (hardcoded) | Check `xtraSaverCallout` \|\| `offerTags` | ❌ WRONG | Fix - Detect from xtraSaver |
| **inStock** | `isOutOfStock: !(data.availability?.displayState === 'IN_STOCK')` | `availability.displayState === "IN_STOCK"` | ❌ WRONG LOGIC & NAME | Fix - Use boolean `inStock` not `isOutOfStock` |
| **productImage** | `media.images[0].url` with placeholders | `value.media.images[0].url` | ✓ Correct | ✓ Keep |

---

## Issues Found

### 1. ❌ **productWeight Field** (Line ~943)
**Current:**
```javascript
productWeight: extractedQty || subtitle || "N/A"
```

**Issue:** Uses regex extraction for quantity, not direct subtitle extraction

**Should Be:**
```javascript
productWeight: subtitle || "N/A"
```

**Example:** Should extract "36 g" directly from `titles.subtitle`

---

### 2. ❌ **quantity Field** (Line ~943)
**Current:**
```javascript
quantity: extractedQty || "N/A"
```

**Issue:** Doesn't extract `maxOrderQuantityAllowed` from the API. This is the max order quantity (e.g., 15 units)

**Should Be:**
```javascript
quantity: data.maxOrderQuantityAllowed || "N/A"
```

**Example:** Should extract `15` from `value.maxOrderQuantityAllowed`

---

### 3. ❌ **isAd Field** (Line ~948)
**Current:**
```javascript
isAd: false  // Hardcoded always false!
```

**Issue:** Always returns false. Doesn't check for promotional items

**Should Be:**
```javascript
isAd: !!(data.xtraSaverCallout || (data.offerTags && data.offerTags.length > 0))
```

**Example:** Should detect when product has xtraSaver or offer tags

---

### 4. ❌ **isOutOfStock Field** (Line ~951)
**Current:**
```javascript
isOutOfStock: !(data.availability?.displayState === 'IN_STOCK' || !data.availability)
```

**Issues:**
- Field name is `isOutOfStock` but should be `inStock` (boolean true/false for stock availability)
- Logic is confusing with double negation
- Fallback `|| !data.availability` is incorrect

**Should Be:**
```javascript
inStock: data.availability?.displayState === 'IN_STOCK'  // Returns true if in stock, false if not
```

**Example:** 
- If stock status = "IN_STOCK" → `inStock: true`
- If stock status = "OUT_OF_STOCK" → `inStock: false`

---

## Mapping Comparison Table

### Before:
```javascript
{
  productId: "CHCEWXEHYHSEGYVD",           // ✓ Correct
  productName: "Cadbury Dairy Milk...",    // ✓ Correct
  productImage: "https://...",              // ✓ Correct
  productWeight: "36 g",                    // ⚠️ From regex (should be direct)
  quantity: "N/A",                          // ❌ Should be 15 (maxOrderQuantityAllowed)
  deliveryTime: "N/A",                      // ✓ Keep
  isAd: false,                              // ❌ Should be true if has offers
  rating: 0,                                // ✓ Keep
  currentPrice: 45,                         // ✓ Correct
  originalPrice: 49,                        // ✓ Correct
  discountPercentage: 8,                    // ✓ Correct
  isOutOfStock: false,                      // ❌ Should be inStock: true
  productUrl: "https://...",                // ✓ Correct
  platform: "flipkart_minutes"              // ✓ Keep
}
```

### After:
```javascript
{
  productId: "CHCEWXEHYHSEGYVD",           // ✓ Keep - DO NOT CHANGE
  productName: "Cadbury Dairy Milk...",    // ✓ Keep
  productImage: "https://...",              // ✓ Keep
  productWeight: "36 g",                    // ✓ Fix - Extract subtitle directly
  quantity: 15,                             // ✓ Fix - From maxOrderQuantityAllowed
  deliveryTime: "N/A",                      // ✓ Keep
  isAd: true,                               // ✓ Fix - Detect from xtraSaver/offerTags
  rating: 0,                                // ✓ Keep
  currentPrice: 45,                         // ✓ Keep
  originalPrice: 49,                        // ✓ Keep
  discountPercentage: 8,                    // ✓ Keep
  inStock: true,                            // ✓ Fix - Boolean for stock status
  productUrl: "https://...",                // ✓ Keep
  platform: "flipkart_minutes"              // ✓ Keep
}
```

---

## Required Code Changes

File: `flipkart_minutes/scraper_service.js`

**Location:** `extractProductData` function (around line 900-960)

### Change 1: productWeight
```javascript
// FROM:
productWeight: extractedQty || subtitle || "N/A",

// TO:
productWeight: subtitle || "N/A",
```

### Change 2: quantity
```javascript
// FROM:
quantity: extractedQty || "N/A",

// TO:
quantity: data.maxOrderQuantityAllowed || "N/A",
```

### Change 3: isAd
```javascript
// FROM:
isAd: false,

// TO:
isAd: !!(data.xtraSaverCallout || (data.offerTags && data.offerTags.length > 0)),
```

### Change 4: Stock Status (Rename from isOutOfStock to inStock)
```javascript
// FROM:
isOutOfStock: !(data.availability?.displayState === 'IN_STOCK' || !data.availability),

// TO:
inStock: data.availability?.displayState === 'IN_STOCK',
```

---

## Impact Analysis

### Fields NOT Changed (As Requested):
- ✓ `productId` - Remains unchanged 
- ✓ `productName` - Already correct
- ✓ `productImage` - Already correct
- ✓ `currentPrice` - Already correct
- ✓ `originalPrice` - Already correct
- ✓ `productUrl` - Already correct
- ✓ `platform`, `deliveryTime`, `rating`, `categoryName` - Keep as is

### Fields to be Fixed:
- `productWeight` - Simplify extraction
- `quantity` - Extract maxOrderQuantityAllowed
- `isAd` - Detect promotional items
- `isOutOfStock` → `inStock` - Rename and fix logic

---

## Verification Examples with Actual Data

**Example Product from API Response:**
```javascript
// API Response Data:
{
  value: {
    id: "CHCEWXEHYHSEGYVD",
    titles: {
      title: "Cadbury Dairy Milk Fruit and Nut Chocolate Bars",
      subtitle: "36 g"
    },
    maxOrderQuantityAllowed: 15,
    pricing: {
      finalPrice: { value: 45 },
      prices: [
        { priceType: "MRP", value: 49 },
        { priceType: "FSP", value: 45 }
      ],
      totalDiscount: 8
    },
    media: {
      images: [
        { url: "https://rukminim1.flixcart.com/image/{@width}/{@height}/xif0q/chocolate/u/g/a/-original-imah3t6v4e7drzqz.jpeg?q={@quality}" }
      ]
    },
    availability: {
      displayState: "IN_STOCK"
    },
    xtraSaverCallout: { /* ... */ },
    offerTags: [
      { offerTag: "Bank Offer", offerType: "BANK_OFFER" }
    ]
  }
}
```

**Expected Extracted Values:**
- productWeight: "36 g" ← From `titles.subtitle`
- quantity: 15 ← From `maxOrderQuantityAllowed`
- isAd: true ← Has `xtraSaverCallout` and `offerTags`
- inStock: true ← `displayState === "IN_STOCK"`
