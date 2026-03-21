/**
 * Flipkart Hyperlocal API Response Extractor
 * Provides utilities to extract product information from Flipkart API responses
 */

/**
 * Format image URL by replacing placeholders with actual dimensions
 * @param {string} imageUrl - Image URL with placeholders
 * @param {number} width - Desired width (default: 200)
 * @param {number} height - Desired height (default: 200)
 * @param {number} quality - Quality level 1-100 (default: 80)
 * @returns {string} Formatted image URL
 */
function formatImageUrl(imageUrl, width = 200, height = 200, quality = 80) {
  if (!imageUrl) return null;
  return imageUrl
    .replace('{@width}', width)
    .replace('{@height}', height)
    .replace('{@quality}', quality);
}

/**
 * Extract single product data from productInfo object
 * @param {Object} productInfo - The productInfo object from API response
 * @returns {Object} Extracted product data
 */
function extractProduct(productInfo) {
  if (!productInfo || !productInfo.value) {
    console.warn('Invalid productInfo object');
    return null;
  }

  const value = productInfo.value;
  const pricing = value.pricing || {};
  const titles = value.titles || {};
  const availability = value.availability || {};
  const action = productInfo.action || {};

  // Get original price (MRP)
  const mrpPrice = pricing.prices?.find(p => p.priceType === 'MRP');
  const originalPrice = mrpPrice?.value;

  // Get current price (FSP)
  const fspPrice = pricing.prices?.find(p => p.priceType === 'FSP') || pricing.finalPrice;
  const currentPrice = fspPrice?.value;

  // Determine if out of stock
  const isOutOfStock = availability.displayState !== 'IN_STOCK';

  // Get primary image
  const primaryImage = value.media?.images?.[0]?.url;
  const formattedImage = formatImageUrl(primaryImage);

  // Get all images
  const allImages = (value.media?.images || []).map(img =>
    formatImageUrl(img.url)
  );

  // Detect if it's an ad/promotional
  const hasXtraSaver = !!value.xtraSaverCallout;
  const hasOffers = (value.offerTags || []).length > 0;
  const isAd = hasXtraSaver || hasOffers;

  // Get weight from title subtitle (e.g., "36 g")
  const weight = titles.subtitle || null;

  // Get available quantity variants
  const quantityOptions = value.productSwatch?.attributeOptions?.[0]?.map(opt => opt.value) || [];

  return {
    // Product Identification
    productId: value.id,
    itemId: value.itemId,
    listingId: value.listingId,
    
    // Product Information
    productName: titles.title,
    brand: value.productBrand,
    weight: weight,
    weightVariants: quantityOptions,
    
    // URLs
    productUrl: value.productUrl,
    smartUrl: value.smartUrl,
    baseUrl: value.baseUrl,
    
    // Pricing Information
    currentPrice: currentPrice,
    originalPrice: originalPrice,
    discount: pricing.totalDiscount || null,
    discountAmount: pricing.discountAmount || null,
    currency: pricing.finalPrice?.currency || 'INR',
    
    // Stock Information
    isOutOfStock: isOutOfStock,
    stockStatus: availability.displayState,
    maxOrderQuantity: value.maxOrderQuantityAllowed,
    
    // Promotional Information
    isAd: isAd,
    hasXtraSaver: hasXtraSaver,
    offerTags: value.offerTags || [],
    
    // Images
    productImage: formattedImage,
    allImages: allImages,
    
    // Additional Data
    keySpecs: value.keySpecs || [],
    category: value.analyticsData?.category,
    subCategory: value.analyticsData?.subCategory,
    shopId: action.params?.shopId?.[0],
    availability: availability.intent === 'positive',
  };
}

/**
 * Extract all products from API response
 * @param {Object} apiResponse - Complete API response object
 * @returns {Array} Array of extracted product data
 */
function extractAllProducts(apiResponse) {
  const products = [];
  
  try {
    const slots = apiResponse?.RESPONSE?.slots || [];
    
    slots.forEach(slot => {
      const slotProducts = slot?.widget?.data?.products || [];
      
      slotProducts.forEach(product => {
        const extracted = extractProduct(product.productInfo);
        if (extracted) {
          products.push(extracted);
        }
      });
    });
  } catch (error) {
    console.error('Error extracting products from API response:', error);
  }
  
  return products;
}

/**
 * Check if product is in stock
 * @param {Object} productInfo - The productInfo object
 * @returns {boolean}
 */
function isProductInStock(productInfo) {
  return productInfo?.value?.availability?.displayState === 'IN_STOCK';
}

/**
 * Check if product is an advertisement
 * @param {Object} productInfo - The productInfo object
 * @returns {boolean}
 */
function isProductAd(productInfo) {
  return !!productInfo?.value?.xtraSaverCallout || 
         (productInfo?.value?.offerTags?.length || 0) > 0;
}

/**
 * Get all price variants from product swatch
 * @param {Object} productInfo - The productInfo object
 * @returns {Array} Array of variant objects with price and weight
 */
function getPriceVariants(productInfo) {
  const variants = [];
  
  try {
    const swatchProducts = productInfo?.value?.productSwatch?.products || {};
    
    Object.entries(swatchProducts).forEach(([productId, variant]) => {
      const pricing = variant.pricing || {};
      const fspPrice = pricing.prices?.find(p => p.priceType === 'FSP');
      
      variants.push({
        productId: productId,
        weight: variant.titles?.subtitle,
        price: fspPrice?.value,
        image: formatImageUrl(variant.images?.[0]?.url),
        available: variant.available
      });
    });
  } catch (error) {
    console.error('Error extracting price variants:', error);
  }
  
  return variants;
}

/**
 * Compare prices across variants for best deal
 * @param {Object} productInfo - The productInfo object
 * @returns {Object} Best variant object
 */
function findBestDeal(productInfo) {
  const variants = getPriceVariants(productInfo);
  
  if (variants.length === 0) return null;
  
  return variants.reduce((best, current) => {
    if (current.price && (!best.price || current.price < best.price)) {
      return current;
    }
    return best;
  }, variants[0]);
}

/**
 * Format product for display/storage
 * @param {Object} productInfo - The productInfo object
 * @returns {Object} Formatted product object
 */
function formatProductForDisplay(productInfo) {
  const product = extractProduct(productInfo);
  
  return {
    id: product.productId,
    name: product.productName,
    brand: product.brand,
    weight: product.weight,
    price: `₹${product.currentPrice}`,
    originalPrice: product.originalPrice ? `₹${product.originalPrice}` : null,
    discount: product.discount ? `${product.discount}%` : null,
    image: product.productImage,
    url: product.productUrl,
    inStock: !product.isOutOfStock,
    maxQty: product.maxOrderQuantity,
    isPromo: product.isAd,
  };
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractProduct,
    extractAllProducts,
    isProductInStock,
    isProductAd,
    getPriceVariants,
    findBestDeal,
    formatProductForDisplay,
    formatImageUrl,
  };
}

// Export for ES6 modules
export {
  extractProduct,
  extractAllProducts,
  isProductInStock,
  isProductAd,
  getPriceVariants,
  findBestDeal,
  formatProductForDisplay,
  formatImageUrl,
};
