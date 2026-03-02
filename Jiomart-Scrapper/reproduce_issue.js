
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { transformJiomartProduct } from './transform_response_format.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load first_item.json
const rawProductPath = path.join(__dirname, 'first_item.json');
const rawProduct = JSON.parse(fs.readFileSync(rawProductPath, 'utf8'));

console.log('Testing transformation on first_item.json...');

const transformed = transformJiomartProduct(
    rawProduct,
    'https://dummy.url',
    'Dummy Category',
    'Dummy SubCategory',
    '122008',
    1
);

console.log('Transformed Product Image:', transformed.productImage);

if (transformed.productImage === 'N/A') {
    console.log('FAIL: Image is N/A but expected a URI.');
    // Check if we can find it in variants to confirm where it should be
    if (rawProduct.product.variants && rawProduct.product.variants[0].images && rawProduct.product.variants[0].images.length > 0) {
        console.log('Discovery: Found image in variants[0]:', rawProduct.product.variants[0].images[0].uri);
    }
} else {
    console.log('SUCCESS: Image found:', transformed.productImage);
}
