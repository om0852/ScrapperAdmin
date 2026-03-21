# Flipkart Hyperlocal API Response - Data Extraction Guide

## API Response Structure Overview

**URL Path to Products:** `RESPONSE.slots[].widget.data.products[]`

Each product object contains nested data. Here's a complete guide to extract each field:

---

## Field Extraction Guide

### 1. **Product Name** (Multiple variations available)
```javascript
// Best approach - Use the full title
productInfo.value.titles.title
// "Cadbury Dairy Milk Fruit and Nut Chocolate Bars"

// Alternative names available:
productInfo.value.titles.newTitle           // "Dairy Milk Fruit and Nut Chocolate Bars"
productInfo.value.titles.superTitle         // "Cadbury"
productInfo.value.titles.subtitle           // "36 g" (weight/quantity variant)
```

**Path:** `productInfo.value.titles.title`

---

### 2. **Product Weight/Quantity** 
```javascript
// Primary weight indicator
productInfo.value.titles.subtitle
// "36 g"

// Or from swatch options (all variants available)
productInfo.value.productSwatch.attributeOptions[0]
// [{ value: "36 g" }, { value: "75 g" }]

// Also in key specs
productInfo.value.keySpecs
// ["Milk Chocolate", "Plain Flavor"]

// In nested swatch products (for specific variant)
productInfo.value.productSwatch.products[productId].titles.subtitle
// "36 g"
```

**Primary Path:** `productInfo.value.titles.subtitle` (main variant weight)
**All Variants Path:** `productInfo.value.productSwatch.attributeOptions[0][]`

---

### 3. **Quantity Available** (maxOrderQuantityAllowed)
```javascript
productInfo.value.maxOrderQuantityAllowed
// 15 (maximum quantity user can order)
```

**Path:** `productInfo.value.maxOrderQuantityAllowed`

---

### 4. **Product ID** (Multiple types)
```javascript
// Primary product ID
productInfo.value.id
// "CHCEWXEHYHSEGYVD"

// Item ID
productInfo.value.itemId
// "ITMFFMCYKFARZHFV"

// Listing ID
productInfo.value.listingId
// "LSTCHCEWXEHYHSEGYVDDQTVWY"

// From tracking data
productInfo.tracking.productId
// "CHCEWXEHYHSEGYVD"
```

**Primary Path:** `productInfo.value.id` (use this as main Product ID)
**Secondary:** `productInfo.value.itemId` (for Flipkart's internal reference)

---

### 5. **Product URL**
```javascript
// Relative product page URL
productInfo.value.productUrl
// "/cadbury-dairy-milk-fruit-nut-chocolate-bars/p/itmffmcykfarzhfv?pid=CHCEWXEHYHSEGYVD&lid=LSTCHCEWXEHYHSEGYVDDQTVWY&marketplace=HYPERLOCAL"

// Full Smartlink (direct download link)
productInfo.value.smartUrl
// "https://dl.flipkart.com/dl/cadbury-dairy-milk-fruit-nut-chocolate-bars/p/itmffmcykfarzhfv?pid=CHCEWXEHYHSEGYVD"

// From action URL
productInfo.action.originalUrl
// "/cadbury-dairy-milk-fruit-nut-chocolate-bars/p/itmffmcykfarzhfv?pid=CHCEWXEHYHSEGYVD&..."

// Quick view URL
productInfo.value.productSwatch.products[productId].quickViewUrl
// "/quick-view?pid=CHCEWXEHYHSEGYVD&lid=LSTCHCEWXEHYHSEGYVDDQTVWY"
```

**For Web:** `productInfo.value.productUrl` (relative URL - needs domain prepended)
**For Full URL:** `productInfo.value.smartUrl`

---

### 6. **Current Price** (Selling Price / FSP)
```javascript
// Final selling price
productInfo.value.pricing.finalPrice.value
// 45 (in INR)

// From prices array (more reliable)
// Find price with priceType === "FSP"
productInfo.value.pricing.prices.find(p => p.priceType === "FSP").value
// 45

// Alternative - from tracking
productInfo.value.productAction.tracking.fsp
// "45"

// In decimal format
productInfo.value.pricing.finalPrice.decimalValue
// "45.00"
```

**Primary Path:** `productInfo.value.pricing.finalPrice.value`
**Decimal Path:** `productInfo.value.pricing.finalPrice.decimalValue`

---

### 7. **Original Price** (MRP - Maximum Retail Price)
```javascript
// Maximum Retail Price
productInfo.value.pricing.prices.find(p => p.priceType === "MRP").value
// 49

// In decimal format
productInfo.value.pricing.prices.find(p => p.priceType === "MRP").decimalValue
// "49.00"

// Alternative (from tracking)
productInfo.value.productAction.tracking.mrp
// "49"
```

**Primary Path:** `productInfo.value.pricing.prices.find(p => p.priceType === "MRP").value`

---

### 8. **Is Advertisement** (Ad Indicator)
```javascript
// Check offer tags for ad indicators
productInfo.value.offerTags
// [{ offerTag: "Bank Offer", offerType: "BANK_OFFER" }]

// Check for ad-specific identifiers
productInfo.value.xtraSaverCallout  // Indicates it's part of promotional

// Check product action availability
productInfo.value.productAction.value.actionType
// "ADD_TO_BASKET" (normal product)

// Check if it's in swatch (indicating variant/promotional)
"productSwatch" in productInfo.value
// true = has swatches (normal product display)

// Check for promotional callouts
productInfo.value.productCardTagDetails  // Contains promotional tags
```

**Recommendation:** Check if product has `xtraSaverCallout` or filter by `offerTags` to identify promotional products

---

### 9. **Is Out of Stock**
```javascript
// Stock status from availability
productInfo.value.availability.displayState
// "IN_STOCK"  || "OUT_OF_STOCK"

// More detailed check
productInfo.value.availability.intent
// "positive" (in stock) || "negative" (out of stock)

// Buyability indicator
productInfo.value.buyability.intent
// "positive" (can purchase) || "negative" (cannot purchase)

// Product action enabled check
productInfo.value.productAction.value.enabled
// true (purchasable) || false (not purchasable)

// In swatch products (for variants)
productInfo.value.productSwatch.products[productId].available
// true || false
```

**Primary Path:** `productInfo.value.availability.displayState === "OUT_OF_STOCK"`
**Better Check:** `productInfo.value.availability.displayState !== "IN_STOCK"`

---

### 10. **Product Images**
```javascript
// Array of image URLs
productInfo.value.media.images
// [
//   {
//     url: "https://rukminim1.flixcart.com/image/{@width}/{@height}/xif0q/chocolate/u/g/a/-original-imah3t6v4e7drzqz.jpeg?q={@quality}",
//     aspectRatio: null,
//     height: null,
//     width: null
//   },
//   ... more images
// ]

// Get first/primary image
productInfo.value.media.images[0].url
// "https://rukminim1.flixcart.com/image/{@width}/{@height}/xif0q/chocolate/u/g/a/-original-imah3t6v4e7drzqz.jpeg?q={@quality}"

// Format images with specific dimensions (replace placeholders)
// {@width} and {@height} are placeholders
// {@quality} is quality placeholder

// For specific dimensions (e.g., 200x200):
productInfo.value.media.images[0].url
  .replace('{@width}', '200')
  .replace('{@height}', '200')
  .replace('{@quality}', '80')

// Result: "https://rukminim1.flixcart.com/image/200/200/xif0q/chocolate/u/g/a/-original-imah3t6v4e7drzqz.jpeg?q=80"

// All images (for carousel/gallery)
productInfo.value.media.images.map(img => img.url)

// From swatch variant
productInfo.value.productSwatch.products[productId].images[0].url
```

**Primary Path:** `productInfo.value.media.images[0].url`
**All Images:** `productInfo.value.media.images.map(img => img.url)`

---

## Complete Extraction Example

```javascript
const extractProductData = (productInfo) => {
  const product = productInfo.value;
  const pricing = product.pricing;
  
  return {
    productName: product.titles.title,
    productWeight: product.titles.subtitle,
    quantityAllowed: product.maxOrderQuantityAllowed,
    productId: product.id,
    itemId: product.itemId,
    listingId: product.listingId,
    productUrl: product.productUrl,
    smartUrl: product.smartUrl,
    currentPrice: pricing.finalPrice.value,
    originalPrice: pricing.prices.find(p => p.priceType === "MRP")?.value,
    discount: pricing.totalDiscount,
    isOutOfStock: product.availability.displayState !== "IN_STOCK",
    productImage: product.media.images[0].url,
    allImages: product.media.images.map(img => img.url),
    brand: product.productBrand,
    availability: product.availability.displayState,
    isAd: !!product.xtraSaverCallout || product.offerTags?.length > 0,
    offerTags: product.offerTags,
    currency: "INR",
    shopId: productInfo.action.params.shopId?.[0],
    keySpecs: product.keySpecs
  };
};
```

---

## Important Notes

1. **Image URLs have placeholders**: Replace `{@width}`, `{@height}`, and `{@quality}` with actual values
2. **Product swatches**: If product has variants (different sizes/colors), they're in `productInfo.value.productSwatch.products`
3. **Multiple product variants** in `productSwatch.attributeOptions` show all available sizes
4. **Pricing**: Always check discount percentage to get the actual discount
5. **Out of Stock**: Check `availability.displayState` - if not "IN_STOCK", product is unavailable
6. **URLs**: Product URL is relative - prepend `https://www.flipkart.com` for full URL
7. **Ad indicator**: Products with `xtraSaverCallout` or multiple `offerTags` are promotional items

---

## API Path Summary

```
RESPONSE
└── slots[]
    └── widget.data.products[]
        └── productInfo
            ├── value
            │   ├── titles (product names and weight)
            │   ├── id (productId)
            │   ├── itemId
            │   ├── listingId
            │   ├── productUrl
            │   ├── media.images[] (product images)
            │   ├── pricing (currentPrice, originalPrice)
            │   ├── availability (stock status)
            │   ├── maxOrderQuantityAllowed
            │   ├── offerTags (ad indicators)
            │   ├── xtraSaverCallout (promotional indicator)
            │   └── productSwatch (variants)
            ├── action.originalUrl
            └── tracking (tracking data)
```
