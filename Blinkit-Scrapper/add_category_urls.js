import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const URLS_FILE = path.join(__dirname, 'urls', 'blinkit_urls.json');
const RESULTS_FILE = path.join(__dirname, 'blinkit_bulk_results_122008.json');
const OUTPUT_FILE = path.join(__dirname, 'blinkit_bulk_results_122008_with_urls.json');

// Read URLs file
const urlsData = JSON.parse(fs.readFileSync(URLS_FILE, 'utf-8'));

// Create category name to URL mapping
const categoryMap = {};

urlsData.forEach(url => {
    // Extract category name from URL
    // URL format: https://blinkit.com/cn/category-name/cid/...
    const parts = url.split('/cn/');
    if (parts.length > 1) {
        const categoryPart = parts[1].split('/')[0];
        // Convert URL slug to proper category name (e.g., "exotics-premium" -> "Exotics Premium")
        const categoryName = categoryPart
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        
        categoryMap[categoryName] = url;
    }
});

console.log(`📋 Loaded ${Object.keys(categoryMap).length} category URL mappings`);
console.log(`Sample mappings:`);
Object.entries(categoryMap).slice(0, 5).forEach(([name, url]) => {
    console.log(`  ${name} -> ${url}`);
});

// Read results file
const resultsData = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
console.log(`\n📊 Loaded ${resultsData.length} products from results file`);

// Add categoryUrl to each product
let matched = 0;
let unmatched = 0;
const unmatchedCategories = new Set();

const updatedResults = resultsData.map(product => {
    const categoryUrl = categoryMap[product.category];
    if (categoryUrl) {
        matched++;
    } else {
        unmatched++;
        unmatchedCategories.add(product.category);
    }
    return {
        ...product,
        categoryUrl: categoryUrl || null
    };
});

// Write output file
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(updatedResults, null, 2));

// Print statistics
console.log(`\n✅ Successfully added categoryUrl to products`);
console.log(`  Matched: ${matched} products`);
console.log(`  Unmatched: ${unmatched} products`);

if (unmatchedCategories.size > 0) {
    console.log(`\n⚠️  Unmatched categories (${unmatchedCategories.size}):`);
    Array.from(unmatchedCategories).forEach(cat => {
        const count = updatedResults.filter(p => p.category === cat && !p.categoryUrl).length;
        console.log(`  - "${cat}" (${count} products)`);
    });
}

console.log(`\n💾 Output saved to: ${OUTPUT_FILE}`);
console.log(`\nFile size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);
