import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const URLS_FILE = path.join(__dirname, 'urls', 'blinkit_urls.json');

// Files to process
const filesToProcess = [
    'blinkit_bulk_results_122010.json',
    'blinkit_bulk_results_122016.json',
    'blinkit_bulk_results_201014.json'
];

// Read URLs file
const urlsData = JSON.parse(fs.readFileSync(URLS_FILE, 'utf-8'));

// Create category name to URL mapping
const categoryMap = {};

urlsData.forEach(url => {
    const parts = url.split('/cn/');
    if (parts.length > 1) {
        const categoryPart = parts[1].split('/')[0];
        const categoryName = categoryPart
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        
        categoryMap[categoryName] = url;
    }
});

console.log(`📋 Loaded ${Object.keys(categoryMap).length} category URL mappings\n`);

// Process each file
filesToProcess.forEach(filename => {
    const inputFile = path.join(__dirname, filename);
    const outputFile = path.join(__dirname, filename.replace('.json', '_with_urls.json'));

    if (!fs.existsSync(inputFile)) {
        console.log(`⚠️  File not found: ${filename}`);
        return;
    }

    console.log(`\n📂 Processing: ${filename}`);
    
    // Read results file
    const resultsData = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
    console.log(`   Loaded ${resultsData.length} products`);

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
    fs.writeFileSync(outputFile, JSON.stringify(updatedResults, null, 2));

    // Print statistics
    console.log(`   ✅ Added categoryUrl to products`);
    console.log(`      Matched: ${matched}`);
    console.log(`      Unmatched: ${unmatched}`);
    
    if (unmatchedCategories.size > 0) {
        console.log(`   ⚠️  Unmatched categories:`);
        Array.from(unmatchedCategories).slice(0, 3).forEach(cat => {
            const count = updatedResults.filter(p => p.category === cat && !p.categoryUrl).length;
            console.log(`      - "${cat}" (${count} products)`);
        });
    }

    const fileSizeMB = (fs.statSync(outputFile).size / 1024 / 1024).toFixed(2);
    console.log(`   💾 Output: ${outputFile.split('\\').pop()} (${fileSizeMB} MB)`);
});

console.log(`\n✨ All files processed successfully!`);
