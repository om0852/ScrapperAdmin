/**
 * Flipkart API Extraction - Usage Examples
 * Shows how to use the extractor utility with real API responses
 */

// Example 1: Extract all products from an API response
// ==================================================

const fs = require('fs');
const path = require('path');
const {
  extractProduct,
  extractAllProducts,
  isProductInStock,
  isProductAd,
  getPriceVariants,
  findBestDeal,
  formatProductForDisplay,
  formatImageUrl,
} = require('./flipkart_extractor');

/**
 * Example: Load and extract from API dump file
 */
function example_loadAndExtract() {
  // Load the API response file
  const apiDumpPath = path.join(
    __dirname,
    'flipkart_minutes/api_dumps/dump_122008_api_response_https___www_flipkart_com_hyper_1771315314231.json'
  );
  
  const apiResponse = JSON.parse(fs.readFileSync(apiDumpPath, 'utf-8'));
  
  // Extract all products
  const products = extractAllProducts(apiResponse);
  
  console.log(`Found ${products.length} products\n`);
  
  // Display each product
  products.forEach((product, index) => {
    console.log(`\n--- Product ${index + 1} ---`);
    console.log(`Name: ${product.productName}`);
    console.log(`Brand: ${product.brand}`);
    console.log(`Weight: ${product.weight}`);
    console.log(`Price: ₹${product.currentPrice}`);
    console.log(`Original: ₹${product.originalPrice}`);
    console.log(`Discount: ${product.discount}%`);
    console.log(`In Stock: ${!product.isOutOfStock}`);
    console.log(`Is Ad: ${product.isAd}`);
    console.log(`Max Qty: ${product.maxOrderQuantity}`);
    console.log(`Image: ${product.productImage}`);
  });
}

/**
 * Example 2: Extract single product details
 */
function example_singleProduct() {
  const apiDumpPath = path.join(
    __dirname,
    'flipkart_minutes/api_dumps/dump_122008_api_response_https___www_flipkart_com_hyper_1771315314231.json'
  );
  
  const apiResponse = JSON.parse(fs.readFileSync(apiDumpPath, 'utf-8'));
  const firstProduct = apiResponse.RESPONSE.slots[0].widget.data.products[0];
  
  const product = extractProduct(firstProduct.productInfo);
  
  console.log('\n=== SINGLE PRODUCT EXTRACTION ===\n');
  console.log('Product ID:', product.productId);
  console.log('Name:', product.productName);
  console.log('Price:', `₹${product.currentPrice}`);
  console.log('Original Price:', `₹${product.originalPrice}`);
  console.log('Discount:', `${product.discount}%`);
  console.log('Weight:', product.weight);
  console.log('Out of Stock:', product.isOutOfStock);
  console.log('Is Advertisement:', product.isAd);
  console.log('SM URL:', product.smartUrl);
}

/**
 * Example 3: Handle price variants
 */
function example_priceVariants() {
  const apiDumpPath = path.join(
    __dirname,
    'flipkart_minutes/api_dumps/dump_122008_api_response_https___www_flipkart_com_hyper_1771315314231.json'
  );
  
  const apiResponse = JSON.parse(fs.readFileSync(apiDumpPath, 'utf-8'));
  const firstProduct = apiResponse.RESPONSE.slots[0].widget.data.products[0];
  
  console.log('\n=== PRICE VARIANTS ===\n');
  
  const variants = getPriceVariants(firstProduct.productInfo);
  
  variants.forEach(variant => {
    console.log(`Weight: ${variant.weight} | Price: ₹${variant.price} | Available: ${variant.available}`);
  });
  
  const bestDeal = findBestDeal(firstProduct.productInfo);
  console.log(`\nBest Deal: ${bestDeal.weight} at ₹${bestDeal.price}`);
}

/**
 * Example 4: Filter products
 */
function example_filterProducts() {
  const apiDumpPath = path.join(
    __dirname,
    'flipkart_minutes/api_dumps/dump_122008_api_response_https___www_flipkart_com_hyper_1771315314231.json'
  );
  
  const apiResponse = JSON.parse(fs.readFileSync(apiDumpPath, 'utf-8'));
  const products = extractAllProducts(apiResponse);
  
  console.log('\n=== FILTERED PRODUCTS ===\n');
  
  // Filter in-stock products
  const inStockProducts = products.filter(p => !p.isOutOfStock);
  console.log(`In Stock: ${inStockProducts.length}`);
  
  // Filter promotional products
  const promoProducts = products.filter(p => p.isAd);
  console.log(`Promotional: ${promoProducts.length}`);
  
  // Filter by price range
  const affordableProducts = products.filter(p => p.currentPrice < 100);
  console.log(`Under ₹100: ${affordableProducts.length}`);
  
  // Get products with discounts
  const discountedProducts = products.filter(p => p.discount > 0);
  console.log(`With Discount: ${discountedProducts.length}`);
}

/**
 * Example 5: Format for display
 */
function example_formatForDisplay() {
  const apiDumpPath = path.join(
    __dirname,
    'flipkart_minutes/api_dumps/dump_122008_api_response_https___www_flipkart_com_hyper_1771315314231.json'
  );
  
  const apiResponse = JSON.parse(fs.readFileSync(apiDumpPath, 'utf-8'));
  const firstProduct = apiResponse.RESPONSE.slots[0].widget.data.products[0];
  
  const formatted = formatProductForDisplay(firstProduct.productInfo);
  
  console.log('\n=== FORMATTED FOR DISPLAY ===\n');
  console.log(JSON.stringify(formatted, null, 2));
}

/**
 * Example 6: Extract and save to CSV
 */
function example_exportToCSV() {
  const apiDumpPath = path.join(
    __dirname,
    'flipkart_minutes/api_dumps/dump_122008_api_response_https___www_flipkart_com_hyper_1771315314231.json'
  );
  
  const apiResponse = JSON.parse(fs.readFileSync(apiDumpPath, 'utf-8'));
  const products = extractAllProducts(apiResponse);
  
  // Create CSV header
  const csvHeader = [
    'Product ID',
    'Product Name',
    'Brand',
    'Weight',
    'Current Price',
    'Original Price',
    'Discount %',
    'In Stock',
    'Is Ad',
    'Max Quantity',
    'URL',
    'Image'
  ].join(',');
  
  // Create CSV rows
  const csvRows = products.map(p => [
    p.productId,
    `"${p.productName}"`, // Wrap in quotes to handle commas
    p.brand,
    p.weight,
    p.currentPrice,
    p.originalPrice,
    p.discount,
    !p.isOutOfStock ? 'Yes' : 'No',
    p.isAd ? 'Yes' : 'No',
    p.maxOrderQuantity,
    p.productUrl,
    p.productImage
  ].join(','));
  
  const csvContent = [csvHeader, ...csvRows].join('\n');
  
  // Save to file
  const outputPath = path.join(__dirname, 'products_export.csv');
  fs.writeFileSync(outputPath, csvContent);
  
  console.log(`\n✓ Exported ${products.length} products to ${outputPath}`);
}

/**
 * Example 7: Extract specific fields only
 */
function example_extractSpecificFields() {
  const apiDumpPath = path.join(
    __dirname,
    'flipkart_minutes/api_dumps/dump_122008_api_response_https___www_flipkart_com_hyper_1771315314231.json'
  );
  
  const apiResponse = JSON.parse(fs.readFileSync(apiDumpPath, 'utf-8'));
  const products = extractAllProducts(apiResponse);
  
  console.log('\n=== SPECIFIC FIELDS ONLY ===\n');
  
  // Extract only required fields
  const simplified = products.map(p => ({
    productId: p.productId,
    productName: p.productName,
    currentPrice: `₹${p.currentPrice}`,
    originalPrice: `₹${p.originalPrice}`,
    isOutOfStock: p.isOutOfStock,
    isAd: p.isAd,
    productImage: p.productImage,
    productUrl: p.productUrl
  }));
  
  console.log(JSON.stringify(simplified, null, 2));
}

/**
 * Example 8: Handle image URL formatting
 */
function example_imageFormatting() {
  const apiDumpPath = path.join(
    __dirname,
    'flipkart_minutes/api_dumps/dump_122008_api_response_https___www_flipkart_com_hyper_1771315314231.json'
  );
  
  const apiResponse = JSON.parse(fs.readFileSync(apiDumpPath, 'utf-8'));
  const firstProduct = apiResponse.RESPONSE.slots[0].widget.data.products[0];
  
  const rawImage = firstProduct.productInfo.value.media.images[0].url;
  
  console.log('\n=== IMAGE URL FORMATTING ===\n');
  console.log('Raw URL:', rawImage);
  
  // Different sizes
  const thumb = formatImageUrl(rawImage, 100, 100);
  const medium = formatImageUrl(rawImage, 300, 300);
  const large = formatImageUrl(rawImage, 600, 600);
  
  console.log('\nThumbnail (100x100):', thumb);
  console.log('Medium (300x300):', medium);
  console.log('Large (600x600):', large);
}

// ====================================
// Run examples
// ====================================

if (require.main === module) {
  // Uncomment to run examples
  
  // example_loadAndExtract();
  example_singleProduct();
  // example_priceVariants();
  // example_filterProducts();
  // example_formatForDisplay();
  // example_exportToCSV();
  // example_extractSpecificFields();
  // example_imageFormatting();
}

module.exports = {
  example_loadAndExtract,
  example_singleProduct,
  example_priceVariants,
  example_filterProducts,
  example_formatForDisplay,
  example_exportToCSV,
  example_extractSpecificFields,
  example_imageFormatting,
};
