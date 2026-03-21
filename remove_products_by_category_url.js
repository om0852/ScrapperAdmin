import fs from 'fs';
import path from 'path';

// URLs to remove
const urlsToRemove = [
  "https://www.swiggy.com/instamart/category-listing?categoryName=Fresh+Vegetables&filterId=68243edc0c0f930001b2188d&filterName=Frozen+Vegetables&offset=0&showAgeConsent=false&storeId=1404643&taxonomyType=Speciality+taxonomy+1",
  "https://www.zepto.com/cn/fruits-vegetables/frozen-veggies-pulp/cid/64374cfe-d06f-4a01-898e-c07c46462c36/scid/287a523f-f6c5-4f0c-b00a-4d872c837b80",
  "https://blinkit.com/cn/frozen-indian-breads/cid/1487/116",
  "https://blinkit.com/cn/frozen-veg/cid/1487/157",
  "https://blinkit.com/cn/frozen-peas-corn/cid/1487/172",
  "https://blinkit.com/cn/frozen-potato-snacks/cid/1487/122",
  "https://blinkit.com/cn/other-frozen-vegetables/cid/1487/222",
  "https://blinkit.com/cn/other-frozen-snacks/cid/1487/125",
  "https://www.flipkart.com/hyperlocal/hloc/jcen/pr?sid=hloc%2F0072%2Fjcen&marketplace=HYPERLOCAL&pageUID=1766499285460",
  "https://www.dmart.in/category/frozen-vegetable"
];

async function removeProductsByUrl(filePath) {
  try {
    console.log(`📂 Reading file: ${filePath}`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const originalCount = data.products.length;
    console.log(`📊 Original product count: ${originalCount}`);

    // Filter products
    const filteredProducts = data.products.filter(product => {
      const categoryUrl = product.categoryUrl || '';
      return !urlsToRemove.includes(categoryUrl);
    });

    const removedCount = originalCount - filteredProducts.length;
    const newCount = filteredProducts.length;

    console.log(`🗑️  Removed: ${removedCount} products`);
    console.log(`✅ Remaining: ${newCount} products`);

    // Update the data
    data.products = filteredProducts;
    data.totalProducts = newCount;

    // Write back to file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`💾 File updated: ${filePath}`);

    return {
      file: path.basename(filePath),
      originalCount,
      removedCount,
      newCount,
      success: true
    };

  } catch (error) {
    console.error(`❌ Error processing ${filePath}: ${error.message}`);
    return {
      file: path.basename(filePath),
      success: false,
      error: error.message
    };
  }
}

async function processDirectory(dirPath) {
  try {
    console.log(`\n🔍 Scanning directory: ${dirPath}\n`);
    
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
    console.log(`📋 Found ${files.length} JSON files\n`);

    const results = [];

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      console.log(`\n[${results.length + 1}/${files.length}] Processing: ${file}`);
      const result = await removeProductsByUrl(filePath);
      results.push(result);
    }

    // Summary
    console.log('\n\n========== SUMMARY ==========');
    let totalRemoved = 0;
    let successCount = 0;

    results.forEach(r => {
      if (r.success) {
        successCount++;
        totalRemoved += r.removedCount;
        console.log(`✅ ${r.file}`);
        console.log(`   Original: ${r.originalCount}, Removed: ${r.removedCount}, Remaining: ${r.newCount}`);
      } else {
        console.log(`❌ ${r.file}: ${r.error}`);
      }
    });

    console.log(`\n📊 Total Summary:`);
    console.log(`   Files Processed: ${successCount}/${files.length}`);
    console.log(`   Total Products Removed: ${totalRemoved}`);

  } catch (error) {
    console.error(`❌ Directory processing error: ${error.message}`);
  }
}

// Get the directory path from command line or use default
const dirPath = process.argv[2] || './12marchdata/Fruits _ Vegetables';

if (fs.existsSync(dirPath)) {
  processDirectory(dirPath);
} else {
  console.error(`❌ Directory not found: ${dirPath}`);
  process.exit(1);
}
