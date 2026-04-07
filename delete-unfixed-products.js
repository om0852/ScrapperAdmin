/**
 * Delete all Instamart products on 2026-03-22T08:00:00Z
 * that are still marked as Fruits & Vegetables and have a categoryUrl
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

async function deleteUnfixedProducts() {
  const targetDate = new Date('2026-03-22T08:00:00Z');
  const matchQuery = {
    platform: 'instamart',
    scrapedAt: targetDate,
    category: 'Fruits & Vegetables',
    categoryUrl: { $ne: 'N/A', $exists: true }
  };

  const count = await ProductSnapshot.countDocuments(matchQuery);
  if (count === 0) {
    console.log('✅ No products to delete.');
    return;
  }

  const result = await ProductSnapshot.deleteMany(matchQuery);
  console.log(`🗑️ Deleted ${result.deletedCount} products.`);
}

async function main() {
  await connectDB();
  await deleteUnfixedProducts();
  await mongoose.disconnect();
}

main();
