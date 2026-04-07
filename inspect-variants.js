import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the Fresh Vegetables API dump
const filePath = path.join(__dirname, 'Blinkit-Scrapper/api_dumps/api_consolidated_Fresh_Vegetables_1774625230029.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

console.log('\n🔍 INSPECTING API RESPONSE STRUCTURE\n');
console.log('Total products in consolidated file:', data.products.length);

// Look at first product's full structure from API
if (data.products && data.products.length > 0) {
    const firstProduct = data.products[0];
    
    console.log('\n📦 First Product Full Structure:');
    console.log(JSON.stringify(firstProduct, null, 2));
    
    console.log('\n🔑 Root Keys in Product Data:');
    console.log(Object.keys(firstProduct).sort());
    
    // Check for variant-related fields
    console.log('\n🔎 Checking for Variant Data:');
    const variantIndicators = [
        'variants', 'options', 'skus', 'sizes', 'packages',
        'variant', 'sku', 'size', 'package', 'units',
        'cta', 'button_data', 'meta_data', 'tracking'
    ];
    
    variantIndicators.forEach(key => {
        if (firstProduct[key]) {
            console.log(`  ✅ Found: ${key} =`, JSON.stringify(firstProduct[key]).substring(0, 100));
        }
    });
    
    // Check a product that has "2 options" or combo
    console.log('\n🔍 Looking for products with variants/options:');
    const productsWithCombos = data.products.filter(p => p.combo !== 'N/A');
    
    if (productsWithCombos.length > 0) {
        console.log(`Found ${productsWithCombos.length} products with combo options`);
        const exampleProduct = productsWithCombos[0];
        console.log('\nExample product with "' + exampleProduct.combo + '":');
        console.log('- Name:', exampleProduct.name);
        console.log('- Current Price:', exampleProduct.price);
        console.log('- Current Quantity:', exampleProduct.quantity);
        console.log('Full structure:');
        console.log(JSON.stringify(exampleProduct, null, 2));
    }
}

// Now check the raw API response if available
console.log('\n\n' + '='.repeat(80));
console.log('Checking if raw API responses are stored somewhere...\n');

try {
    const files = fs.readdirSync(path.join(__dirname, 'Blinkit-Scrapper'));
    const apiDumpFiles = files.filter(f => f.startsWith('api_'));
    console.log('Found API dump files:', apiDumpFiles);
} catch (e) {
    console.log('Could not list API dump directory');
}
