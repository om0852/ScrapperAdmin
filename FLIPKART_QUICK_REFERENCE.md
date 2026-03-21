# Flipkart API Extraction - Quick Reference

## 🔗 Field Path Cheat Sheet

| Field | JSON Path | Example |
|-------|-----------|---------|
| **productName** | `productInfo.value.titles.title` | "Cadbury Dairy Milk Fruit and Nut Chocolate Bars" |
| **productWeight** | `productInfo.value.titles.subtitle` | "36 g" |
| **quantity** | `productInfo.value.maxOrderQuantityAllowed` | 15 |
| **productId** | `productInfo.value.id` | "CHCEWXEHYHSEGYVD" |
| **itemId** | `productInfo.value.itemId` | "ITMFFMCYKFARZHFV" |
| **listingId** | `productInfo.value.listingId` | "LSTCHCEWXEHYHSEGYVDDQTVWY" |
| **productUrl** | `productInfo.value.productUrl` | `/cadbury-dairy-milk-fruit-nut-chocolate-bars/...` |
| **smartUrl** | `productInfo.value.smartUrl` | `https://dl.flipkart.com/dl/cadbury-dairy-milk-...` |
| **currentPrice** | `productInfo.value.pricing.finalPrice.value` | 45 |
| **originalPrice** | `productInfo.value.pricing.prices[MRP].value` | 49 |
| **discount%** | `productInfo.value.pricing.totalDiscount` | 8 |
| **isOutOfStock** | `availability.displayState !== "IN_STOCK"` | false |
| **stockStatus** | `productInfo.value.availability.displayState` | "IN_STOCK" |
| **isAd** | `!! xtraSaverCallout \|\| offerTags.length` | true/false |
| **productImage** | `productInfo.value.media.images[0].url` | `https://rukminim1.flixcart.com/image/{@width}...` |
| **allImages[] ** | `productInfo.value.media.images[].url` | Array of image URLs |
| **brand** | `productInfo.value.productBrand` | "Cadbury" |
| **category** | `productInfo.value.analyticsData.category` | "Gourmet" |
| **keySpecs** | `productInfo.value.keySpecs` | ["Milk Chocolate", "Plain Flavor"] |

---

## 🚀 Quick Code Snippets

### Get Single Product Data
```javascript
const product = productInfo.value;
const data = {
  productId: product.id,
  name: product.titles.title,
  weight: product.titles.subtitle,
  price: product.pricing.finalPrice.value,
  image: product.media.images[0].url,
  inStock: product.availability.displayState === "IN_STOCK"
};
```

### Get Original & Current Price
```javascript
const prices = productInfo.value.pricing.prices;
const original = prices.find(p => p.priceType === "MRP")?.value;
const current = prices.find(p => p.priceType === "FSP")?.value;
const discount = productInfo.value.pricing.totalDiscount;
```

### Check Stock Status
```javascript
const isInStock = productInfo.value.availability.displayState === "IN_STOCK";
const canBuy = productInfo.value.buyability.intent === "positive";
```

### Check if Advertisement
```javascript
const isAd = !!productInfo.value.xtraSaverCallout || 
             productInfo.value.offerTags?.length > 0;
```

### Format Image URL
```javascript
const url = productInfo.value.media.images[0].url;
const formatted = url
  .replace('{@width}', '200')
  .replace('{@height}', '200')
  .replace('{@quality}', '80');
```

### Get All Product Variants
```javascript
const allVariants = Object.entries(
  productInfo.value.productSwatch.products
).map(([id, variant]) => ({
  id: id,
  weight: variant.titles?.subtitle,
  price: variant.pricing?.prices?.find(p => p.priceType === "FSP")?.value,
  available: variant.available
}));
```

---

## 📍 Navigation Path

```
RESPONSE.slots[0]
  └─ widget.data.products[0]
      └─ productInfo
          ├─ value          ← Main product data
          ├─ action         ← Navigation action
          ├─ tracking       ← Tracking data
          └─ metaData
```

---

## ⚠️ Important Notes

1. **Image URLs**: Replace `{@width}`, `{@height}`, `{@quality}` with actual values
   - Example: `https://rukminim1.flixcart.com/image/200/200/xif0q/...?q=80`

2. **Product URL**: Relative path - prepend `https://www.flipkart.com` for full URL

3. **Quantity Variants**: Check `productSwatch.attributeOptions[0]` for size options
   - Example: `[{ value: "36 g" }, { value: "75 g" }]`

4. **Stock Status**: Always prefer `availability.displayState !== "IN_STOCK"` check

5. **Out of Stock Detection**:
   - Method 1: `displayState !== "IN_STOCK"`
   - Method 2: `buyability.intent !== "positive"`
   - Method 3: `productAction.value.enabled === false`

6. **Promotional Products**: Look for `xtraSaverCallout` or `offerTags`

7. **Currency**: All prices are in INR (₹)

---

## 🔄 Full Response Structure

```
{
  CACHE_INVALIDATION_TTL: "0",
  META_INFO: {...},
  REQUEST: null,
  REQUEST-ID: "28b42509-6c3b-4c40-b9b4-fefc896c2539",
  RESPONSE: {
    pageData: {...},
    slots: [
      {
        widget: {
          data: {
            products: [
              {
                productInfo: {
                  value: {
                    id,
                    itemId,
                    listingId,
                    titles: { title, subtitle, superTitle },
                    pricing: { finalPrice, prices[] },
                    media: { images[], videos[] },
                    availability: { displayState },
                    productBrand,
                    titles: {},
                    maxOrderQuantityAllowed,
                    productUrl,
                    smartUrl,
                    xtraSaverCallout,
                    offerTags,
                    productSwatch: { products: {...} }
                  }
                }
              }
            ]
          }
        }
      }
    ]
  }
}
```

---

## 📝 Example Product Object

```javascript
{
  productId: "CHCEWXEHYHSEGYVD",
  itemId: "ITMFFMCYKFARZHFV",
  listingId: "LSTCHCEWXEHYHSEGYVDDQTVWY",
  productName: "Cadbury Dairy Milk Fruit and Nut Chocolate Bars",
  brand: "Cadbury",
  weight: "36 g",
  currentPrice: 45,
  originalPrice: 49,
  discount: 8,
  isOutOfStock: false,
  isAd: true,
  maxOrderQuantity: 15,
  productUrl: "/cadbury-dairy-milk-fruit-nut-chocolate-bars/p/itmffmcykfarzhfv?pid=CHCEWXEHYHSEGYVD&lid=LSTCHCEWXEHYHSEGYVDDQTVWY&marketplace=HYPERLOCAL",
  smartUrl: "https://dl.flipkart.com/dl/cadbury-dairy-milk-fruit-nut-chocolate-bars/p/itmffmcykfarzhfv?pid=CHCEWXEHYHSEGYVD",
  productImage: "https://rukminim1.flixcart.com/image/200/200/xif0q/chocolate/u/g/a/-original-imah3t6v4e7drzqz.jpeg?q=80",
  offerTags: [
    { offerTag: "Bank Offer", offerType: "BANK_OFFER" }
  ]
}
```

---

## 🔧 Usage with Extractor Utils

```javascript
const { extractAllProducts, formatImageUrl } = require('./flipkart_extractor');

// Extract all products
const products = extractAllProducts(apiResponse);

// Get formatted image
const imgUrl = formatImageUrl(rawUrl, 300, 300, 90);

// Filter in-stock products
const available = products.filter(p => !p.isOutOfStock);

// Find discounted items
const discounted = products.filter(p => p.discount > 0);
```
