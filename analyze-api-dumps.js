import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiDumpsDir = path.join(__dirname, 'Blinkit-Scrapper/api_dumps');

console.log('\n📊 ANALYZING API DUMPS FOLDER\n');
console.log('='.repeat(80));

const files = fs.readdirSync(apiDumpsDir);
const consolidatedFiles = files.filter(f => f.startsWith('api_consolidated_'));
const rawFiles = files.filter(f => f.startsWith('raw_api_sample_'));

console.log(`\n📁 Total Files: ${files.length}`);
console.log(`   - Consolidated: ${consolidatedFiles.length}`);
console.log(`   - Raw Samples: ${rawFiles.length}`);

// Analyze consolidated files
console.log('\n' + '='.repeat(80));
console.log('📦 CONSOLIDATED API DUMPS (Processed Products)\n');

const consolidatedAnalysis = [];
let totalProducts = 0;

consolidatedFiles.forEach(file => {
    const filePath = path.join(apiDumpsDir, file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    const productCount = content.products ? content.products.length : 0;
    const categoryName = content.metadata?.category || 'Unknown';
    
    totalProducts += productCount;
    
    consolidatedAnalysis.push({
        file,
        category: categoryName,
        productCount,
        timestamp: content.metadata?.timestamp
    });
});

// Sort by product count descending
consolidatedAnalysis.sort((a, b) => b.productCount - a.productCount);

// Display table
console.log('File Name'.padEnd(50) + 'Category'.padEnd(25) + 'Products'.padEnd(10));
console.log('-'.repeat(80));

consolidatedAnalysis.forEach(item => {
    console.log(
        item.file.substring(0, 49).padEnd(50) + 
        item.category.substring(0, 24).padEnd(25) + 
        item.productCount.toString().padEnd(10)
    );
});

console.log('-'.repeat(80));
console.log('TOTAL PRODUCTS'.padEnd(50) + ''.padEnd(25) + totalProducts.toString().padEnd(10));

// Analyze raw files
console.log('\n' + '='.repeat(80));
console.log('🔍 RAW API SAMPLES (API Responses)\n');

const rawAnalysis = [];

rawFiles.forEach(file => {
    const filePath = path.join(apiDumpsDir, file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    const totalRawResponses = content.totalRawResponses || 0;
    const sampleResponses = content.sampleResponses ? content.sampleResponses.length : 0;
    const categoryName = content.metadata?.category || 'Unknown';
    
    let totalSnippets = 0;
    if (content.sampleResponses) {
        content.sampleResponses.forEach(response => {
            const snippets = response?.response?.snippets || [];
            totalSnippets += snippets.length;
        });
    }
    
    rawAnalysis.push({
        file,
        category: categoryName,
        totalRawResponses,
        sampleResponses,
        totalSnippets
    });
});

// Sort by category name
rawAnalysis.sort((a, b) => a.category.localeCompare(b.category));

console.log('File Name'.padEnd(50) + 'Total Responses'.padEnd(18) + 'Sample Snippets'.padEnd(16));
console.log('-'.repeat(80));

rawAnalysis.forEach(item => {
    console.log(
        item.file.substring(0, 49).padEnd(50) + 
        item.totalRawResponses.toString().padEnd(18) + 
        item.totalSnippets.toString().padEnd(16)
    );
});

// Summary
console.log('\n' + '='.repeat(80));
console.log('📈 SUMMARY\n');

console.log(`✅ Total Consolidated Products: ${totalProducts}`);
console.log(`📦 Total Categories Scraped: ${consolidatedAnalysis.length}`);

const productBreakdown = {};
consolidatedAnalysis.forEach(item => {
    productBreakdown[item.category] = item.productCount;
});

console.log('\n📊 Products by Category:');
Object.entries(productBreakdown)
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, count]) => {
        const percentage = ((count / totalProducts) * 100).toFixed(1);
        console.log(`   ${category.padEnd(30)} : ${count.toString().padEnd(4)} (${percentage}%)`);
    });

console.log('\n' + '='.repeat(80) + '\n');
