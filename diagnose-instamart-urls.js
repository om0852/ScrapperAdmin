/**
 * Diagnostic: Check Instamart URLs and their mappings
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductSnapshot from './models/ProductSnapshot.js';
import { categoryMapper } from './utils/categoryMapper.js';

dotenv.config();

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/quick_commerce');
    console.log('✅ Connected to MongoDB\n');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

async function diagnoseUrls() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🔍 DIAGNOSTIC: Instamart URL Mappings                   ║');
  console.log('║  Date: 2026-03-22T08:00:00Z                             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    const targetDate = new Date('2026-03-22T08:00:00Z');
    
    const products = await ProductSnapshot.find({
      platform: 'instamart',
      scrapedAt: targetDate
    }).lean().limit(20);

    console.log(`📊 Found ${products.length} Instamart products\n`);

    // Group by unique categoryUrl
    const urlMap = new Map();
    
    products.forEach(p => {
      const url = p.categoryUrl || 'NO_URL';
      if (!urlMap.has(url)) {
        urlMap.set(url, []);
      }
      urlMap.get(url).push(p);
    });

    console.log(`📋 Unique categoryURLs found: ${urlMap.size}\n`);

    // Test each URL
    let index = 1;
    for (const [url, prods] of urlMap) {
      console.log(`[${index}] Products with this URL: ${prods.length}`);
      console.log(`    URL: ${url.substring(0, 100)}...`);
      
      // Test the mapping
      const mapped = categoryMapper.extractCategoryFromUrl(url, 'Instamart');
      console.log(`    ✅ Mapped to: ${mapped.category}`);
      console.log(`       Official: ${mapped.officialCategory} > ${mapped.officialSubCategory}`);
      console.log(`       Master: ${mapped.masterCategory}`);
      
      // Show sample products
      console.log(`    Sample products:`);
      prods.slice(0, 3).forEach((p, i) => {
        console.log(`      [${i+1}] ${p.productName} (Current: ${p.category})`);
      });
      
      console.log();
      index++;
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  try {
    await connectDB();
    await diagnoseUrls();
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
