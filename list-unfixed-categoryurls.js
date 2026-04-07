/**
 * List all categoryUrls for Instamart products on 2026-03-22T08:00:00Z
 * that are still marked as Fruits & Vegetables after the fix
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductSnapshot from './models/ProductSnapshot.js';

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

async function listUnfixedCategoryUrls() {
  const targetDate = new Date('2026-03-22T08:00:00Z');
  const matchQuery = {
    platform: 'instamart',
    scrapedAt: targetDate,
    category: 'Fruits & Vegetables',
    categoryUrl: { $ne: 'N/A', $exists: true }
  };

  const products = await ProductSnapshot.find(matchQuery, { categoryUrl: 1, productName: 1 }).lean();

  const uniqueUrls = Array.from(new Set(products.map(p => p.categoryUrl)));

  console.log(`\n❌ Unfixed products: ${products.length}`);
  console.log(`\nUnique unfixed categoryUrls: ${uniqueUrls.length}\n`);

  uniqueUrls.forEach((url, i) => {
    console.log(`[${i + 1}] ${url}`);
  });

  // Optionally, show a few product names for each URL
  console.log('\nSample products for each URL:\n');
  for (const url of uniqueUrls.slice(0, 10)) {
    const sample = products.find(p => p.categoryUrl === url);
    if (sample) {
      console.log(`- ${url}`);
      console.log(`    e.g. ${sample.productName}`);
    }
  }
}

async function main() {
  await connectDB();
  await listUnfixedCategoryUrls();
  await mongoose.disconnect();
}

main();
