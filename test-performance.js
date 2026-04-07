/**
 * Performance Test: Old vs New Insertion Method
 * Run this to see the speed improvement
 * 
 * Usage: node test-performance.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductSnapshot from './models/ProductSnapshot.js';

dotenv.config();

// Generate mock product data
function generateMockProducts(count = 100) {
  const products = [];
  for (let i = 0; i < count; i++) {
    products.push({
      id: `product_${i}_${Date.now()}`,
      productId: `product_${i}_${Date.now()}`,
      name: `Product ${i} Test Item`,
      productName: `Product ${i} Test Item`,
      price: Math.floor(Math.random() * 500) + 50,
      currentPrice: Math.floor(Math.random() * 500) + 50,
      mrp: Math.floor(Math.random() * 1000) + 100,
      originalPrice: Math.floor(Math.random() * 1000) + 100,
      image: 'https://via.placeholder.com/300',
      productImage: 'https://via.placeholder.com/300',
      brand: ['Brand A', 'Brand B', 'Brand C'][Math.floor(Math.random() * 3)],
      officialSubCategory: 'fresh-vegetables',
      officalSubCategory: 'fresh-vegetables',
      category: 'Fruits & Vegetables',
      categoryUrl: 'https://example.com/category',
      ranking: i + 1,
      rank: i + 1,
      quantity: '1 kg',
      skuId: `SKU_${i}`
    });
  }
  return products;
}

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/quick_commerce');
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

async function testOldMethod(products) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🐢 OLD METHOD: Sequential .save() calls');
  console.log('═══════════════════════════════════════════════════════════\n');

  const startTime = Date.now();
  let count = 0;

  try {
    for (const prod of products) {
      const snapshot = new ProductSnapshot({
        category: 'Fruits & Vegetables',
        categoryUrl: prod.categoryUrl,
        officialCategory: 'Vegetables',
        officialSubCategory: prod.officialSubCategory,
        pincode: '110001',
        platform: 'blinkit',
        scrapedAt: new Date(),
        productId: prod.id,
        productUrl: 'https://example.com',
        productName: prod.name,
        productImage: prod.image,
        currentPrice: prod.currentPrice,
        originalPrice: prod.originalPrice,
        ranking: prod.ranking,
        brand: prod.brand,
        quantity: prod.quantity
      });

      await snapshot.save();
      count++;

      if ((count + 1) % 10 === 0) {
        process.stdout.write(`\r📝 Saved ${count} products...`);
      }
    }

    const elapsed = Date.now() - startTime;
    const perSecond = Math.round((count / elapsed) * 1000);

    console.log(`\n\n✅ Completed ${count} products in ${elapsed}ms`);
    console.log(`📊 Speed: ${perSecond} products/second\n`);

    return { count, elapsed, perSecond };
  } catch (err) {
    console.error(`❌ Error:`, err.message);
    return null;
  }
}

async function testNewMethod(products) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('⚡ NEW METHOD: Bulk insertMany()');
  console.log('═══════════════════════════════════════════════════════════\n');

  const startTime = Date.now();

  try {
    const docs = products.map(prod => ({
      category: 'Fruits & Vegetables',
      categoryUrl: prod.categoryUrl,
      officialCategory: 'Vegetables',
      officialSubCategory: prod.officialSubCategory,
      pincode: '110001',
      platform: 'blinkit',
      scrapedAt: new Date(),
      productId: `${prod.id}_bulk_${Date.now()}`,
      productUrl: 'https://example.com',
      productName: prod.name,
      productImage: prod.image,
      currentPrice: prod.currentPrice,
      originalPrice: prod.originalPrice,
      ranking: prod.ranking,
      brand: prod.brand,
      quantity: prod.quantity
    }));

    console.log('📦 Starting bulk insert...');
    const result = await ProductSnapshot.insertMany(docs, { ordered: false });
    const elapsed = Date.now() - startTime;
    const perSecond = Math.round((result.length / elapsed) * 1000);

    console.log(`✅ Bulk inserted ${result.length} products in ${elapsed}ms`);
    console.log(`📊 Speed: ${perSecond} products/second\n`);

    return { count: result.length, elapsed, perSecond };
  } catch (err) {
    console.error(`❌ Error:`, err.message);
    return null;
  }
}

async function runTests() {
  console.log('\n\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║     🚀 INSERTION PERFORMANCE TEST: OLD vs NEW 🚀          ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  await connectDB();

  const testSizes = [10, 50, 100];

  for (const size of testSizes) {
    console.log(`\n\n${'═'.repeat(60)}`);
    console.log(`TEST SET: ${size} products`);
    console.log(`${'═'.repeat(60)}`);

    // Generate fresh products for each test
    const mockProducts = generateMockProducts(size);

    // Test old method
    const oldResult = await testOldMethod(mockProducts);

    // Clear previous data
    await ProductSnapshot.deleteMany({
      productId: { $regex: 'product_' }
    });

    // Test new method
    const newResult = await testNewMethod(mockProducts);

    // Show comparison
    if (oldResult && newResult) {
      const speedup = (oldResult.elapsed / newResult.elapsed).toFixed(1);
      console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
      console.log('║                     COMPARISON                           ║');
      console.log('╠═══════════════════════════════════════════════════════════╣');
      console.log(`║ Old Method:  ${oldResult.elapsed} ms (${oldResult.perSecond} products/sec)`.padEnd(60) + '║');
      console.log(`║ New Method:  ${newResult.elapsed} ms (${newResult.perSecond} products/sec)`.padEnd(60) + '║');
      console.log(`║ Speedup:     ${speedup}x FASTER ⚡`.padEnd(60) + '║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
    }
  }

  console.log('\n\n✅ Performance tests completed!\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
