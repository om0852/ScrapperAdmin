import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEA_COFFEE_DIR = path.join(__dirname, 'scraped_data', 'Tea_ Coffee _ More');

// Find all Instamart JSON files
const files = fs.readdirSync(TEA_COFFEE_DIR)
  .filter(f => f.startsWith('Instamart_') && f.endsWith('.json'))
  .sort();

console.log(`\n📊 BATCH PROCESSING INSTAMART FILES`);
console.log(`📁 Directory: ${TEA_COFFEE_DIR}`);
console.log(`📋 Found ${files.length} Instamart files\n`);

let successCount = 0;
let skipCount = 0;
const results = [];

// Process each file
files.forEach((file, index) => {
  const filePath = path.join(TEA_COFFEE_DIR, file);
  const fileStats = fs.statSync(filePath);
  const fileSizeKB = (fileStats.size / 1024).toFixed(2);

  // Check if file has products
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const productCount = data.products ? data.products.length : 0;

    if (productCount === 0) {
      console.log(`⏭️  [${index + 1}/${files.length}] SKIPPED: ${file} (0 products)`);
      skipCount++;
      results.push({
        file,
        status: 'SKIPPED',
        reason: '0 products',
        productCount: 0
      });
      return;
    }

    console.log(`⚙️  [${index + 1}/${files.length}] FIXING: ${file} (${productCount} products, ${fileSizeKB}KB)...`);

    // Run the validation script
    const scriptPath = path.join(__dirname, 'validate-and-fix-categories.js');
    const relativeFilePath = path.relative(__dirname, filePath);
    
    try {
      execSync(`node "${scriptPath}" "${relativeFilePath}"`, {
        cwd: __dirname,
        stdio: 'pipe'
      });
      
      console.log(`✅ [${index + 1}/${files.length}] FIXED: ${file}`);
      successCount++;
      results.push({
        file,
        status: 'FIXED',
        productCount,
        fileSizeKB
      });
    } catch (error) {
      console.log(`❌ [${index + 1}/${files.length}] ERROR: ${file}`);
      console.log(`   Error: ${error.message.split('\n')[0]}`);
      results.push({
        file,
        status: 'ERROR',
        productCount,
        error: error.message.split('\n')[0]
      });
    }
  } catch (parseError) {
    console.log(`⚠️  [${index + 1}/${files.length}] PARSE ERROR: ${file}`);
    skipCount++;
    results.push({
      file,
      status: 'PARSE_ERROR',
      error: parseError.message
    });
  }
});

// Summary
console.log(`\n${'='.repeat(70)}`);
console.log(`📊 BATCH PROCESSING SUMMARY`);
console.log(`${'='.repeat(70)}`);
console.log(`✅ Successfully fixed: ${successCount}`);
console.log(`⏭️  Skipped (0 products): ${skipCount}`);
console.log(`❌ Errors: ${results.filter(r => r.status === 'ERROR').length}`);
console.log(`${'='.repeat(70)}\n`);

// Detailed results
console.log(`📋 DETAILED RESULTS:\n`);
results.forEach((result, i) => {
  const status = result.status === 'FIXED' ? '✅' : result.status === 'SKIPPED' ? '⏭️' : '❌';
  console.log(`${i + 1}. ${status} ${result.file}`);
  console.log(`   Status: ${result.status}`);
  if (result.productCount !== undefined) {
    console.log(`   Products: ${result.productCount}`);
  }
  if (result.reason) {
    console.log(`   Reason: ${result.reason}`);
  }
  if (result.error) {
    console.log(`   Error: ${result.error.substring(0, 100)}`);
  }
  console.log();
});

console.log(`\n✨ All Instamart files processed!`);
process.exit(0);
