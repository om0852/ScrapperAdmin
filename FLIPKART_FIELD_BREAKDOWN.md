# Flipkart API - Detailed Field Analysis

## Analysis of Your API Response

Based on the Flipkart Hyperlocal API response file, here's exactly how to extract each field you requested:

---

## 1. Product Name
**Location:** `productInfo.value.titles.title`

```javascript
// Extracted Value
"Cadbury Dairy Milk Fruit and Nut Chocolate Bars"

// Code
const productName = productInfo.value.titles.title;

// Alternatives (use .title as primary)
productInfo.value.titles.newTitle     // "Dairy Milk Fruit and Nut Chocolate Bars"
productInfo.value.titles.superTitle   // "Cadbury" (brand name)
```

---

## 2. Product Weight
**Location:** `productInfo.value.titles.subtitle`

```javascript
// Extracted Value
"36 g"

// Code
const productWeight = productInfo.value.titles.subtitle;

// All available weights (variants)
const weights = productInfo.value.productSwatch.attributeOptions[0];
// Returns: [{ value: "36 g" }, { value: "75 g" }]

// Get all weight variants as array
const allWeights = productInfo.value.productSwatch
  .attributeOptions[0]
  .map(opt => opt.value);
// ["36 g", "75 g"]
```

---

## 3. Quantity
**Location:** `productInfo.value.maxOrderQuantityAllowed`

```javascript
// Extracted Value
15

// Code
const quantity = productInfo.value.maxOrderQuantityAllowed;

// This is the MAXIMUM order quantity
// User can buy 1-15 units at a time
```

---

## 4. Product ID
**Location:** `productInfo.value.id`

```javascript
// Extracted Value (Primary)
"CHCEWXEHYHSEGYVD"

// Code
const productId = productInfo.value.id;

// Related IDs
productInfo.value.itemId        // "ITMFFMCYKFARZHFV"
productInfo.value.listingId     // "LSTCHCEWXEHYHSEGYVDDQTVWY"

// All three are important:
// - id: Product identifier
// - itemId: Item reference
// - listingId: Listing reference (marketplace specific)
```

---

## 5. Product URL
**Location:** `productInfo.value.productUrl` or `productInfo.value.smartUrl`

```javascript
// Extracted Values

// Relative URL (needs domain)
const productUrl = productInfo.value.productUrl;
// "/cadbury-dairy-milk-fruit-nut-chocolate-bars/p/itmffmcykfarzhfv?pid=CHCEWXEHYHSEGYVD&lid=LSTCHCEWXEHYHSEGYVDDQTVWY&marketplace=HYPERLOCAL"

// Full Smart URL (ready to use)
const smartUrl = productInfo.value.smartUrl;
// "https://dl.flipkart.com/dl/cadbury-dairy-milk-fruit-nut-chocolate-bars/p/itmffmcykfarzhfv?pid=CHCEWXEHYHSEGYVD"

// Complete URL for web
const fullUrl = `https://www.flipkart.com${productInfo.value.productUrl}`;

// Code Example
function getProductUrl(productInfo, useSmart = false) {
  if (useSmart) {
    return productInfo.value.smartUrl; // Direct download link
  }
  return `https://www.flipkart.com${productInfo.value.productUrl}`;
}
```

---

## 6. Current Price
**Location:** `productInfo.value.pricing.finalPrice.value`

```javascript
// Extracted Value
45

// Code - Method 1 (Direct)
const currentPrice = productInfo.value.pricing.finalPrice.value;

// Code - Method 2 (From prices array - more reliable)
const fspPrice = productInfo.value.pricing.prices.find(p => p.priceType === "FSP");
const currentPrice2 = fspPrice.value; // 45

// Additional pricing info
productInfo.value.pricing.finalPrice.decimalValue  // "45.00"
productInfo.value.pricing.finalPrice.currency      // "INR"

// Formatted price
const formatted = `₹${currentPrice}`;  // "₹45"
```

---

## 7. Original Price
**Location:** `productInfo.value.pricing.prices[MRP]`

```javascript
// Extracted Value
49

// Code - Method 1 (Recommended)
const mrpPrice = productInfo.value.pricing.prices.find(p => p.priceType === "MRP");
const originalPrice = mrpPrice.value; // 49

// Code - Method 2 (From tracking)
const originalPrice2 = productInfo.value.productAction.tracking.mrp; // "49"

// Additional info
mrpPrice.decimalValue  // "49.00"
mrpPrice.currency      // "INR"

// Calculate savings
const savings = originalPrice - currentPrice;  // 4
const discountPercent = productInfo.value.pricing.totalDiscount; // 8%
```

---

## 8. Is Advertisement
**Location:** Check `xtraSaverCallout` OR `offerTags`

```javascript
// Extracted Value
true

// Code - Method 1 (Check Xtra Saver)
const hasXtraSaver = !!productInfo.value.xtraSaverCallout;

// Code - Method 2 (Check Offer Tags)
const hasOffers = productInfo.value.offerTags?.length > 0;

// Code - Combined Check
const isAd = hasXtraSaver || hasOffers;

// View offers
const offers = productInfo.value.offerTags;
// [
//   {
//     offerTag: "Bank Offer",
//     offerType: "BANK_OFFER",
//     detailTag: null
//   }
// ]

// Function to check if ad
function isAdvertisement(productInfo) {
  const hasXtraSaver = !!productInfo.value.xtraSaverCallout;
  const hasOffers = productInfo.value.offerTags?.length > 0;
  return hasXtraSaver || hasOffers;
}
```

---

## 9. Is Out of Stock
**Location:** `productInfo.value.availability.displayState`

```javascript
// Extracted Values
"IN_STOCK" (or "OUT_OF_STOCK")

// Code - Primary Method
const isOutOfStock = productInfo.value.availability.displayState !== "IN_STOCK";

// Code - Alternative Methods
const method2 = productInfo.value.availability.intent !== "positive";
const method3 = !productInfo.value.buyability.intent === "positive";
const method4 = !productInfo.value.productAction.value.enabled;

// Complete availability check
function checkAvailability(productInfo) {
  const status = productInfo.value.availability;
  return {
    displayState: status.displayState,        // "IN_STOCK" || "OUT_OF_STOCK"
    intent: status.intent,                    // "positive" || "negative"
    isAvailable: status.displayState === "IN_STOCK",
    canPurchase: productInfo.value.buyability.intent === "positive"
  };
}

// Check stock from swatch variant
const variantInStock = productInfo.value.productSwatch.products[productId].available; // true/false
```

---

## 10. Product Image
**Location:** `productInfo.value.media.images[0].url`

```javascript
// Extracted Value (with placeholders)
"https://rukminim1.flixcart.com/image/{@width}/{@height}/xif0q/chocolate/u/g/a/-original-imah3t6v4e7drzqz.jpeg?q={@quality}"

// All images
const allImages = productInfo.value.media.images;
// Array of 9+ images

// Format image for use
function formatImage(url, width = 200, height = 200, quality = 80) {
  return url
    .replace('{@width}', width)
    .replace('{@height}', height)
    .replace('{@quality}', quality);
}

// Get primary image
const primaryImage = productInfo.value.media.images[0].url;
const formattedImage = formatImage(primaryImage, 300, 300, 90);
// "https://rukminim1.flixcart.com/image/300/300/xif0q/chocolate/u/g/a/-original-imah3t6v4e7drzqz.jpeg?q=90"

// Get all images formatted
const galleryImages = productInfo.value.media.images
  .map(img => formatImage(img.url, 400, 400));

// Responsive images
const imagesBySize = {
  thumbnail: formatImage(primaryImage, 100, 100),
  small:     formatImage(primaryImage, 200, 200),
  medium:    formatImage(primaryImage, 400, 400),
  large:     formatImage(primaryImage, 600, 600),
};
```

---

## Complete Data Extraction Function

```javascript
/**
 * Complete extraction of all 10 requested fields
 */
function extractCompleteProduct(productInfo) {
  const value = productInfo.value;
  const pricing = value.pricing;
  const availability = value.availability;
  
  // Get original price
  const mrpPrice = pricing.prices.find(p => p.priceType === "MRP");
  
  // Get current price
  const fspPrice = pricing.prices.find(p => p.priceType === "FSP") || pricing.finalPrice;
  
  // Format image
  const formatImage = (url, w = 250, h = 250, q = 80) =>
    url?.replace('{@width}', w).replace('{@height}', h).replace('{@quality}', q);
  
  return {
    // 1. Product Name
    productName: value.titles.title,
    
    // 2. Product Weight
    productWeight: value.titles.subtitle,
    
    // 3. Quantity
    quantity: value.maxOrderQuantityAllowed,
    
    // 4. Product ID
    productId: value.id,
    
    // 5. Product URL
    productUrl: `https://www.flipkart.com${value.productUrl}`,
    smartUrl: value.smartUrl,
    
    // 6. Current Price
    currentPrice: fspPrice.value,
    
    // 7. Original Price
    originalPrice: mrpPrice?.value,
    
    // 8. Is Advertisement
    isAd: !!value.xtraSaverCallout || value.offerTags?.length > 0,
    
    // 9. Is Out of Stock
    isOutOfStock: availability.displayState !== "IN_STOCK",
    
    // 10. Product Image
    productImage: formatImage(value.media.images[0].url),
    allImages: value.media.images.map(img => formatImage(img.url)),
    
    // Additional useful fields
    brand: value.productBrand,
    discount: pricing.totalDiscount,
    currency: "INR",
    availability: availability.displayState,
  };
}

// Usage
const product = extractCompleteProduct(productInfo);
console.log(product);
```

---

## Field Extraction Summary Table

| # | Field | Path | Type | Example |
|---|-------|------|------|---------|
| 1 | productName | `value.titles.title` | String | "Cadbury Dairy Milk..." |
| 2 | productWeight | `value.titles.subtitle` | String | "36 g" |
| 3 | quantity | `value.maxOrderQuantityAllowed` | Number | 15 |
| 4 | productId | `value.id` | String | "CHCEWXEHYHSEGYVD" |
| 5 | productUrl | `value.productUrl` | String | "/cadbury-dairy.../" |
| 6 | currentPrice | `value.pricing.finalPrice.value` | Number | 45 |
| 7 | originalPrice | `value.pricing.prices[MRP].value` | Number | 49 |
| 8 | isAd | `value.xtraSaverCallout \|\| offerTags` | Boolean | true |
| 9 | isOutOfStock | `value.availability.displayState` | String | "IN_STOCK" |
| 10 | productImage | `value.media.images[0].url` | String | "https://rukminim1..." |

---

## Data Type Reference

```javascript
{
  productName: String,           // "Cadbury Dairy Milk Fruit and Nut Chocolate Bars"
  productWeight: String,         // "36 g"
  quantity: Number,              // 15
  productId: String,             // "CHCEWXEHYHSEGYVD"
  productUrl: String,            // "https://www.flipkart.com/cadbury-..."
  currentPrice: Number,          // 45
  originalPrice: Number,         // 49
  isAd: Boolean,                 // true or false
  isOutOfStock: Boolean,         // true or false
  productImage: String,          // "https://rukminim1.flixcart.com/image/..."
}
```
